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

/** Journalisation applicative structurée (JSON sur stdout). */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
