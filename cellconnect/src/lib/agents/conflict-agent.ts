import type { Ctx } from "@/lib/context";
import type { Store } from "@/lib/db/store";
import { UniqueViolationError, type Filter } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { CalendarConflict, EventRow, ParticipantStatus } from "@/lib/types";
import type { ReadyDraft } from "@/lib/schemas/draft";
import { zonedToUtc, formatRangeFr } from "@/lib/time";
import { expandOccurrences, findInternalOverlaps, findOverlaps, type Occurrence, type OccurrenceException, type Overlap } from "./conflict-engine";
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
/** Vérification des brouillons (avant enregistrement) : toute l'année à venir et au-delà. */
const WINDOW_FUTURE_MS = 400 * 86400000;
/**
 * Conflits enregistrés en base : horizon de 90 jours pour les séries, comme les
 * rappels. Au-delà, deux séries hebdomadaires produiraient des centaines de
 * lignes inutiles ; les dates plus lointaines sont détectées lors des
 * vérifications suivantes. Un événement ponctuel est vérifié jusqu'à sa date.
 */
const PERSIST_FUTURE_MS = 90 * 86400000;

/** Événement accompagné de ses exceptions d'occurrences (récurrences). */
export type EventWithExceptions = EventRow & { exceptions?: Record<string, OccurrenceException> };

export function eventToSlot(e: EventWithExceptions) {
  return {
    eventId: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    recurrenceRule: e.recurrence_rule,
    exceptions: e.exceptions,
  };
}

/** Charge les exceptions (event_occurrences) des événements récurrents. */
export async function withExceptions<T extends EventRow>(store: Store, events: T[]): Promise<(T & { exceptions?: Record<string, OccurrenceException> })[]> {
  const ids = events.filter((e) => e.recurrence_rule).map((e) => e.id);
  if (ids.length === 0) return events;
  const rows = await store.select("event_occurrences", { where: [["event_id", "in", ids]] });
  const map = new Map<string, Record<string, OccurrenceException>>();
  for (const r of rows) {
    const m = map.get(r.event_id) ?? {};
    m[new Date(r.starts_at).toISOString()] = r.status === "cancelled" ? { cancelled: true } : { start: r.overrides.starts_at, end: r.overrides.ends_at };
    map.set(r.event_id, m);
  }
  return events.map((e) => (map.has(e.id) ? { ...e, exceptions: map.get(e.id) } : e));
}

/** Événements actifs d'un utilisateur (participation active, événement non annulé). */
export async function activeEventsForUser(store: Store, userId: string, orgId?: string): Promise<EventWithExceptions[]> {
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
  return withExceptions(store, orgId ? events.filter((e) => e.organization_id === orgId) : events);
}

export function occurrencesOf(events: EventWithExceptions[], from: number, to: number): Occurrence[] {
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

/** Clé canonique d'une paire (A < B) : garantit l'unicité des conflits. */
function canonical(o: Overlap) {
  return o.a.eventId < o.b.eventId ? [o.a, o.b] : [o.b, o.a];
}

/**
 * Cœur de la détection pour un événement déjà chargé. `active` indique si
 * l'utilisateur participe activement à un événement non annulé ; sinon seuls
 * les conflits obsolètes sont clos. `others` : autres événements actifs de
 * l'utilisateur dans la même organisation (avec leurs exceptions).
 */
async function detectLoaded(
  store: Store,
  mailer: ChannelSender,
  userId: string,
  event: EventWithExceptions,
  active: boolean,
  others: EventWithExceptions[],
  buffer: number,
  now: Date,
  opts: { notify?: boolean },
): Promise<CalendarConflict[]> {
  const from = now.getTime() - WINDOW_PAST_MS;
  // Horizon de 90 jours pour une série ; un événement ponctuel plus lointain est
  // toujours vérifié jusqu'à sa date (une seule occurrence : coût négligeable).
  const horizon = now.getTime() + PERSIST_FUTURE_MS;
  const to = event.recurrence_rule ? horizon : Math.min(Math.max(horizon, Date.parse(event.ends_at)), now.getTime() + WINDOW_FUTURE_MS);
  const eventId = event.id;
  const overlaps = active ? findOverlaps(expandOccurrences(eventToSlot(event), from, to), occurrencesOf(others, from, to), buffer) : [];

  // Conflits déjà connus de l'utilisateur pour cet événement (côté A ou B), chargés une seule fois.
  const [asA, asB] = await Promise.all([
    store.select("calendar_conflicts", { where: [["user_id", "eq", userId], ["event_a_id", "eq", eventId]] }),
    store.select("calendar_conflicts", { where: [["user_id", "eq", userId], ["event_b_id", "eq", eventId]] }),
  ]);
  const known = new Map<string, CalendarConflict>();
  for (const c of [...asA, ...asB]) known.set(`${c.event_a_id}:${c.event_b_id}:${c.occurrence_a_start}:${c.occurrence_b_start}`, c);

  const rows = overlaps.map((o) => {
    const [a, b] = canonical(o);
    return {
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
  });
  const keyOf = (r: { event_a_id: string; event_b_id: string; occurrence_a_start: string; occurrence_b_start: string }) =>
    `${r.event_a_id}:${r.event_b_id}:${r.occurrence_a_start}:${r.occurrence_b_start}`;
  const current = new Set(rows.map(keyOf));

  // Clôture des conflits ouverts devenus obsolètes. Événement toujours actif : seuls ceux de
  // l'horizon calculé sont réexaminés (les dates plus lointaines n'ont pas été recalculées).
  const obsolete = [...known.values()]
    .filter((c) => (c.status === "open" || c.status === "postponed") && !current.has(keyOf(c)))
    .filter((c) => !active || Math.min(Date.parse(c.occurrence_a_start), Date.parse(c.occurrence_b_start)) <= to)
    .map((c) => c.id);
  if (obsolete.length) await store.updateWhere("calendar_conflicts", [["id", "in", obsolete]], { status: "dismissed", resolved_at: now.toISOString() });

  const created: CalendarConflict[] = [];
  const fresh: typeof rows = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const k = keyOf(row);
    if (seen.has(k)) continue;
    seen.add(k);
    const ex = known.get(k);
    if (!ex) fresh.push(row);
    else if (ex.status === "dismissed")
      created.push(await store.update("calendar_conflicts", ex.id, { status: "open", resolved_at: null, overlap_minutes: row.overlap_minutes, kind: row.kind }));
  }
  if (fresh.length) {
    try {
      created.push(...(await store.insertMany("calendar_conflicts", fresh)));
    } catch (e) {
      if (!(e instanceof UniqueViolationError)) throw e;
      // Détection concurrente : on insère ligne à ligne en ignorant les conflits déjà enregistrés.
      for (const row of fresh) {
        try {
          created.push(await store.insert("calendar_conflicts", row));
        } catch (err) {
          if (!(err instanceof UniqueViolationError)) throw err;
        }
      }
    }
  }

  if (opts.notify !== false && created.length) {
    // Une seule notification par paire d'événements, quel que soit le nombre de dates concernées.
    const byPair = new Map<string, CalendarConflict[]>();
    for (const c of created) {
      const k = `${c.event_a_id}:${c.event_b_id}`;
      byPair.set(k, [...(byPair.get(k) ?? []), c]);
    }
    const titles = new Map(others.map((e) => [e.id, e.title]));
    for (const [pair, list] of byPair) {
      list.sort((x, y) => x.occurrence_a_start.localeCompare(y.occurrence_a_start));
      const first = list[0];
      const otherId = first.event_a_id === eventId ? first.event_b_id : first.event_a_id;
      const detail = first.kind === "travel_buffer" ? "temps de déplacement insuffisant" : `${first.overlap_minutes} min`;
      const more = list.length > 1 ? ` ${list.length} dates concernées.` : "";
      await notify(
        store,
        {
          userId,
          orgId: event.organization_id,
          type: "conflict_detected",
          title: "Conflit d'agenda détecté",
          body: `« ${event.title} » chevauche « ${titles.get(otherId) ?? "un autre événement"} » (${detail}) le ${formatRangeFr(first.occurrence_a_start, first.occurrence_a_end, event.timezone)}.${more}`,
          data: { conflictId: first.id, count: list.length },
          // Une notification par paire et par détection : le premier conflit créé distingue une
          // nouvelle détection (événement déplacé) d'un nouveau passage sur les mêmes dates.
          dedupeKey: `conflict:${userId}:${pair}:${first.id}`,
        },
        mailer,
        now,
      );
    }
  }
  return created;
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
  const [raw, profile] = await Promise.all([store.get("events", eventId), store.get("profiles", userId)]);
  if (!raw) return [];
  // La liste des événements actifs contient l'événement lui-même s'il est actif pour l'utilisateur.
  const mine = await activeEventsForUser(store, userId, raw.organization_id);
  const self = mine.find((e) => e.id === eventId);
  const others = mine.filter((e) => e.id !== eventId);
  return detectLoaded(store, mailer, userId, self ?? raw, Boolean(self), others, profile?.travel_buffer_minutes ?? 0, now, opts);
}

/**
 * Variante groupée (synchronisation d'un calendrier externe) : l'agenda de
 * l'utilisateur est chargé une seule fois pour tous les événements modifiés.
 */
export async function detectForUserEvents(store: Store, mailer: ChannelSender, userId: string, ids: string[], now: Date, opts: { notify?: boolean } = {}) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const [profile, mine] = await Promise.all([store.get("profiles", userId), activeEventsForUser(store, userId)]);
  const byId = new Map(mine.map((e) => [e.id, e]));
  const missing = unique.filter((id) => !byId.has(id));
  const inactive = missing.length ? await store.select("events", { where: [["id", "in", missing]] }) : [];
  const inactiveById = new Map(inactive.map((e) => [e.id, e]));
  const buffer = profile?.travel_buffer_minutes ?? 0;
  const created: CalendarConflict[] = [];
  for (const id of unique) {
    const self = byId.get(id);
    const event = self ?? inactiveById.get(id);
    if (!event) continue;
    const others = mine.filter((e) => e.id !== id && e.organization_id === event.organization_id);
    created.push(...(await detectLoaded(store, mailer, userId, event, Boolean(self), others, buffer, now, opts)));
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
  const patch = { status: "resolved" as const, resolved_at: now.toISOString() };
  for (const side of ["event_a_id", "event_b_id"] as const) {
    const where: Filter<CalendarConflict>[] = [[side, "eq", eventId], ["status", "in", ["open", "postponed"]]];
    if (userId) where.push(["user_id", "eq", userId]);
    await store.updateWhere("calendar_conflicts", where, patch);
  }
}

/** Taille des lots (requêtes « in » et détection par utilisateur). */
const EXTEND_BATCH = 50;

/**
 * Tâche quotidienne : les conflits des séries ne sont enregistrés que sur
 * 90 jours. Quand l'horizon avance, les nouvelles dates des séries actives
 * (non annulées, non terminées) sont vérifiées pour chacun de leurs
 * participants actifs, sans notification (le conflit apparaît dans l'agenda).
 * Renvoie le nombre de conflits nouvellement enregistrés.
 */
export async function extendRecurringConflicts(store: Store, mailer: ChannelSender, now: Date): Promise<number> {
  const series = (await store.select("events", { where: [["recurrence_rule", "not_is", null], ["status", "neq", "cancelled"]] })).filter(
    (e) => !e.recurrence_until || Date.parse(e.recurrence_until) >= now.getTime(),
  );
  const byUser = new Map<string, Set<string>>();
  for (let i = 0; i < series.length; i += EXTEND_BATCH) {
    const ids = series.slice(i, i + EXTEND_BATCH).map((e) => e.id);
    const parts = await store.select("event_participants", { where: [["event_id", "in", ids], ["status", "in", ACTIVE_STATUSES]] });
    for (const p of parts) byUser.set(p.user_id, (byUser.get(p.user_id) ?? new Set()).add(p.event_id));
  }
  let created = 0;
  for (const [userId, ids] of byUser) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += EXTEND_BATCH) {
      created += (await detectForUserEvents(store, mailer, userId, list.slice(i, i + EXTEND_BATCH), now, { notify: false })).length;
    }
  }
  return created;
}
