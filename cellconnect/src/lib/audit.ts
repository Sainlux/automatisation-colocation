import type { Store } from "@/lib/db/store";

/** Journal d'audit structuré : chaque action significative laisse une trace. */
export async function audit(
  store: Store,
  entry: {
    orgId: string | null;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await store.insert("audit_logs", {
    organization_id: entry.orgId,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Remplace les adresses e-mail par « [email] » (minimisation des données dans les journaux). */
export function maskEmails(text: string): string {
  return text.replace(EMAIL_RE, "[email]");
}

/** Journalisation applicative structurée (JSON sur stdout), adresses e-mail masquées. */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  const line = maskEmails(JSON.stringify({ level, msg, time: new Date().toISOString(), ...data }));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
