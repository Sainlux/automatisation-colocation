import type { Store } from "@/lib/db/store";
import { UniqueViolationError, type NewRow } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { EventRow, Reminder } from "@/lib/types";
import { DEFAULT_REMINDER_OFFSETS, REMINDER_LIMITS } from "@/lib/schemas/reminder";
import { log } from "@/lib/audit";
import { expandOccurrences } from "./conflict-engine";
import { ACTIVE_STATUSES, eventToSlot, withExceptions, type EventWithExceptions } from "./conflict-agent";
import { notify } from "./notification-agent";
import { formatRangeFr } from "@/lib/time";

/**
 * ReminderAgent — programmation des rappels (24 h, 2 h, 30 min, personnalisé).
 *
 * Chaque rappel a une clé `dedupe_key` (événement, utilisateur, occurrence,
 * délai) : reprogrammer ne crée jamais de doublon. L'unicité ne porte que sur
 * les rappels « scheduled » (index unique partiel) : un rappel annulé garde sa
 * clé et libère la place pour une reprogrammation. Annulation ou départ du
 * participant => rappels annulés. Déplacement => anciens rappels annulés et
 * nouveaux calculés.
 *
 * Les rappels sont calculés sur un horizon glissant de 90 jours, prolongé une
 * fois par jour par le worker (extendRecurringReminders).
 */

export { DEFAULT_REMINDER_OFFSETS };
const HORIZON_DAYS = 90;

type ReminderInsert = NewRow<Reminder>;

/** Calcule les rappels manquants d'un participant (fonction pure, sans accès aux données). */
function buildReminderRows(event: EventWithExceptions, userId: string, offsets: number[], now: Date, keys: Set<string>): ReminderInsert[] {
  if (event.status === "cancelled") return [];
  const from = now.getTime();
  const occurrences = expandOccurrences(eventToSlot(event), from, from + HORIZON_DAYS * 86400000);
  const valid = [...new Set(offsets)].filter((o) => Number.isInteger(o) && o > 0 && o <= REMINDER_LIMITS.max);
  const rows: ReminderInsert[] = [];
  for (const occ of occurrences) {
    for (const offset of valid) {
      const remindAt = occ.start - offset * 60000;
      if (remindAt <= from) continue;
      const occIso = new Date(occ.start).toISOString();
      const dedupe = `${event.id}:${userId}:${occIso}:${offset}`;
      if (keys.has(dedupe)) continue;
      keys.add(dedupe);
      rows.push({
        event_id: event.id,
        organization_id: event.organization_id,
        user_id: userId,
        offset_minutes: offset,
        occurrence_start: occIso,
        remind_at: new Date(remindAt).toISOString(),
        status: "scheduled",
        dedupe_key: dedupe,
        sent_at: null,
      });
    }
  }
  return rows;
}

/**
 * Insère les rappels en un seul appel. Si une exécution concurrente a déjà
 * programmé certains rappels (index unique partiel), on retombe sur une
 * insertion ligne à ligne qui ignore les doublons.
 */
async function insertReminders(store: Store, rows: ReminderInsert[]): Promise<Reminder[]> {
  if (rows.length === 0) return [];
  try {
    return await store.insertMany("reminders", rows);
  } catch (e) {
    if (!(e instanceof UniqueViolationError)) throw e;
    const out: Reminder[] = [];
    for (const r of rows) {
      try {
        out.push(await store.insert("reminders", r));
      } catch (err) {
        if (!(err instanceof UniqueViolationError)) throw err;
      }
    }
    return out;
  }
}

/**
 * Clés des rappels déjà programmés ou envoyés (les rappels annulés ne bloquent pas).
 * Seules les occurrences à venir comptent : l'historique des rappels envoyés n'est pas relu.
 */
async function existingKeys(store: Store, eventIds: string[], now: Date, userId?: string): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const rows = await store.select("reminders", {
    where: [
      ["event_id", "in", eventIds],
      ["status", "in", ["scheduled", "sent"]],
      ["occurrence_start", "gte", now.toISOString()],
      ...(userId ? ([["user_id", "eq", userId]] as const) : []),
    ],
  });
  return new Set(rows.map((r) => r.dedupe_key));
}

export async function scheduleForParticipant(store: Store, raw: EventRow, userId: string, offsets: number[], now: Date) {
  if (raw.status === "cancelled") return [];
  const [event] = await withExceptions(store, [raw]);
  const keys = await existingKeys(store, [event.id], now, userId);
  return insertReminders(store, buildReminderRows(event, userId, offsets, now, keys));
}

/** Annule les rappels programmés d'un événement (d'un seul participant si userId est fourni), en un seul appel. */
export async function cancelReminders(store: Store, eventId: string, userId?: string) {
  const rows = await store.updateWhere(
    "reminders",
    [["event_id", "eq", eventId], ["status", "eq", "scheduled"], ...(userId ? ([["user_id", "eq", userId]] as const) : [])],
    { status: "cancelled" },
  );
  return rows.length;
}

/**
 * Programme les rappels de plusieurs participants pour un ensemble d'événements :
 * profils chargés en une requête, exceptions en une requête, rappels existants
 * en une requête, puis une seule insertion.
 */
async function scheduleParticipants(store: Store, events: EventRow[], now: Date): Promise<Reminder[]> {
  const live = events.filter((e) => e.status !== "cancelled");
  if (live.length === 0) return [];
  const ids = live.map((e) => e.id);
  const participants = await store.select("event_participants", { where: [["event_id", "in", ids], ["status", "in", ACTIVE_STATUSES]] });
  if (participants.length === 0) return [];
  const userIds = [...new Set(participants.map((p) => p.user_id))];
  const [profiles, withEx, keys] = await Promise.all([
    store.select("profiles", { where: [["id", "in", userIds]] }),
    withExceptions(store, live),
    existingKeys(store, ids, now),
  ]);
  const offsetsOf = new Map(profiles.map((p) => [p.id, p.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS]));
  const byId = new Map(withEx.map((e) => [e.id, e]));
  const rows: ReminderInsert[] = [];
  for (const p of participants) {
    const event = byId.get(p.event_id);
    if (event) rows.push(...buildReminderRows(event, p.user_id, offsetsOf.get(p.user_id) ?? DEFAULT_REMINDER_OFFSETS, now, keys));
  }
  return insertReminders(store, rows);
}

/** Reprogramme les rappels de tous les participants actifs après un déplacement. */
export async function rescheduleEvent(store: Store, event: EventRow, now: Date) {
  await cancelReminders(store, event.id);
  await scheduleParticipants(store, [event], now);
}

/**
 * Prolonge l'horizon de 90 jours des événements récurrents : sans cela, une
 * série hebdomadaire n'aurait plus de rappels au-delà des 90 premiers jours.
 * Idempotent (clés de déduplication) ; appelé au plus une fois par jour par le worker.
 */
export async function extendRecurringReminders(store: Store, now: Date) {
  const series = (await store.select("events", { where: [["recurrence_rule", "not_is", null], ["status", "neq", "cancelled"]] })).filter(
    (e) => !e.recurrence_until || Date.parse(e.recurrence_until) >= now.getTime(),
  );
  let created = 0;
  // Par lots, pour borner la taille des requêtes « in ».
  for (let i = 0; i < series.length; i += 50) created += (await scheduleParticipants(store, series.slice(i, i + 50), now)).length;
  return created;
}

/**
 * Applique de nouveaux délais personnels à toutes les participations futures
 * d'un utilisateur : anciens rappels annulés, nouveaux rappels programmés.
 */
export async function rescheduleUserReminders(store: Store, userId: string, offsets: number[], now: Date) {
  const parts = await store.select("event_participants", { where: [["user_id", "eq", userId], ["status", "in", ACTIVE_STATUSES]] });
  if (parts.length === 0) return 0;
  const events = (await store.select("events", { where: [["id", "in", parts.map((p) => p.event_id)], ["status", "neq", "cancelled"]] })).filter((e) =>
    e.recurrence_rule ? !e.recurrence_until || Date.parse(e.recurrence_until) >= now.getTime() : Date.parse(e.ends_at) >= now.getTime(),
  );
  let created = 0;
  for (const e of events) {
    await cancelReminders(store, e.id, userId);
    created += (await scheduleForParticipant(store, e, userId, offsets, now)).length;
  }
  return created;
}

/** Envoie les rappels arrivés à échéance (worker / cron). */
export async function processDueReminders(store: Store, sender: ChannelSender, now = new Date()) {
  const due = await store.select("reminders", {
    where: [
      ["status", "eq", "scheduled"],
      ["remind_at", "lte", now.toISOString()],
    ],
    order: [{ column: "remind_at", ascending: true }],
    limit: 200,
  });
  if (due.length === 0) return 0;
  // Si plusieurs rappels d'une même occurrence sont dus (worker en retard), seul le plus récent est envoyé.
  const occKey = (r: Reminder) => `${r.event_id}:${r.user_id}:${r.occurrence_start}`;
  const latest = new Map<string, Reminder>();
  for (const r of due) {
    const cur = latest.get(occKey(r));
    if (!cur || r.remind_at > cur.remind_at) latest.set(occKey(r), r);
  }
  const toCancel = due.filter((r) => latest.get(occKey(r)) !== r).map((r) => r.id);

  const eventIds = [...new Set(due.map((r) => r.event_id))];
  const userIds = [...new Set(due.map((r) => r.user_id))];
  const [events, participants] = await Promise.all([
    store.select("events", { where: [["id", "in", eventIds]] }),
    store.select("event_participants", { where: [["event_id", "in", eventIds], ["user_id", "in", userIds]] }),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const partOf = new Map(participants.map((p) => [`${p.event_id}:${p.user_id}`, p]));

  const toSend: { r: Reminder; event: EventRow }[] = [];
  for (const r of latest.values()) {
    const event = eventById.get(r.event_id);
    const participant = partOf.get(`${r.event_id}:${r.user_id}`);
    // Événement annulé, participant parti, ou rappel trop ancien (worker arrêté plusieurs heures) : inutile.
    if (!event || event.status === "cancelled" || !participant || ["declined", "withdrawn"].includes(participant.status) || Date.parse(r.occurrence_start) < now.getTime()) {
      toCancel.push(r.id);
      continue;
    }
    toSend.push({ r, event });
  }
  if (toCancel.length) await store.updateWhere("reminders", [["id", "in", toCancel], ["status", "eq", "scheduled"]], { status: "cancelled" });

  let sent = 0;
  for (const { r, event } of toSend) {
    try {
      const end = new Date(Date.parse(r.occurrence_start) + (Date.parse(event.ends_at) - Date.parse(event.starts_at))).toISOString();
      await notify(
        store,
        {
          userId: r.user_id,
          orgId: r.organization_id,
          type: "reminder",
          title: `Rappel : ${event.title}`,
          body: `${event.title} — ${formatRangeFr(r.occurrence_start, end, event.timezone)}${event.meeting_url ? `\nLien : ${event.meeting_url}` : ""}${event.location ? `\nLieu : ${event.location}` : ""}`,
          data: { eventId: event.id, occurrenceStart: r.occurrence_start },
          dedupeKey: `reminder:${r.id}`,
          email: true,
        },
        sender,
        now,
      );
      await store.update("reminders", r.id, { status: "sent", sent_at: now.toISOString() });
      sent++;
    } catch (e) {
      // Le rappel reste « scheduled » : il sera retenté au prochain passage (la notification est dédupliquée).
      log("warn", "reminder_failed", { reminderId: r.id, error: (e as Error).message });
    }
  }
  return sent;
}
