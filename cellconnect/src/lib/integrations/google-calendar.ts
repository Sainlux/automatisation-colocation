import { env } from "@/lib/env";
import type { Store } from "@/lib/db/store";
import type { CalendarConnection, EventRow } from "@/lib/types";
import type { OccurrenceException } from "@/lib/agents/conflict-engine";
import { authedFetch, channelToken } from "./oauth";
import { importExternalEvent, recordPush, type ExternalEvent } from "./sync-common";

/**
 * Google Calendar (API REST v3).
 * - push : événements CellConnect → calendrier principal (id externe conservé) ;
 * - pull : événements Google (60 jours) → événements privés pour les conflits ;
 * - Google Meet : création du lien via conferenceData (jamais inventé) ;
 * - webhooks : events.watch + renouvellement, avec la synchronisation périodique en secours.
 */

const API = "https://www.googleapis.com/calendar/v3";
const cal = (c: CalendarConnection) => `${API}/calendars/${encodeURIComponent(c.calendar_id)}`;

type Ev = EventRow & { exceptions?: Record<string, OccurrenceException> };

/** Identifiant d'instance Google d'une série : <idSérie>_<début d'origine UTC, AAAAMMJJTHHMMSSZ>. */
export const instanceId = (seriesId: string, originalStart: string) => `${seriesId}_${new Date(originalStart).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;

/** Répercute les dates annulées (suppression d'instance) et déplacées (modification d'instance). */
async function applyExceptions(store: Store, c: CalendarConnection, e: Ev, seriesId: string) {
  for (const [orig, x] of Object.entries(e.exceptions ?? {})) {
    const url = `${cal(c)}/events/${encodeURIComponent(instanceId(seriesId, orig))}`;
    const res = x.cancelled
      ? await authedFetch(store, c, url, { method: "DELETE" })
      : x.start && x.end
        ? await authedFetch(store, c, url, { method: "PATCH", body: JSON.stringify({ start: { dateTime: x.start, timeZone: e.timezone }, end: { dateTime: x.end, timeZone: e.timezone } }) })
        : null;
    if (res && !res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google INSTANCE ${res.status}`);
  }
}

export function toGoogle(e: Ev) {
  const recurrence = e.recurrence_rule ? [`RRULE:${e.recurrence_rule.replace(/^RRULE:/i, "")}`] : undefined;
  return {
    summary: e.title,
    description: [e.description, e.meeting_url ? `Lien : ${e.meeting_url}` : null, "— Créé via CellConnect AI"].filter(Boolean).join("\n"),
    location: e.location ?? undefined,
    start: { dateTime: e.starts_at, timeZone: e.timezone },
    end: { dateTime: e.ends_at, timeZone: e.timezone },
    recurrence,
    extendedProperties: { private: { cellconnectId: e.id } },
  };
}

export async function pushEvent(store: Store, c: CalendarConnection, event: Ev, op: "upsert" | "delete", opts: { createMeet?: boolean } = {}) {
  const [rec] = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["event_id", "eq", event.id]] });
  if (rec?.direction === "pull") return null; // jamais réécrire un événement importé
  if (op === "delete" || event.status === "cancelled") {
    if (!rec || rec.status === "deleted") return null;
    const res = await authedFetch(store, c, `${cal(c)}/events/${encodeURIComponent(rec.external_id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google DELETE ${res.status}`);
    await store.update("calendar_sync_records", rec.id, { status: "deleted", last_synced_at: new Date().toISOString() });
    return null;
  }
  const body: Record<string, unknown> = toGoogle(event);
  if (opts.createMeet) body.conferenceData = { createRequest: { requestId: `cc-${event.id}-${event.version}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  const q = opts.createMeet ? "?conferenceDataVersion=1" : "";
  const res =
    rec && rec.status !== "deleted"
      ? await authedFetch(store, c, `${cal(c)}/events/${encodeURIComponent(rec.external_id)}${q}`, { method: "PATCH", body: JSON.stringify(body) })
      : await authedFetch(store, c, `${cal(c)}/events${q}`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Google ${rec ? "PATCH" : "POST"} ${res.status}`);
  const g = (await res.json()) as { id: string; updated: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  await recordPush(store, c, event.id, g.id, g.updated, rec);
  if (event.recurrence_rule) await applyExceptions(store, c, event, g.id);
  const meet = g.hangoutLink ?? g.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return { externalId: g.id, meetingUrl: meet };
}

interface GoogleEvent {
  id: string;
  status: string;
  summary?: string;
  location?: string;
  updated: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  transparency?: string;
  recurringEventId?: string;
}

export async function pullEvents(store: Store, c: CalendarConnection, now = new Date()) {
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 60 * 86400000).toISOString(),
    singleEvents: "true",
    maxResults: "250",
    orderBy: "startTime",
  });
  const res = await authedFetch(store, c, `${cal(c)}/events?${params}`);
  if (!res.ok) throw new Error(`Google LIST ${res.status}`);
  const { items = [] } = (await res.json()) as { items?: GoogleEvent[] };
  const pushed = new Set((await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["direction", "eq", "push"]] })).map((r) => r.external_id));
  const external: ExternalEvent[] = [];
  for (const g of items) {
    if (g.extendedProperties?.private?.cellconnectId || pushed.has(g.id) || (g.recurringEventId && pushed.has(g.recurringEventId))) continue;
    if (g.transparency === "transparent" || !g.start?.dateTime || !g.end?.dateTime) continue; // disponible / journée entière : non bloquant
    external.push({
      externalId: g.id,
      updated: g.updated,
      title: g.summary?.slice(0, 200) || "Occupé (Google)",
      location: g.location?.slice(0, 300) ?? null,
      startsAt: new Date(g.start.dateTime).toISOString(),
      endsAt: new Date(g.end.dateTime).toISOString(),
      timezone: g.start.timeZone ?? "Europe/Zurich",
      cancelled: g.status === "cancelled",
    });
  }
  let imported = 0;
  for (const x of external) if (await importExternalEvent(store, c, x, "google")) imported++;
  await store.update("calendar_connections", c.id, { last_synced_at: new Date().toISOString(), last_error: null, status: "active" });
  return { imported, seen: items.length };
}

/** Ouvre (ou renouvelle) un canal de notifications push Google pour ce calendrier. */
export async function watch(store: Store, c: CalendarConnection) {
  if (!env.webhooksEnabled) return null;
  const id = crypto.randomUUID();
  const res = await authedFetch(store, c, `${cal(c)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id, type: "web_hook", address: `${env.appUrl}/api/calendar/google/webhook`, token: channelToken(c.id), params: { ttl: String(7 * 86400) } }),
  });
  if (!res.ok) throw new Error(`Google WATCH ${res.status}`);
  const w = (await res.json()) as { resourceId: string; expiration?: string };
  if (c.watch_channel_id && c.watch_resource_id) await stopWatch(store, c).catch(() => undefined);
  return store.update("calendar_connections", c.id, {
    watch_channel_id: id,
    watch_resource_id: w.resourceId,
    watch_expires_at: w.expiration ? new Date(Number(w.expiration)).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
  });
}

export async function stopWatch(store: Store, c: CalendarConnection) {
  if (!c.watch_channel_id || !c.watch_resource_id) return;
  await authedFetch(store, c, `${API}/channels/stop`, { method: "POST", body: JSON.stringify({ id: c.watch_channel_id, resourceId: c.watch_resource_id }) });
}
