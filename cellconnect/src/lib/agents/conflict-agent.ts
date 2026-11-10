import type { Ctx } from "@/lib/context";
import type { Store } from "@/lib/db/store";
import { UniqueViolationError } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { CalendarConflict, EventRow, ParticipantStatus } from "@/lib/types";
import type { ReadyDraft } from "@/lib/schemas/draft";
import { zonedToUtc, formatRangeFr } from "@/lib/time";
import { expandOccurrences, findInternalOverlaps, findOverlaps, type Occurrence, type Overlap } from "./conflict-engine";
import { notify } from "./notification-agent";

/**
 * ConflictManagerAgent — détection des chevauchements d'agenda.
 *
 * Un conflit concerne TOUJOURS une personne : deux événements ne sont en
 * conflit que si un même utilisateur participe activement aux deux
 * (statuts invited / accepted / tentative). Deux réunions de groupes
 * différents sans participant commun ne sont donc jamais signalées.
 */

export const ACTIVE_STATUSES: ParticipantStatus[] = ["invited", "accepted", "tentative"];
const WINDOW_PAST_MS = 1 * 86400000;
const WINDOW_FUTURE_MS = 400 * 86400000;

export function eventToSlot(e: EventRow) {
  return {
    eventId: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    recurrenceRule: e.recurrence_rule,
  };
}

/** Événements actifs d'un utilisateur (participation active, événement non annulé). */
export async function activeEventsForUser(store: Store, userId: string, orgId?: string): Promise<EventRow[]> {
  const parts = await store.select("event_participants", {
    where: [
      ["user_id", "eq", userId],
      ["status", "in", ACTIVE_STATUSES],
    ],
  });
  if (parts.length === 0) return [];
  const events = await store.select("events", {
    where: [
      ["id", "in", parts.map((p) => p.event_id)],
      ["status", "neq", "cancelled"],
    ],
  });
  return orgId ? events.filter((e) => e.organization_id === orgId) : events;
}

export function occurrencesOf(events: EventRow[], from: number, to: number): Occurrence[] {
  return events.flatMap((e) => expandOccurrences(eventToSlot(e), from, to));
}

export interface DraftConflict {
  draftKey: string;
  kind: Overlap["kind"];
  overlapMinutes: number;
  /** Événement existant de l'utilisateur (visible par lui seul ici). */
  existing?: { id: string; title: string; start: string; end: string; isOrganizer: boolean; groupId: string | null };
  /** Autre brouillon du même lot. */
  otherDraftKey?: string;
}

export function draftToInstants(d: ReadyDraft) {
  const start = zonedToUtc(d.date, d.startTime, d.timezone).iso;
  let end = zonedToUtc(d.date, d.endTime, d.timezone).iso;
  // Fin <= début : on considère que l'événement se termine le lendemain.
  if (Date.parse(end) <= Date.parse(start)) {
    const next = new Date(Date.parse(`${d.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    end = zonedToUtc(next, d.endTime, d.timezone).iso;
  }
  return { start, end };
}

/** Vérifie des brouillons (avant création) contre l'agenda de l'utilisateur et entre eux. */
export async function checkDrafts(ctx: Ctx, drafts: ReadyDraft[], bufferMinutes = 0): Promise<DraftConflict[]> {
  const now = ctx.now().getTime();
  const existing = await activeEventsForUser(ctx.store, ctx.userId, ctx.orgId);
  const existingOcc = occurrencesOf(existing, now - WINDOW_PAST_MS, now + WINDOW_FUTURE_MS);
  const byId = new Map(existing.map((e) => [e.id, e]));
  const draftOcc: Occurrence[] = drafts.flatMap((d) => {
    const { start, end } = draftToInstants(d);
    return expandOccurrences(
      { eventId: `draft:${d.key}`, title: d.title, startsAt: start, endsAt: end, timezone: d.timezone, recurrenceRule: d.recurrenceRule },
      now - WINDOW_PAST_MS,
      now + WINDOW_FUTURE_MS,
    );
  });

  const out: DraftConflict[] = [];
  for (const o of findOverlaps(draftOcc, existingOcc, bufferMinutes)) {
    const e = byId.get(o.b.eventId)!;
    out.push({
      draftKey: o.a.eventId.slice(6),
      kind: o.kind,
      overlapMinutes: o.overlapMinutes,
      existing: {
        id: e.id,
        title: e.title,
        start: new Date(o.b.start).toISOString(),
        end: new Date(o.b.end).toISOString(),
        isOrganizer: e.created_by === ctx.userId,
        groupId: e.group_id,
      },
    });
  }
  for (const o of findInternalOverlaps(draftOcc, bufferMinutes)) {
    out.push({ draftKey: o.a.eventId.slice(6), otherDraftKey: o.b.eventId.slice(6), kind: o.kind, overlapMinutes: o.overlapMinutes });
  }
  return out;
}

/**
 * Détecte et enregistre les conflits d'un utilisateur impliquant un événement
 * donné (après création, modification, acceptation d'invitation…).
 * Les conflits déjà connus ne sont pas dupliqués ; ceux qui n'existent plus
 * (événement déplacé) sont clos.
 */
export async function detectForUserEvent(
  store: Store,
  mailer: ChannelSender,
  userId: string,
  eventId: string,
  now: Date,
  opts: { notify?: boolean } = {},
): Promise<CalendarConflict[]> {
  const event = await store.get("events", eventId);
  if (!event) return [];
  const profile = await store.get("profiles", userId);
  const buffer = profile?.travel_buffer_minutes ?? 0;
  const from = now.getTime() - WINDOW_PAST_MS;
  const to = now.getTime() + WINDOW_FUTURE_MS;

  const others = (await activeEventsForUser(store, userId, event.organization_id)).filter((e) => e.id !== eventId);
  const [participation] = await store.select("event_participants", {
    where: [
      ["event_id", "eq", eventId],
      ["user_id", "eq", userId],
    ],
  });
  const active = event.status !== "cancelled" && participation && ACTIVE_STATUSES.includes(participation.status);
  const overlaps = active ? findOverlaps(expandOccurrences(eventToSlot(event), from, to), occurrencesOf(others, from, to), buffer) : [];

  // Clôture des conflits ouverts devenus obsolètes.
  const open = (await store.select("calendar_conflicts", { where: [["user_id", "eq", userId], ["status", "in", ["open", "postponed"]]] })).filter(
    (c) => c.event_a_id === eventId || c.event_b_id === eventId,
  );
  for (const c of open) {
    const still = overlaps.some((o) => {
      const [a, b] = o.a.eventId < o.b.eventId ? [o.a, o.b] : [o.b, o.a];
      return c.event_a_id === a.eventId && c.event_b_id === b.eventId && c.occurrence_a_start === new Date(a.start).toISOString() && c.occurrence_b_start === new Date(b.start).toISOString();
    });
    if (!still) await store.update("calendar_conflicts", c.id, { status: "dismissed", resolved_at: now.toISOString() });
  }

  const created: CalendarConflict[] = [];
  for (const o of overlaps) {
    // Ordre canonique pour garantir l'unicité (A < B).
    const [a, b] = o.a.eventId < o.b.eventId ? [o.a, o.b] : [o.b, o.a];
    const row = {
      organization_id: event.organization_id,
      user_id: userId,
      event_a_id: a.eventId,
      event_b_id: b.eventId,
      occurrence_a_start: new Date(a.start).toISOString(),
      occurrence_a_end: new Date(a.end).toISOString(),
      occurrence_b_start: new Date(b.start).toISOString(),
      occurrence_b_end: new Date(b.end).toISOString(),
      overlap_minutes: o.overlapMinutes,
      kind: o.kind,
      status: "open" as const,
      detected_at: now.toISOString(),
      resolved_at: null,
    };
    const existing = await store.select("calendar_conflicts", {
      where: [
        ["user_id", "eq", userId],
        ["event_a_id", "eq", row.event_a_id],
        ["event_b_id", "eq", row.event_b_id],
        ["occurrence_a_start", "eq", row.occurrence_a_start],
        ["occurrence_b_start", "eq", row.occurrence_b_start],
      ],
    });
    if (existing.length > 0) {
      const ex = existing[0];
      if (ex.status === "dismissed") created.push(await store.update("calendar_conflicts", ex.id, { status: "open", resolved_at: null, overlap_minutes: row.overlap_minutes, kind: row.kind }));
      continue;
    }
    try {
      const c = await store.insert("calendar_conflicts", row);
      created.push(c);
    } catch (e) {
      if (!(e instanceof UniqueViolationError)) throw e;
    }
  }

  if (opts.notify !== false) {
    for (const c of created) {
      const other = await store.get("events", c.event_a_id === eventId ? c.event_b_id : c.event_a_id);
      await notify(
        store,
        {
          userId,
          orgId: event.organization_id,
          type: "conflict_detected",
          title: "Conflit d'agenda détecté",
          body: `« ${event.title} » chevauche « ${other?.title ?? "un autre événement"} » (${c.kind === "travel_buffer" ? "temps de déplacement insuffisant" : `${c.overlap_minutes} min`}) le ${formatRangeFr(c.occurrence_a_start, c.occurrence_a_end, event.timezone)}.`,
          data: { conflictId: c.id },
          dedupeKey: `conflict:${c.id}`,
        },
        mailer,
        now,
      );
    }
  }
  return created;
}

/** Relance la détection pour tous les participants actifs d'un événement. */
export async function detectForEventParticipants(store: Store, mailer: ChannelSender, eventId: string, now: Date) {
  const parts = await store.select("event_participants", { where: [["event_id", "eq", eventId]] });
  for (const p of parts) await detectForUserEvent(store, mailer, p.user_id, eventId, now);
}

/** Clôt les conflits d'un utilisateur liés à un événement (désistement, annulation). */
export async function closeConflictsForEvent(store: Store, eventId: string, now: Date, userId?: string) {
  const open = [
    ...(await store.select("calendar_conflicts", { where: [["event_a_id", "eq", eventId], ["status", "in", ["open", "postponed"]]] })),
    ...(await store.select("calendar_conflicts", { where: [["event_b_id", "eq", eventId], ["status", "in", ["open", "postponed"]]] })),
  ];
  for (const c of open) {
    if (!userId || c.user_id === userId) {
      await store.update("calendar_conflicts", c.id, { status: "resolved", resolved_at: now.toISOString() });
    }
  }
}
