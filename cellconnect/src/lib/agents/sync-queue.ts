import type { Store } from "@/lib/db/store";
import { UniqueViolationError } from "@/lib/db/store";
import type { EventRow } from "@/lib/types";

/**
 * File persistante des synchronisations vers les calendriers externes.
 * Une tâche n'est créée que si l'utilisateur a connecté un calendrier
 * (autorisation OAuth explicite). Le traitement est fait par le worker.
 */
export async function enqueueSyncForEvent(store: Store, userId: string, event: EventRow, op: "upsert" | "delete") {
  const connections = await store.select("calendar_connections", {
    where: [
      ["user_id", "eq", userId],
      ["status", "eq", "active"],
    ],
  });
  for (const c of connections) {
    try {
      await store.insert("agent_tasks", {
        organization_id: event.organization_id,
        user_id: userId,
        agent: "CalendarAgent",
        type: `sync.${c.provider}.${op}`,
        status: "pending",
        input: { connectionId: c.id, eventId: event.id, version: event.version },
        output: null,
        error: null,
        attempts: 0,
        run_after: new Date().toISOString(),
        idempotency_key: `sync:${c.id}:${event.id}:${event.version}:${op}`,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      if (!(e instanceof UniqueViolationError)) throw e;
    }
  }
}
