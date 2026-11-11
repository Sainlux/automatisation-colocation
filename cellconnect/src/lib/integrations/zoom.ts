import type { Store } from "@/lib/db/store";
import type { CalendarConnection, EventRow } from "@/lib/types";
import { authedFetch } from "./oauth";
import { recordPush } from "./sync-common";

/**
 * Zoom (API REST v2, OAuth utilisateur, portée meeting:write).
 * Crée une réunion pour un événement ; l'identifiant Zoom est conservé
 * (calendar_sync_records) pour la mettre à jour ou la supprimer ensuite.
 */

const API = "https://api.zoom.us/v2";

export async function createMeeting(store: Store, c: CalendarConnection, e: EventRow) {
  const body = {
    topic: e.title.slice(0, 200),
    // 2 = réunion programmée ; 3 = récurrente sans horaire fixe (lien réutilisable pour toute la série)
    type: e.recurrence_rule ? 3 : 2,
    start_time: e.starts_at.replace(/\.\d{3}Z$/, "Z"),
    duration: Math.max(1, Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000)),
    timezone: e.timezone,
    agenda: e.description?.slice(0, 2000) ?? undefined,
    settings: { join_before_host: false, waiting_room: true },
  };
  const res = await authedFetch(store, c, `${API}/users/me/meetings`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Zoom POST ${res.status}`);
  const m = (await res.json()) as { id: number; join_url: string };
  if (!m.join_url?.startsWith("https://")) throw new Error("Réponse Zoom sans lien de réunion valide.");
  await recordPush(store, c, e.id, String(m.id), null);
  return { externalId: String(m.id), meetingUrl: m.join_url };
}

/** Répercute un déplacement ou une annulation sur la réunion Zoom existante. */
export async function pushEvent(store: Store, c: CalendarConnection, e: EventRow, op: "upsert" | "delete") {
  const [rec] = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["event_id", "eq", e.id]] });
  if (!rec || rec.status === "deleted") return null; // aucune réunion Zoom n'a été créée pour cet événement
  if (op === "delete" || e.status === "cancelled") {
    const res = await authedFetch(store, c, `${API}/meetings/${rec.external_id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Zoom DELETE ${res.status}`);
    await store.update("calendar_sync_records", rec.id, { status: "deleted", last_synced_at: new Date().toISOString() });
    return null;
  }
  const res = await authedFetch(store, c, `${API}/meetings/${rec.external_id}`, {
    method: "PATCH",
    body: JSON.stringify({ topic: e.title.slice(0, 200), start_time: e.starts_at.replace(/\.\d{3}Z$/, "Z"), duration: Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000), timezone: e.timezone }),
  });
  if (!res.ok) throw new Error(`Zoom PATCH ${res.status}`);
  await store.update("calendar_sync_records", rec.id, { last_synced_at: new Date().toISOString() });
  return null;
}
