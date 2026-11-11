import { DateTime } from "luxon";
import { RRule, rrulestr, Weekday } from "rrule";
import { env } from "@/lib/env";
import type { Store } from "@/lib/db/store";
import type { CalendarConnection, EventRow } from "@/lib/types";
import type { OccurrenceException } from "@/lib/agents/conflict-engine";
import { authedFetch, channelToken } from "./oauth";
import { importExternalEvent, recordPush, type ExternalEvent } from "./sync-common";

/**
 * Microsoft Outlook / Microsoft 365 via Microsoft Graph v1.0.
 * Même contrat que Google : push, pull (calendarView), exceptions de
 * récurrence (instances supprimées / déplacées) et abonnements (webhooks).
 */

export const GRAPH = "https://graph.microsoft.com/v1.0";
type Ev = EventRow & { exceptions?: Record<string, OccurrenceException> };

const local = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm:ss");
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Conversion RRULE → patternedRecurrence (quotidien, hebdomadaire, mensuel). */
export function toGraphRecurrence(e: EventRow) {
  if (!e.recurrence_rule) return undefined;
  const o = rrulestr(e.recurrence_rule.replace(/^RRULE:/i, "")).origOptions;
  const start = DateTime.fromISO(e.starts_at, { zone: "utc" }).setZone(e.timezone);
  const interval = o.interval ?? 1;
  const byday = (Array.isArray(o.byweekday) ? o.byweekday : o.byweekday != null ? [o.byweekday] : []).map((d) => DAYS[typeof d === "number" ? d : (d as Weekday).weekday]);
  const pattern =
    o.freq === RRule.DAILY
      ? { type: "daily", interval }
      : o.freq === RRule.WEEKLY
        ? { type: "weekly", interval, daysOfWeek: byday.length ? byday : [DAYS[start.weekday - 1]], firstDayOfWeek: "monday" }
        : o.freq === RRule.MONTHLY
          ? { type: "absoluteMonthly", interval, dayOfMonth: start.day }
          : { type: "absoluteYearly", interval, dayOfMonth: start.day, month: start.month };
  const range = o.count
    ? { type: "numbered", startDate: start.toISODate(), numberOfOccurrences: o.count, recurrenceTimeZone: e.timezone }
    : o.until
      ? { type: "endDate", startDate: start.toISODate(), endDate: DateTime.fromJSDate(o.until).toISODate(), recurrenceTimeZone: e.timezone }
      : { type: "noEnd", startDate: start.toISODate(), recurrenceTimeZone: e.timezone };
  return { pattern, range };
}

export function toGraph(e: Ev) {
  return {
    subject: e.title,
    body: { contentType: "text", content: [e.description, e.meeting_url ? `Lien : ${e.meeting_url}` : null, "— Créé via CellConnect AI"].filter(Boolean).join("\n") },
    start: { dateTime: local(e.starts_at, e.timezone), timeZone: e.timezone },
    end: { dateTime: local(e.ends_at, e.timezone), timeZone: e.timezone },
    location: e.location ? { displayName: e.location } : undefined,
    recurrence: toGraphRecurrence(e),
    // Empêche les doublons si la création est rejouée (Graph).
    transactionId: e.id,
  };
}

async function applyExceptions(store: Store, c: CalendarConnection, e: Ev, seriesId: string) {
  const ex = Object.entries(e.exceptions ?? {});
  if (!ex.length) return;
  const times = ex.map(([orig]) => Date.parse(orig));
  const q = new URLSearchParams({ startDateTime: new Date(Math.min(...times) - 86400000).toISOString(), endDateTime: new Date(Math.max(...times) + 86400000).toISOString() });
  const res = await authedFetch(store, c, `${GRAPH}/me/events/${encodeURIComponent(seriesId)}/instances?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
  if (!res.ok) throw new Error(`Graph INSTANCES ${res.status}`);
  const { value = [] } = (await res.json()) as { value?: { id: string; originalStart?: string; start: { dateTime: string } }[] };
  for (const [orig, x] of ex) {
    const inst = value.find((v) => Date.parse(v.originalStart ?? `${v.start.dateTime}Z`) === Date.parse(orig));
    if (!inst) continue;
    if (x.cancelled) await authedFetch(store, c, `${GRAPH}/me/events/${encodeURIComponent(inst.id)}`, { method: "DELETE" });
    else if (x.start && x.end)
      await authedFetch(store, c, `${GRAPH}/me/events/${encodeURIComponent(inst.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ start: { dateTime: local(x.start, e.timezone), timeZone: e.timezone }, end: { dateTime: local(x.end, e.timezone), timeZone: e.timezone } }),
      });
  }
}

export async function pushEvent(store: Store, c: CalendarConnection, event: Ev, op: "upsert" | "delete") {
  const [rec] = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["event_id", "eq", event.id]] });
  if (rec?.direction === "pull") return null;
  if (op === "delete" || event.status === "cancelled") {
    if (!rec || rec.status === "deleted") return null;
    const res = await authedFetch(store, c, `${GRAPH}/me/events/${encodeURIComponent(rec.external_id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Graph DELETE ${res.status}`);
    await store.update("calendar_sync_records", rec.id, { status: "deleted", last_synced_at: new Date().toISOString() });
    return null;
  }
  const body = JSON.stringify(toGraph(event));
  const res =
    rec && rec.status !== "deleted"
      ? await authedFetch(store, c, `${GRAPH}/me/events/${encodeURIComponent(rec.external_id)}`, { method: "PATCH", body })
      : await authedFetch(store, c, `${GRAPH}/me/events`, { method: "POST", body });
  if (!res.ok) throw new Error(`Graph ${rec ? "PATCH" : "POST"} ${res.status}`);
  const g = (await res.json()) as { id: string; lastModifiedDateTime?: string };
  await recordPush(store, c, event.id, g.id, g.lastModifiedDateTime ?? null, rec);
  if (event.recurrence_rule) await applyExceptions(store, c, event, g.id);
  return { externalId: g.id, meetingUrl: null };
}

interface GraphEvent {
  id: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  showAs?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  lastModifiedDateTime: string;
  seriesMasterId?: string | null;
  transactionId?: string | null;
}

const utc = (s: string) => new Date(/Z|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`).toISOString();

export async function pullEvents(store: Store, c: CalendarConnection, now = new Date()) {
  const q = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: new Date(now.getTime() + 60 * 86400000).toISOString(),
    $top: "250",
    $select: "id,subject,start,end,isCancelled,isAllDay,showAs,location,lastModifiedDateTime,seriesMasterId,transactionId",
  });
  const res = await authedFetch(store, c, `${GRAPH}/me/calendarView?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
  if (!res.ok) throw new Error(`Graph CALENDARVIEW ${res.status}`);
  const { value = [] } = (await res.json()) as { value?: GraphEvent[] };
  const pushed = new Set((await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["direction", "eq", "push"]] })).map((r) => r.external_id));
  let imported = 0;
  for (const g of value) {
    if (pushed.has(g.id) || (g.seriesMasterId && pushed.has(g.seriesMasterId)) || g.transactionId) continue; // créés par CellConnect
    if (g.isAllDay || g.showAs === "free") continue;
    const x: ExternalEvent = {
      externalId: g.id,
      updated: g.lastModifiedDateTime,
      title: g.subject?.slice(0, 200) || "Occupé (Outlook)",
      location: g.location?.displayName?.slice(0, 300) || null,
      startsAt: utc(g.start.dateTime),
      endsAt: utc(g.end.dateTime),
      timezone: "Europe/Zurich",
      cancelled: Boolean(g.isCancelled),
    };
    if (await importExternalEvent(store, c, x, "outlook")) imported++;
  }
  await store.update("calendar_connections", c.id, { last_synced_at: new Date().toISOString(), last_error: null, status: "active" });
  return { imported, seen: value.length };
}

/** Abonnement Microsoft Graph aux changements (≈ 3 jours, renouvelé par le worker). */
export async function watch(store: Store, c: CalendarConnection) {
  if (!env.webhooksEnabled) return null;
  const expires = new Date(Date.now() + 4000 * 60000).toISOString();
  const body = { changeType: "created,updated,deleted", notificationUrl: `${env.appUrl}/api/calendar/outlook/webhook`, resource: "me/events", expirationDateTime: expires, clientState: channelToken(c.id) };
  const res = c.watch_channel_id
    ? await authedFetch(store, c, `${GRAPH}/subscriptions/${c.watch_channel_id}`, { method: "PATCH", body: JSON.stringify({ expirationDateTime: expires }) })
    : await authedFetch(store, c, `${GRAPH}/subscriptions`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Graph SUBSCRIPTION ${res.status}`);
  const s = (await res.json()) as { id: string; expirationDateTime: string };
  return store.update("calendar_connections", c.id, { watch_channel_id: s.id, watch_resource_id: "me/events", watch_expires_at: s.expirationDateTime });
}

export async function stopWatch(store: Store, c: CalendarConnection) {
  if (c.watch_channel_id) await authedFetch(store, c, `${GRAPH}/subscriptions/${c.watch_channel_id}`, { method: "DELETE" });
}
