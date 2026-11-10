import "server-only";
import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { processDueReminders } from "@/lib/agents/reminder-agent";
import { processPendingDeliveries } from "@/lib/agents/notification-agent";
import { runExtractionJob } from "@/lib/agents/orchestrator";
import { detectForUserEvent, withExceptions } from "@/lib/agents/conflict-agent";
import type { CalendarConnection } from "@/lib/types";

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
  const report = { extractions: 0, reminders: 0, deliveries: 0, syncs: 0, syncErrors: 0, watches: 0 };

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

  // 4. Synchronisations externes (Google, Outlook, Zoom).
  const tasks = await store.select("agent_tasks", { where: [["status", "eq", "pending"], ["run_after", "lte", now.toISOString()]], limit: 20 });
  for (const t of tasks.filter((x) => x.type.startsWith("sync."))) {
    await store.update("agent_tasks", t.id, { status: "running", attempts: t.attempts + 1, updated_at: now.toISOString() });
    try {
      const { connectionId, eventId } = t.input as { connectionId: string; eventId: string };
      const conn = await store.get("calendar_connections", connectionId);
      const raw = await store.get("events", eventId);
      if (!conn || conn.status !== "active" || !raw) throw new Error("Connexion ou événement indisponible");
      const { isConfigured, pushEvent } = await import("@/lib/integrations");
      if (!isConfigured(conn)) throw new Error(`Fournisseur ${conn.provider} non configuré`);
      const [event] = await withExceptions(store, [raw]);
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

  // 5. Canaux de notification (webhooks) des calendriers : création / renouvellement.
  report.watches = await renewWatches(store, now);

  if (Object.values(report).some((v) => v > 0)) log("info", "worker_tick", report);
  return report;
}

async function renewWatches(store: Store, now: Date) {
  if (!env.webhooksEnabled) return 0;
  const { isConfigured, watch } = await import("@/lib/integrations");
  const conns = await store.select("calendar_connections", { where: [["status", "eq", "active"], ["provider", "in", ["google", "outlook"]]] });
  let n = 0;
  for (const c of conns) {
    if (!isConfigured(c)) continue;
    if (c.watch_expires_at && Date.parse(c.watch_expires_at) > now.getTime() + 24 * 3600000) continue;
    try {
      await watch(store, c);
      n++;
    } catch (e) {
      await store.update("calendar_connections", c.id, { last_error: `Webhook : ${(e as Error).message}`.slice(0, 500) });
    }
  }
  return n;
}

/** Importe les événements d'une connexion puis vérifie les conflits (webhook ou synchronisation). */
export async function syncConnection(store: Store, mailer: ChannelSender, c: CalendarConnection) {
  const { isConfigured, pullEvents } = await import("@/lib/integrations");
  if (!isConfigured(c) || c.provider === "zoom") return { imported: 0 };
  const r = await pullEvents(store, c);
  const recs = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["direction", "eq", "pull"]] });
  for (const rec of recs) await detectForUserEvent(store, mailer, c.user_id, rec.event_id, new Date());
  return r;
}

/** Synchronisation de secours (« pull ») des calendriers connectés. */
export async function pullAllConnections(store: Store, mailer: ChannelSender, userId?: string) {
  const conns = await store.select("calendar_connections", {
    where: userId ? [["user_id", "eq", userId], ["status", "eq", "active"], ["provider", "in", ["google", "outlook"]]] : [["status", "eq", "active"], ["provider", "in", ["google", "outlook"]]],
  });
  let pulled = 0;
  for (const c of conns) {
    try {
      pulled += (await syncConnection(store, mailer, c)).imported;
    } catch (e) {
      await store.update("calendar_connections", c.id, { last_error: (e as Error).message.slice(0, 500) });
    }
  }
  return { pulled };
}
