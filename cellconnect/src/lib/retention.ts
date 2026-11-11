import type { Store } from "@/lib/db/store";
import { audit } from "@/lib/audit";

/**
 * Politique de conservation (nLPD / RGPD — minimisation dans le temps).
 * Durées en jours, configurables par variables d'environnement.
 * La purge est lancée au plus une fois par jour par le worker / le cron.
 */
export interface RetentionPolicy {
  extractionDays: number; // analyses, brouillons, fichiers importés
  notificationDays: number; // notifications lues et livraisons
  auditDays: number; // journal d'audit
  closedConflictDays: number; // conflits résolus / écartés
  reminderDays: number; // rappels envoyés / annulés
  taskDays: number; // tâches techniques terminées
  idempotencyDays: number;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export function retentionPolicy(): RetentionPolicy {
  return {
    extractionDays: num(process.env.RETENTION_EXTRACTION_DAYS, 30),
    notificationDays: num(process.env.RETENTION_NOTIFICATION_DAYS, 180),
    auditDays: num(process.env.RETENTION_AUDIT_DAYS, 365),
    closedConflictDays: num(process.env.RETENTION_CONFLICT_DAYS, 180),
    reminderDays: num(process.env.RETENTION_REMINDER_DAYS, 90),
    taskDays: num(process.env.RETENTION_TASK_DAYS, 30),
    idempotencyDays: num(process.env.RETENTION_IDEMPOTENCY_DAYS, 7),
  };
}

const before = (now: Date, days: number) => new Date(now.getTime() - days * 86400000).toISOString();
const chunks = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function purgeExpiredData(store: Store, now: Date, policy = retentionPolicy(), deleteFile: (path: string) => Promise<void> = async () => undefined) {
  const report: Record<string, number> = {};

  // Analyses terminées / échouées et fichiers associés.
  const jobs = (await store.select("extraction_jobs", { where: [["created_at", "lt", before(now, policy.extractionDays)]] })).filter((j) => j.status !== "pending" && j.status !== "processing");
  const uploadIds = jobs.flatMap((j) => j.upload_ids);
  for (const ids of chunks(uploadIds)) {
    for (const u of await store.select("uploads", { where: [["id", "in", ids]] })) if (u.storage_path) await deleteFile(u.storage_path).catch(() => undefined);
    await store.deleteWhere("uploads", [["id", "in", ids]]);
  }
  for (const ids of chunks(jobs.map((j) => j.id))) {
    await store.deleteWhere("extracted_events", [["job_id", "in", ids]]);
    await store.deleteWhere("extraction_jobs", [["id", "in", ids]]);
  }
  report.extractions = jobs.length;

  // Notifications lues anciennes (+ livraisons).
  const notes = await store.select("notifications", { where: [["created_at", "lt", before(now, policy.notificationDays)]] });
  const readNotes = notes.filter((n) => n.read_at);
  for (const ids of chunks(readNotes.map((n) => n.id))) {
    await store.deleteWhere("notification_deliveries", [["notification_id", "in", ids]]);
    await store.deleteWhere("notifications", [["id", "in", ids]]);
  }
  report.notifications = readNotes.length;

  // Conflits clos.
  const conflicts = await store.select("calendar_conflicts", { where: [["status", "in", ["resolved", "dismissed"]], ["detected_at", "lt", before(now, policy.closedConflictDays)]] });
  for (const ids of chunks(conflicts.map((c) => c.id))) {
    await store.deleteWhere("conflict_resolutions", [["conflict_id", "in", ids]]);
    await store.deleteWhere("calendar_conflicts", [["id", "in", ids]]);
  }
  report.conflicts = conflicts.length;

  report.reminders = await store.deleteWhere("reminders", [["status", "in", ["sent", "cancelled", "failed"]], ["remind_at", "lt", before(now, policy.reminderDays)]]);
  report.tasks = await store.deleteWhere("agent_tasks", [["status", "in", ["completed", "failed"]], ["updated_at", "lt", before(now, policy.taskDays)]]);
  report.idempotency = await store.deleteWhere("idempotency_keys", [["created_at", "lt", before(now, policy.idempotencyDays)]]);
  report.audit = await store.deleteWhere("audit_logs", [["created_at", "lt", before(now, policy.auditDays)]]);

  await audit(store, { orgId: null, actorId: null, action: "retention.purged", entityType: "system", metadata: report });
  return report;
}

/** Vrai si la dernière purge date de plus de 23 h (état persistant via le journal d'audit). */
export async function purgeDue(store: Store, now: Date) {
  const [last] = await store.select("audit_logs", { where: [["action", "eq", "retention.purged"]], order: [{ column: "created_at", ascending: false }], limit: 1 });
  return !last || Date.parse(last.created_at) < now.getTime() - 23 * 3600000;
}
