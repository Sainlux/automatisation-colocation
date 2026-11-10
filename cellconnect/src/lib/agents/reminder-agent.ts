import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { EventRow } from "@/lib/types";
import { expandOccurrences } from "./conflict-engine";
import { notify } from "./notification-agent";
import { formatRangeFr } from "@/lib/time";

/**
 * ReminderAgent — programmation des rappels (24 h, 2 h, 30 min, personnalisé).
 *
 * Chaque rappel a une clé `dedupe_key` (événement, utilisateur, occurrence,
 * délai) : reprogrammer ne crée jamais de doublon. Annulation ou départ du
 * participant => rappels annulés. Déplacement => anciens rappels annulés et
 * nouveaux calculés.
 */

export const DEFAULT_REMINDER_OFFSETS = [1440, 120, 30];
const HORIZON_DAYS = 90;

export function offsetLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} jour${minutes >= 2880 ? "s" : ""}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

export async function scheduleForParticipant(store: Store, event: EventRow, userId: string, offsets: number[], now: Date) {
  if (event.status === "cancelled") return [];
  const from = now.getTime();
  const occurrences = expandOccurrences(
    { eventId: event.id, title: event.title, startsAt: event.starts_at, endsAt: event.ends_at, timezone: event.timezone, recurrenceRule: event.recurrence_rule },
    from,
    from + HORIZON_DAYS * 86400000,
  );
  const existing = await store.select("reminders", {
    where: [
      ["event_id", "eq", event.id],
      ["user_id", "eq", userId],
    ],
  });
  const keys = new Set(existing.map((r) => r.dedupe_key));
  const rows = [];
  for (const occ of occurrences) {
    for (const offset of [...new Set(offsets)].filter((o) => o > 0 && o <= 40320)) {
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
        status: "scheduled" as const,
        dedupe_key: dedupe,
        sent_at: null,
      });
    }
  }
  return store.insertMany("reminders", rows);
}

export async function cancelReminders(store: Store, eventId: string, userId?: string) {
  const where: [string, "eq", unknown][] = [
    ["event_id", "eq", eventId],
    ["status", "eq", "scheduled"],
  ];
  if (userId) where.push(["user_id", "eq", userId]);
  const rows = await store.select("reminders", { where: where as never });
  // Le changement de clé libère la clé d'origine pour une reprogrammation propre.
  for (const r of rows) await store.update("reminders", r.id, { status: "cancelled", dedupe_key: `${r.dedupe_key}:cancelled:${r.id}` });
  return rows.length;
}

/** Reprogramme les rappels de tous les participants actifs après un déplacement. */
export async function rescheduleEvent(store: Store, event: EventRow, now: Date) {
  await cancelReminders(store, event.id);
  const participants = await store.select("event_participants", {
    where: [
      ["event_id", "eq", event.id],
      ["status", "in", ["accepted", "tentative", "invited"]],
    ],
  });
  for (const p of participants) {
    const profile = await store.get("profiles", p.user_id);
    await scheduleForParticipant(store, event, p.user_id, profile?.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS, now);
  }
}

/** Envoie les rappels arrivés à échéance (worker / cron). */
export async function processDueReminders(store: Store, sender: ChannelSender, now = new Date()) {
  const due = await store.select("reminders", {
    where: [
      ["status", "eq", "scheduled"],
      ["remind_at", "lte", now.toISOString()],
    ],
    limit: 200,
  });
  // Si plusieurs rappels d'une même occurrence sont dus (worker en retard), seul le plus récent est envoyé.
  const latest = new Map<string, (typeof due)[number]>();
  for (const r of due) {
    const k = `${r.event_id}:${r.user_id}:${r.occurrence_start}`;
    const cur = latest.get(k);
    if (!cur || r.remind_at > cur.remind_at) latest.set(k, r);
  }
  for (const r of due) {
    if (latest.get(`${r.event_id}:${r.user_id}:${r.occurrence_start}`) !== r) await store.update("reminders", r.id, { status: "cancelled" });
  }
  let sent = 0;
  for (const r of latest.values()) {
    const event = await store.get("events", r.event_id);
    const [participant] = await store.select("event_participants", {
      where: [
        ["event_id", "eq", r.event_id],
        ["user_id", "eq", r.user_id],
      ],
    });
    if (!event || event.status === "cancelled" || !participant || ["declined", "withdrawn"].includes(participant.status)) {
      await store.update("reminders", r.id, { status: "cancelled" });
      continue;
    }
    // Rappel trop ancien (ex. worker arrêté plusieurs heures) : inutile après le début.
    if (Date.parse(r.occurrence_start) < now.getTime()) {
      await store.update("reminders", r.id, { status: "cancelled" });
      continue;
    }
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
  }
  return sent;
}
