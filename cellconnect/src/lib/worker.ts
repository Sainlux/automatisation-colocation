import "server-only";
import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { extendRecurringReminders, processDueReminders } from "@/lib/agents/reminder-agent";
import { processPendingDeliveries } from "@/lib/agents/notification-agent";
import { runExtractionJob } from "@/lib/agents/orchestrator";
import { detectForUserEvents, withExceptions } from "@/lib/agents/conflict-agent";
import type { CalendarConnection } from "@/lib/types";
import { purgeDue, purgeExpiredData, retentionPolicy } from "@/lib/retention";

/**
 * Tâches de fond persistantes (sans Redis). Un « tick » traite, dans l'ordre :
 *  1. les rappels arrivés à échéance (le plus urgent pour l'utilisateur) ;
 *  2. les e-mails / push en attente ou à retenter ;
 *  3. les synchronisations de calendriers externes (file agent_tasks) ;
 *  4. au plus 2 analyses en attente (reprise après interruption) ;
 *  puis l'entretien : canaux de webhooks, prolongation quotidienne des rappels
 *  des séries, purge quotidienne de conservation.
 *
 * Chaque étape est isolée (une erreur n'empêche pas les suivantes) et le tick
 * respecte un budget de 45 s (fonction serverless limitée à 60 s) : les étapes
 * restantes sont reportées au passage suivant. L'état de chaque tâche est en
 * base : un redémarrage ne perd rien.
 * Appelé par `npm run worker` (boucle) ou par /api/cron/tick (Vercel Cron).
 */

/** Budget temps d'un tick (ms). */
export const TICK_BUDGET_MS = 45000;
/** Miroir de MAX_ATTEMPTS de l'orchestrateur (analyses). */
const EXTRACTION_MAX_ATTEMPTS = 3;
/** Une analyse « processing » sans nouvelles depuis 2 min est considérée comme interrompue. */
const EXTRACTION_STUCK_MS = 2 * 60000;
/** Analyses lancées au plus par tick (appels IA coûteux). */
const EXTRACTIONS_PER_TICK = 2;
const TASK_MAX_ATTEMPTS = 5;
/** Une tâche « running » depuis plus de 10 min est considérée comme interrompue. */
const TASK_STUCK_MS = 10 * 60000;

export interface TickReport {
  extractions: number;
  reminders: number;
  deliveries: number;
  syncs: number;
  syncErrors: number;
  watches: number;
  extended: number;
  purged: number;
  /** Étapes en erreur (journalisées) ou reportées faute de temps. */
  failedSteps: number;
  skippedSteps: number;
}

export async function tick(store: Store, mailer: ChannelSender, now = new Date()): Promise<TickReport> {
  const report: TickReport = { extractions: 0, reminders: 0, deliveries: 0, syncs: 0, syncErrors: 0, watches: 0, extended: 0, purged: 0, failedSteps: 0, skippedSteps: 0 };
  const started = performance.now();

  const step = async (name: string, fn: () => Promise<void>) => {
    if (performance.now() - started > TICK_BUDGET_MS) {
      report.skippedSteps++;
      log("warn", "worker_step_skipped", { step: name, reason: "budget" });
      return;
    }
    try {
      await fn();
    } catch (e) {
      report.failedSteps++;
      log("error", "worker_step_failed", { step: name, error: (e as Error).message });
    }
  };

  await step("reminders", async () => {
    report.reminders = await processDueReminders(store, mailer, now);
  });
  await step("deliveries", async () => {
    report.deliveries = (await processPendingDeliveries(store, mailer, now)).length;
  });
  await step("syncs", async () => {
    const r = await processSyncTasks(store, now);
    report.syncs = r.syncs;
    report.syncErrors = r.errors;
  });
  await step("extractions", async () => {
    report.extractions = await processExtractions(store, mailer, now);
  });
  await step("watches", async () => {
    report.watches = await renewWatches(store, now);
  });
  await step("extend_reminders", async () => {
    if (await dailyDue(store, "reminders.extended", now)) {
      report.extended = await extendRecurringReminders(store, now);
      await markDaily(store, "reminders.extended", now, { created: report.extended });
    }
  });
  await step("purge", async () => {
    if (await purgeDue(store, now)) {
      const { deleteObject } = await import("@/lib/storage");
      const purged = await purgeExpiredData(store, now, retentionPolicy(), deleteObject);
      report.purged = Object.values(purged).reduce((a, b) => a + b, 0);
    }
  });

  if (Object.values(report).some((v) => v > 0)) log("info", "worker_tick", { ...report });
  return report;
}

/** Vrai si la tâche quotidienne `action` n'a pas tourné depuis plus de 23 h (même garde que purgeDue). */
async function dailyDue(store: Store, action: string, now: Date) {
  const [last] = await store.select("audit_logs", { where: [["action", "eq", action]], order: [{ column: "created_at", ascending: false }], limit: 1 });
  return !last || Date.parse(last.created_at) < now.getTime() - 23 * 3600000;
}

async function markDaily(store: Store, action: string, now: Date, metadata: Record<string, unknown>) {
  await store.insert("audit_logs", { organization_id: null, actor_id: null, action, entity_type: "system", entity_id: null, metadata, created_at: now.toISOString() });
}

/** Synchronisations sortantes (Google, Outlook, Zoom) : reprise des tâches bloquées puis prise atomique. */
async function processSyncTasks(store: Store, now: Date) {
  const nowIso = now.toISOString();
  // Tâches « running » interrompues (processus arrêté en cours d'envoi).
  const stuck = await store.select("agent_tasks", {
    where: [["status", "eq", "running"], ["updated_at", "lte", new Date(now.getTime() - TASK_STUCK_MS).toISOString()]],
    order: [{ column: "updated_at", ascending: true }],
    limit: 20,
  });
  for (const t of stuck) {
    const failed = t.attempts >= TASK_MAX_ATTEMPTS;
    await store.updateWhere("agent_tasks", [["id", "eq", t.id], ["status", "eq", "running"], ["updated_at", "eq", t.updated_at]], {
      status: failed ? "failed" : "pending",
      error: failed ? "Synchronisation interrompue à plusieurs reprises." : t.error,
      run_after: nowIso,
      updated_at: nowIso,
    });
  }

  const tasks = await store.select("agent_tasks", {
    where: [["status", "eq", "pending"], ["run_after", "lte", nowIso]],
    order: [{ column: "run_after", ascending: true }],
    limit: 20,
  });
  let syncs = 0;
  let errors = 0;
  for (const t of tasks.filter((x) => x.type.startsWith("sync."))) {
    // Prise atomique : une seule exécution traite la tâche, même avec deux ticks simultanés.
    const [claimed] = await store.updateWhere("agent_tasks", [["id", "eq", t.id], ["status", "eq", "pending"]], { status: "running", attempts: t.attempts + 1, updated_at: nowIso });
    if (!claimed) continue;
    try {
      const { connectionId, eventId } = claimed.input as { connectionId: string; eventId: string };
      const [conn, raw] = await Promise.all([store.get("calendar_connections", connectionId), store.get("events", eventId)]);
      if (!conn || conn.status !== "active" || !raw) throw new Error("Connexion ou événement indisponible");
      const { isConfigured, pushEvent } = await import("@/lib/integrations");
      if (!isConfigured(conn)) throw new Error(`Fournisseur ${conn.provider} non configuré`);
      const [event] = await withExceptions(store, [raw]);
      await pushEvent(store, conn, event, claimed.type.endsWith(".delete") ? "delete" : "upsert");
      await store.update("agent_tasks", claimed.id, { status: "completed", output: { ok: true }, updated_at: nowIso });
      syncs++;
    } catch (e) {
      const failed = claimed.attempts >= TASK_MAX_ATTEMPTS;
      await store.update("agent_tasks", claimed.id, {
        status: failed ? "failed" : "pending",
        error: (e as Error).message.slice(0, 500),
        run_after: new Date(now.getTime() + 2 ** claimed.attempts * 60000).toISOString(),
        updated_at: nowIso,
      });
      errors++;
    }
  }
  return { syncs, errors };
}

/** Analyses en attente (le traitement immédiat a échoué ou été interrompu) : au plus 2 par tick. */
async function processExtractions(store: Store, mailer: ChannelSender, now: Date) {
  const nowIso = now.toISOString();
  // Analyses bloquées en « processing » depuis plus de 2 min : remises en attente.
  // Tentatives épuisées : l'orchestrateur les passe en échec et prévient l'utilisateur (sans appel IA).
  const stuck = await store.select("extraction_jobs", {
    where: [["status", "eq", "processing"], ["updated_at", "lte", new Date(now.getTime() - EXTRACTION_STUCK_MS).toISOString()]],
    order: [{ column: "updated_at", ascending: true }],
    limit: 10,
  });
  for (const j of stuck) {
    const [reset] = await store.updateWhere("extraction_jobs", [["id", "eq", j.id], ["status", "eq", "processing"], ["updated_at", "eq", j.updated_at]], { status: "pending", updated_at: nowIso });
    if (reset && j.attempts >= EXTRACTION_MAX_ATTEMPTS) await runExtractionJob(store, j.id, { mailer, now: () => now });
  }

  const pending = await store.select("extraction_jobs", {
    where: [["status", "eq", "pending"], ["updated_at", "lte", new Date(now.getTime() - 30000).toISOString()]],
    order: [{ column: "updated_at", ascending: true }],
    limit: EXTRACTIONS_PER_TICK,
  });
  let n = 0;
  for (const j of pending) {
    await runExtractionJob(store, j.id, { mailer });
    n++;
  }
  // Les analyses remises en attente à l'instant seront reprises au prochain passage (après 30 s).
  return n;
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

/**
 * Importe les événements d'une connexion puis vérifie les conflits (webhook ou
 * synchronisation) — uniquement pour les événements créés ou modifiés.
 */
export async function syncConnection(store: Store, mailer: ChannelSender, c: CalendarConnection, now = new Date()) {
  const { isConfigured } = await import("@/lib/integrations");
  if (!isConfigured(c) || (c.provider !== "google" && c.provider !== "outlook")) return { imported: 0, seen: 0, changedEventIds: [] as string[] };
  const provider = c.provider === "google" ? await import("@/lib/integrations/google-calendar") : await import("@/lib/integrations/outlook-calendar");
  const r = await provider.pullEvents(store, c, now);
  if (r.changedEventIds.length) await detectForUserEvents(store, mailer, c.user_id, r.changedEventIds, now);
  return r;
}

/** Synchronisation de secours (« pull ») des calendriers connectés. */
export async function pullAllConnections(store: Store, mailer: ChannelSender, userId?: string, now = new Date()) {
  const conns = await store.select("calendar_connections", {
    where: userId ? [["user_id", "eq", userId], ["status", "eq", "active"], ["provider", "in", ["google", "outlook"]]] : [["status", "eq", "active"], ["provider", "in", ["google", "outlook"]]],
  });
  let pulled = 0;
  for (const c of conns) {
    try {
      pulled += (await syncConnection(store, mailer, c, now)).imported;
    } catch (e) {
      await store.update("calendar_connections", c.id, { last_error: (e as Error).message.slice(0, 500) });
    }
  }
  return { pulled };
}
