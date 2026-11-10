import type { Store } from "@/lib/db/store";
import type { CalendarConnection, CalendarSyncRecord, EventSource } from "@/lib/types";

/** Logique commune aux calendriers externes (Google, Outlook). */

export interface ExternalEvent {
  externalId: string;
  updated: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  cancelled: boolean;
}

export async function recordPush(store: Store, c: CalendarConnection, eventId: string, externalId: string, updated: string | null, rec?: CalendarSyncRecord) {
  const now = new Date().toISOString();
  if (rec) return store.update("calendar_sync_records", rec.id, { external_id: externalId, external_updated_at: updated, status: "synced", error: null, last_synced_at: now });
  return store.insert("calendar_sync_records", {
    connection_id: c.id,
    event_id: eventId,
    external_id: externalId,
    direction: "push",
    external_updated_at: updated,
    status: "synced",
    error: null,
    last_synced_at: now,
  });
}

/**
 * Importe (ou met à jour) un événement externe comme événement PRIVÉ de
 * l'utilisateur, uniquement pour la détection de conflits. Renvoie true si créé.
 */
export async function importExternalEvent(store: Store, c: CalendarConnection, x: ExternalEvent, source: EventSource): Promise<boolean> {
  const [rec] = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["external_id", "eq", x.externalId]] });
  const fields = {
    title: x.title,
    location: x.location,
    starts_at: x.startsAt,
    ends_at: x.endsAt > x.startsAt ? x.endsAt : new Date(Date.parse(x.startsAt) + 60000).toISOString(),
    timezone: x.timezone,
    status: x.cancelled ? ("cancelled" as const) : ("confirmed" as const),
  };
  if (rec) {
    if (rec.direction === "push" || rec.external_updated_at === x.updated) return false;
    const ev = await store.get("events", rec.event_id);
    if (ev) await store.update("events", ev.id, { ...fields, version: ev.version + 1 });
    await store.update("calendar_sync_records", rec.id, { external_updated_at: x.updated, last_synced_at: new Date().toISOString() });
    return false;
  }
  if (x.cancelled) return false;
  const ev = await store.insert("events", {
    organization_id: c.organization_id,
    group_id: null,
    created_by: c.user_id,
    description: null,
    meeting_url: null,
    all_day: false,
    recurrence_rule: null,
    recurrence_until: null,
    visibility: "private",
    source,
    source_job_id: null,
    external_uid: x.externalId,
    version: 1,
    updated_at: new Date().toISOString(),
    ...fields,
  });
  await store.insert("event_participants", { event_id: ev.id, organization_id: c.organization_id, user_id: c.user_id, role: "organizer", status: "accepted", responded_at: null });
  await store.insert("calendar_sync_records", {
    connection_id: c.id,
    event_id: ev.id,
    external_id: x.externalId,
    direction: "pull",
    external_updated_at: x.updated,
    status: "synced",
    error: null,
    last_synced_at: new Date().toISOString(),
  });
  return true;
}
