import "server-only";
import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { processDueReminders } from "@/lib/agents/reminder-agent";
import { processPendingDeliveries } from "@/lib/agents/notification-agent";
import { runExtractionJob } from "@/lib/agents/orchestrator";
import { detectForUserEvent } from "@/lib/agents/conflict-agent";

/**
 * Tâches de fond persistantes (sans Redis) : un « tick » traite
 *  - les analyses en attente (reprise après interruption) ;
 *  - les rappels arrivés à échéance ;
 *  - les e-mails à (re)tenter ;
 *  - les synchronisations de calendriers externes.
 * Appelé par `npm run worker` (boucle) ou par /api/cron/tick (Vercel Cron).
 * L'état de chaque tâche est en base : un redémarrage ne perd rien.
 */
export async function tick(store: Store, mailer: ChannelSender, now = new Date()) {
  const report = { extractions: 0, reminders: 0, deliveries: 0, syncs: 0, syncErrors: 0 };

  // 1. Analyses en attente depuis plus de 30 s (le traitement immédiat a échoué ou été interrompu).
  const stale = new Date(now.getTime() - 30000).toISOString();
  const pending = await store.select("extraction_jobs", { where: [["status", "eq", "pending"], ["updated_at", "lte", stale]], limit: 5 });
  const stuck = await store.select("extraction_jobs", { where: [["status", "eq", "processing"], ["updated_at", "lte", new Date(now.getTime() - 10 * 60000).toISOString()]], limit: 5 });
  for (const j of stuck) await store.update("extraction_jobs", j.id, { status: "pending" });
  for (const j of [...pending, ...stuck]) {
    await runExtractionJob(store, j.id);
    report.extractions++;
  }

  // 2. Rappels.
  report.reminders = await processDueReminders(store, mailer, now);

  // 3. E-mails en attente / à retenter.
  report.deliveries = (await processPendingDeliveries(store, mailer, now)).length;

  // 4. Synchronisations externes.
  const tasks = await store.select("agent_tasks", { where: [["status", "eq", "pending"], ["run_after", "lte", now.toISOString()]], limit: 20 });
  for (const t of tasks.filter((x) => x.type.startsWith("sync."))) {
    await store.update("agent_tasks", t.id, { status: "running", attempts: t.attempts + 1, updated_at: now.toISOString() });
    try {
      const { connectionId, eventId } = t.input as { connectionId: string; eventId: string };
      const conn = await store.get("calendar_connections", connectionId);
      const event = await store.get("events", eventId);
      if (!conn || conn.status !== "active" || !event) throw new Error("Connexion ou événement indisponible");
      if (conn.provider !== "google" || !env.google.configured) throw new Error(`Fournisseur ${conn.provider} non configuré`);
      const { pushEvent } = await import("@/lib/integrations/google-calendar");
      await pushEvent(store, conn, event, t.type.endsWith(".delete") ? "delete" : "upsert");
      await store.update("agent_tasks", t.id, { status: "completed", output: { ok: true }, updated_at: now.toISOString() });
      report.syncs++;
    } catch (e) {
      const failed = t.attempts + 1 >= 5;
      await store.update("agent_tasks", t.id, {
        status: failed ? "failed" : "pending",
        error: (e as Error).message.slice(0, 500),
        run_after: new Date(now.getTime() + 2 ** (t.attempts + 1) * 60000).toISOString(),
        updated_at: now.toISOString(),
      });
      report.syncErrors++;
    }
  }

  if (Object.values(report).some((v) => v > 0)) log("info", "worker_tick", report);
  return report;
}

/** Synchronisation de secours (« pull ») des calendriers connectés. */
export async function pullAllConnections(store: Store, mailer: ChannelSender, userId?: string) {
  if (!env.google.configured) return { pulled: 0 };
  const { pullEvents } = await import("@/lib/integrations/google-calendar");
  const conns = await store.select("calendar_connections", { where: userId ? [["user_id", "eq", userId], ["status", "eq", "active"]] : [["status", "eq", "active"]] });
  let pulled = 0;
  for (const c of conns) {
    try {
      const r = await pullEvents(store, c);
      pulled += r.imported;
      // Vérification des conflits après synchronisation.
      const recs = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["direction", "eq", "pull"]] });
      for (const rec of recs) await detectForUserEvent(store, mailer, c.user_id, rec.event_id, new Date());
    } catch (e) {
      await store.update("calendar_connections", c.id, { last_error: (e as Error).message.slice(0, 500) });
    }
  }
  return { pulled };
}
