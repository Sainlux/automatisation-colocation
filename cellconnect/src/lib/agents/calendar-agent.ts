import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { badRequest, conflict as conflictError, forbidden } from "@/lib/errors";
import {
  canEditEvent,
  groupRole,
  isOrgAdmin,
  loadEditableEvent,
  loadGroupInOrg,
  loadViewableEvent,
} from "@/lib/auth/permissions";
import type { EventInput, EventPatch } from "@/lib/schemas/event";
import type { EventChange, EventOccurrence, EventRow, EventSource, ParticipantStatus } from "@/lib/types";
import type { Filter, NewRow } from "@/lib/db/store";
import { formatDateFr, formatRangeFr, formatTimeFr, utcToZoned, zonedToUtc } from "@/lib/time";
import { expandOccurrences } from "./conflict-engine";
import { ACTIVE_STATUSES, closeConflictsForEvent, detectForEventParticipants, detectForUserEvent, eventToSlot, withExceptions } from "./conflict-agent";
import { notify } from "./notification-agent";
import { cancelReminders, DEFAULT_REMINDER_OFFSETS, rescheduleEvent, scheduleForParticipant } from "./reminder-agent";
import { enqueueSyncForEvent } from "./sync-queue";

/**
 * CalendarAgent — gestion des événements du calendrier interne.
 *
 * Règle fondamentale : se désister (participation personnelle) n'annule
 * JAMAIS l'événement pour les autres. Seul un utilisateur autorisé
 * (organisateur, responsable du groupe, administrateur) peut modifier ou
 * annuler un événement collectif, et l'annulation exige une confirmation
 * explicite.
 */

function toInstants(date: string, startTime: string, endTime: string, tz: string) {
  const start = zonedToUtc(date, startTime, tz).iso;
  let end = zonedToUtc(date, endTime, tz).iso;
  if (Date.parse(end) <= Date.parse(start)) {
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    end = zonedToUtc(next, endTime, tz).iso;
    // Fin reportée au lendemain : au-delà de 12 h, il s'agit presque toujours d'une heure de fin
    // saisie avant le début (et non d'une soirée qui déborde). Une longue journée (8 h – 21 h) reste acceptée.
    if (Date.parse(end) - Date.parse(start) > 12 * 3600000) throw badRequest("La fin est avant le début : vérifiez les heures.");
  }
  return { start, end };
}

/** Décale d'un nombre de jours une date AAAA-MM-JJ. */
function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Après un changement d'horaire (ou de règle) d'une série : réaligne les
 * exceptions (event_occurrences) sur les nouvelles occurrences.
 *  - la clé starts_at (début d'origine) est recalculée : même date locale
 *    (décalée comme le début de la série), nouvelle heure murale ;
 *  - une date déplacée garde son nouvel horaire (overrides inchangés) ;
 *  - une exception qui ne tombe plus sur la règle est supprimée.
 */
async function realignExceptions(ctx: Ctx, before: EventRow, after: EventRow) {
  const rows = await ctx.store.select("event_occurrences", { where: [["event_id", "eq", before.id]] });
  if (rows.length === 0) return;
  const oldStart = utcToZoned(before.starts_at, before.timezone);
  const newStart = utcToZoned(after.starts_at, after.timezone);
  const dayShift = Math.round((Date.parse(`${newStart.date}T00:00:00Z`) - Date.parse(`${oldStart.date}T00:00:00Z`)) / 86400000);
  const duration = Date.parse(after.ends_at) - Date.parse(after.starts_at);
  const slot = { ...eventToSlot(after), exceptions: undefined };
  const kept = new Map<string, NewRow<EventOccurrence>>();
  for (const row of rows) {
    const local = utcToZoned(row.starts_at, before.timezone);
    const startsAt = zonedToUtc(shiftDate(local.date, dayShift), newStart.time, after.timezone).iso;
    const ms = Date.parse(startsAt);
    const onRule = Boolean(after.recurrence_rule) && expandOccurrences(slot, ms - 1000, ms + 1000).some((o) => o.originalStart === ms);
    // Une exception qui ne tombe plus sur la série n'a plus d'objet.
    if (!onRule || kept.has(startsAt)) continue;
    kept.set(startsAt, {
      event_id: row.event_id,
      organization_id: row.organization_id,
      starts_at: startsAt,
      ends_at: new Date(ms + duration).toISOString(),
      status: row.status,
      overrides: row.overrides,
    });
  }
  // Remplacement complet : évite toute collision temporaire sur l'unicité (event_id, starts_at).
  await ctx.store.deleteWhere("event_occurrences", [["event_id", "eq", before.id]]);
  if (kept.size) await ctx.store.insertMany("event_occurrences", [...kept.values()]);
}

async function logChange(ctx: Ctx, event: EventRow, type: EventChange["change_type"], before: unknown, after: unknown) {
  await ctx.store.insert("event_changes", {
    event_id: event.id,
    organization_id: event.organization_id,
    changed_by: ctx.userId,
    change_type: type,
    before,
    after,
  });
}

export async function createEvent(
  ctx: Ctx,
  input: EventInput,
  opts: { source?: EventSource; sourceJobId?: string | null; detectConflicts?: boolean } = {},
): Promise<EventRow> {
  let visibility = input.visibility ?? (input.groupId ? "group" : "private");
  if (input.groupId) {
    const group = await loadGroupInOrg(ctx, input.groupId);
    const role = await groupRole(ctx, group.id);
    if (!role && !isOrgAdmin(ctx)) throw forbidden("Vous n'êtes pas membre de ce groupe.");
    if (input.inviteGroup && role !== "leader" && !isOrgAdmin(ctx)) {
      throw forbidden("Seuls les responsables du groupe peuvent inviter tout le groupe.");
    }
  } else if (visibility === "group") {
    visibility = "private";
  }
  if (visibility === "organization" && !isOrgAdmin(ctx)) {
    throw forbidden("Seuls les administrateurs peuvent publier un événement pour toute l'organisation.");
  }

  const { start, end } = toInstants(input.date, input.startTime, input.endTime, input.timezone);
  const event = await ctx.store.insert("events", {
    organization_id: ctx.orgId,
    group_id: input.groupId ?? null,
    created_by: ctx.userId,
    title: input.title.trim(),
    description: input.description ?? null,
    location: input.location ?? null,
    meeting_url: input.meetingUrl ?? null,
    starts_at: start,
    ends_at: end,
    timezone: input.timezone,
    all_day: false,
    recurrence_rule: input.recurrenceRule ?? null,
    recurrence_until: null,
    status: "confirmed",
    visibility,
    source: opts.source ?? "manual",
    source_job_id: opts.sourceJobId ?? null,
    external_uid: null,
    version: 1,
    updated_at: ctx.now().toISOString(),
  });
  await ctx.store.insert("event_participants", {
    event_id: event.id,
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    role: "organizer",
    status: "accepted",
    responded_at: ctx.now().toISOString(),
  });
  const profile = await ctx.store.get("profiles", ctx.userId);
  await scheduleForParticipant(ctx.store, event, ctx.userId, profile?.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS, ctx.now());
  await logChange(ctx, event, "created", null, { title: event.title, starts_at: start, ends_at: end });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "event.created", entityType: "event", entityId: event.id, metadata: { source: event.source } });
  if (opts.detectConflicts !== false) await detectForUserEvent(ctx.store, ctx.mailer, ctx.userId, event.id, ctx.now());
  await enqueueSyncForEvent(ctx.store, ctx.userId, event, "upsert");

  if (input.groupId && input.inviteGroup) {
    const { inviteToEvent } = await import("./invitation-agent");
    await inviteToEvent(ctx, event.id, { groupId: input.groupId });
  }
  return event;
}

export async function updateEvent(ctx: Ctx, eventId: string, patch: EventPatch) {
  const event = await loadEditableEvent(ctx, eventId);
  if (event.status === "cancelled") throw badRequest("Cet événement est annulé.");
  if (patch.expectedVersion !== undefined && patch.expectedVersion !== event.version) {
    throw conflictError("L'événement a été modifié entre-temps. Rechargez la page.");
  }
  if (patch.groupId && patch.groupId !== event.group_id) {
    await loadGroupInOrg(ctx, patch.groupId);
    if (!isOrgAdmin(ctx) && (await groupRole(ctx, patch.groupId)) !== "leader") throw forbidden("Vous ne gérez pas ce groupe.");
  }
  if (patch.visibility === "organization" && !isOrgAdmin(ctx)) throw forbidden("Réservé aux administrateurs.");

  const tz = patch.timezone ?? event.timezone;
  const current = utcToZoned(event.starts_at, event.timezone);
  const currentEnd = utcToZoned(event.ends_at, event.timezone);
  const date = patch.date ?? current.date;
  const startTime = patch.startTime ?? current.time;
  const endTime = patch.endTime ?? currentEnd.time;
  const { start, end } = toInstants(date, startTime, endTime, tz);
  const rescheduled =
    start !== event.starts_at || end !== event.ends_at || (patch.recurrenceRule !== undefined && (patch.recurrenceRule ?? null) !== event.recurrence_rule);

  const updated = await ctx.store.update("events", event.id, {
    title: patch.title ?? event.title,
    description: patch.description !== undefined ? patch.description : event.description,
    location: patch.location !== undefined ? patch.location : event.location,
    meeting_url: patch.meetingUrl !== undefined ? patch.meetingUrl : event.meeting_url,
    group_id: patch.groupId !== undefined ? patch.groupId : event.group_id,
    visibility: patch.visibility ?? event.visibility,
    recurrence_rule: patch.recurrenceRule !== undefined ? patch.recurrenceRule : event.recurrence_rule,
    timezone: tz,
    starts_at: start,
    ends_at: end,
    version: event.version + 1,
  });
  await logChange(ctx, updated, rescheduled ? "rescheduled" : "updated", { starts_at: event.starts_at, ends_at: event.ends_at, title: event.title }, { starts_at: start, ends_at: end, title: updated.title });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: rescheduled ? "event.rescheduled" : "event.updated", entityType: "event", entityId: event.id });

  if (rescheduled) {
    // Les dates annulées ou déplacées doivent suivre la série, sinon elles réapparaîtraient au nouvel horaire.
    if (event.recurrence_rule || updated.recurrence_rule) await realignExceptions(ctx, event, updated);
    await rescheduleEvent(ctx.store, updated, ctx.now());
    await detectForEventParticipants(ctx.store, ctx.mailer, updated.id, ctx.now());
  }
  if (patch.notifyParticipants !== false && (rescheduled || patch.location !== undefined || patch.meetingUrl !== undefined)) {
    await notifyParticipants(ctx, updated, {
      type: "event_rescheduled",
      title: rescheduled ? `Changement d'horaire : ${updated.title}` : `Mise à jour : ${updated.title}`,
      body: rescheduled
        ? `« ${updated.title} » a été déplacé.\nAvant : ${formatRangeFr(event.starts_at, event.ends_at, event.timezone)}\nMaintenant : ${formatRangeFr(start, end, tz)}`
        : `Les informations de « ${updated.title} » ont été mises à jour.`,
      key: `event:${updated.id}:v${updated.version}`,
    });
  }
  await enqueueSyncForEvent(ctx.store, ctx.userId, updated, "upsert");
  return updated;
}

async function notifyParticipants(ctx: Ctx, event: EventRow, n: { type: "event_rescheduled" | "event_cancelled"; title: string; body: string; key: string }) {
  const parts = await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id]] });
  const results = [];
  for (const p of parts) {
    if (p.user_id === ctx.userId || ["declined", "withdrawn"].includes(p.status)) continue;
    const r = await notify(
      ctx.store,
      { userId: p.user_id, orgId: event.organization_id, type: n.type, title: n.title, body: n.body, data: { eventId: event.id }, dedupeKey: `${n.key}:${p.user_id}`, email: true },
      ctx.mailer,
      ctx.now(),
    );
    results.push(r);
  }
  return results;
}

/** Annulation COLLECTIVE : réservée aux personnes autorisées, confirmation explicite requise. */
export async function cancelEvent(ctx: Ctx, eventId: string, opts: { confirm: boolean; message?: string | null }) {
  const event = await loadEditableEvent(ctx, eventId);
  if (!opts.confirm) throw badRequest("Confirmation explicite requise pour annuler l'événement pour tous les participants.");
  if (event.status === "cancelled") return { event, notified: 0 };
  const updated = await ctx.store.update("events", event.id, { status: "cancelled", version: event.version + 1 });
  await cancelReminders(ctx.store, event.id);
  await closeConflictsForEvent(ctx.store, event.id, ctx.now());
  await logChange(ctx, updated, "cancelled", { status: event.status }, { status: "cancelled", message: opts.message ?? null });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "event.cancelled", entityType: "event", entityId: event.id });
  const results = await notifyParticipants(ctx, updated, {
    type: "event_cancelled",
    title: `Annulé : ${event.title}`,
    body: `« ${event.title} » prévu le ${formatRangeFr(event.starts_at, event.ends_at, event.timezone)} est annulé.${opts.message ? `\nMessage : ${opts.message}` : ""}`,
    key: `event:${event.id}:cancelled`,
  });
  await enqueueSyncForEvent(ctx.store, ctx.userId, updated, "delete");
  return { event: updated, notified: results.length, deliveries: results.flatMap((r) => r.deliveries) };
}

/**
 * Exception sur UNE occurrence d'un événement récurrent : annulation ou
 * déplacement de cette seule date (réservé aux personnes autorisées).
 * Les autres occurrences ne changent pas.
 */
export async function modifyOccurrence(
  ctx: Ctx,
  eventId: string,
  input: { occurrenceStart: string; action: "cancel" | "move" | "restore"; date?: string; startTime?: string; endTime?: string; message?: string | null },
) {
  const event = await loadEditableEvent(ctx, eventId);
  if (!event.recurrence_rule) throw badRequest("Cet événement n'est pas récurrent : modifiez-le directement.");
  if (event.status === "cancelled") throw badRequest("Cet événement est annulé.");
  const orig = Date.parse(input.occurrenceStart);
  if (!Number.isFinite(orig)) throw badRequest("Occurrence invalide.");
  const origIso = new Date(orig).toISOString();
  // L'occurrence doit exister selon la règle.
  const occ = expandOccurrences({ ...eventToSlot(event), exceptions: undefined }, orig - 1000, orig + 1000).find((o) => o.originalStart === orig);
  if (!occ) throw badRequest("Cette date ne fait pas partie de la récurrence.");

  const [existing] = await ctx.store.select("event_occurrences", { where: [["event_id", "eq", event.id], ["starts_at", "eq", origIso]] });
  // Rien à rétablir : aucune écriture, aucune notification.
  if (input.action === "restore" && !existing) return { event, notified: 0, unchanged: true as const };
  let before: { start: string; end: string } = { start: origIso, end: new Date(occ.end).toISOString() };
  if (existing?.overrides.starts_at && existing.overrides.ends_at) before = { start: existing.overrides.starts_at, end: existing.overrides.ends_at };

  let after: { start: string; end: string } | null = null;
  if (input.action === "restore") {
    if (existing) await ctx.store.delete("event_occurrences", existing.id);
    after = { start: origIso, end: new Date(occ.end).toISOString() };
  } else if (input.action === "cancel") {
    const row = { status: "cancelled" as const, overrides: {}, ends_at: new Date(occ.end).toISOString() };
    if (existing) await ctx.store.update("event_occurrences", existing.id, row);
    else await ctx.store.insert("event_occurrences", { event_id: event.id, organization_id: event.organization_id, starts_at: origIso, ...row });
  } else {
    if (!input.date || !input.startTime || !input.endTime) throw badRequest("Indiquez la nouvelle date et les horaires.");
    after = toInstants(input.date, input.startTime, input.endTime, event.timezone);
    const row = { status: "confirmed" as const, overrides: { starts_at: after.start, ends_at: after.end }, ends_at: new Date(occ.end).toISOString() };
    if (existing) await ctx.store.update("event_occurrences", existing.id, row);
    else await ctx.store.insert("event_occurrences", { event_id: event.id, organization_id: event.organization_id, starts_at: origIso, ...row });
  }
  const updated = await ctx.store.update("events", event.id, { version: event.version + 1 });
  await logChange(ctx, updated, input.action === "cancel" ? "cancelled" : "rescheduled", { occurrence: origIso, ...before }, after ? { occurrence: origIso, ...after } : { occurrence: origIso, status: "cancelled" });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: `occurrence.${input.action}`, entityType: "event", entityId: event.id, metadata: { occurrence: origIso } });
  await rescheduleEvent(ctx.store, updated, ctx.now());
  await detectForEventParticipants(ctx.store, ctx.mailer, updated.id, ctx.now());
  const results = await notifyParticipants(ctx, updated, {
    type: input.action === "cancel" ? "event_cancelled" : "event_rescheduled",
    title: input.action === "cancel" ? `Date annulée : ${event.title}` : `Changement de date : ${event.title}`,
    body:
      input.action === "cancel"
        ? `La séance du ${formatRangeFr(before.start, before.end, event.timezone)} de « ${event.title} » est annulée. Les autres dates sont maintenues.${input.message ? `\nMessage : ${input.message}` : ""}`
        : `La séance du ${formatRangeFr(before.start, before.end, event.timezone)} de « ${event.title} » a lieu le ${formatRangeFr(after!.start, after!.end, event.timezone)}.${input.message ? `\nMessage : ${input.message}` : ""}`,
    key: `occurrence:${event.id}:${origIso}:v${updated.version}`,
  });
  await enqueueSyncForEvent(ctx.store, ctx.userId, updated, "upsert");
  return { event: updated, notified: results.length };
}

export function defaultWithdrawMessage(event: EventRow) {
  return `Bonjour, je vous informe que je ne pourrai pas participer à « ${event.title} » du ${formatDateFr(event.starts_at, event.timezone)} à ${formatTimeFr(event.starts_at, event.timezone)} en raison d'un conflit d'agenda. Merci de votre compréhension.`;
}

/**
 * Désistement PERSONNEL : met à jour uniquement la participation de
 * l'utilisateur. L'événement reste maintenu pour les autres participants.
 * Le message éventuel à l'organisateur ne mentionne jamais l'autre
 * événement (confidentialité).
 */
export async function withdrawFromEvent(ctx: Ctx, eventId: string, opts: { notifyOrganizer: boolean; message?: string | null }) {
  const event = await loadViewableEvent(ctx, eventId);
  const [me] = await ctx.store.select("event_participants", {
    where: [
      ["event_id", "eq", event.id],
      ["user_id", "eq", ctx.userId],
    ],
  });
  if (!me) throw badRequest("Vous ne participez pas à cet événement.");
  if (me.status === "withdrawn" || me.status === "declined") return { event, cancelledPersonalEvent: false, notified: false };

  const others = (await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id]] })).filter(
    (p) => p.user_id !== ctx.userId && ACTIVE_STATUSES.includes(p.status),
  );
  await ctx.store.update("event_participants", me.id, { status: "withdrawn", responded_at: ctx.now().toISOString() });
  await cancelReminders(ctx.store, event.id, ctx.userId);
  await closeConflictsForEvent(ctx.store, event.id, ctx.now(), ctx.userId);
  await logChange(ctx, event, "participant_withdrawn", { status: me.status }, { status: "withdrawn", user_id: ctx.userId });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "participant.withdrawn", entityType: "event", entityId: event.id });

  // Événement purement personnel (créé par moi, sans autre participant) : il disparaît de mon agenda.
  let cancelledPersonalEvent = false;
  if (event.created_by === ctx.userId && others.length === 0 && event.status !== "cancelled") {
    await ctx.store.update("events", event.id, { status: "cancelled", version: event.version + 1 });
    cancelledPersonalEvent = true;
    await enqueueSyncForEvent(ctx.store, ctx.userId, event, "delete");
  }

  let notified = false;
  let deliveries: unknown[] = [];
  if (opts.notifyOrganizer && !cancelledPersonalEvent) {
    const organizers = (await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id], ["role", "eq", "organizer"]] }))
      .map((p) => p.user_id)
      .filter((u) => u !== ctx.userId);
    const recipients = organizers.length ? organizers : event.created_by !== ctx.userId ? [event.created_by] : [];
    const me2 = await ctx.store.get("profiles", ctx.userId);
    for (const r of recipients) {
      const res = await notify(
        ctx.store,
        {
          userId: r,
          orgId: event.organization_id,
          type: "participant_withdrawn",
          title: `${me2?.display_name ?? "Un participant"} ne pourra pas participer`,
          body: (opts.message?.trim() || defaultWithdrawMessage(event)).slice(0, 1000),
          data: { eventId: event.id, userId: ctx.userId },
          dedupeKey: `withdraw:${event.id}:${ctx.userId}:${r}`,
          email: true,
        },
        ctx.mailer,
        ctx.now(),
      );
      deliveries = deliveries.concat(res.deliveries);
      notified = true;
    }
  }
  return { event, cancelledPersonalEvent, notified, deliveries };
}

export async function respondToEvent(ctx: Ctx, eventId: string, status: Extract<ParticipantStatus, "accepted" | "declined" | "tentative">) {
  const event = await loadViewableEvent(ctx, eventId);
  if (event.status === "cancelled") throw badRequest("Cet événement est annulé.");
  const [me] = await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id], ["user_id", "eq", ctx.userId]] });
  const now = ctx.now().toISOString();
  const p = me
    ? await ctx.store.update("event_participants", me.id, { status, responded_at: now })
    : await ctx.store.insert("event_participants", { event_id: event.id, organization_id: event.organization_id, user_id: ctx.userId, role: "participant", status, responded_at: now });
  if (status === "declined") {
    await cancelReminders(ctx.store, event.id, ctx.userId);
    await closeConflictsForEvent(ctx.store, event.id, ctx.now(), ctx.userId);
  } else {
    const profile = await ctx.store.get("profiles", ctx.userId);
    await scheduleForParticipant(ctx.store, event, ctx.userId, profile?.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS, ctx.now());
    await detectForUserEvent(ctx.store, ctx.mailer, ctx.userId, event.id, ctx.now());
  }
  await logChange(ctx, event, "participant_responded", { status: me?.status ?? null }, { status });
  return p;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface CalendarItem {
  id: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  status: EventRow["status"];
  groupId: string | null;
  groupName: string | null;
  color: string | null;
  myStatus: ParticipantStatus | null;
  location: string | null;
  meetingUrl: string | null;
  recurring: boolean;
  /** Début d'origine de l'occurrence (pour annuler/déplacer cette seule date). */
  occurrenceStart: string;
  moved: boolean;
  hasConflict: boolean;
}

/** Séries récurrentes : recurrence_rule non nulle. */
const RECURRING_FILTER: Filter<EventRow> = ["recurrence_rule", "not_is", null];

export async function listCalendar(ctx: Ctx, from: string, to: string, scope: string = "me", includeCancelled = false): Promise<CalendarItem[]> {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) throw badRequest("Période invalide.");
  if (toMs - fromMs > 400 * 86400000) throw badRequest("Période trop longue (400 jours maximum).");

  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const myParts = await ctx.store.select("event_participants", { where: [["user_id", "eq", ctx.userId]] });
  const myStatus = new Map(myParts.map((p) => [p.event_id, p.status]));
  let base: Filter<EventRow>[];
  let visible: (e: EventRow) => boolean;
  if (scope === "me") {
    const ids = myParts.filter((p) => ACTIVE_STATUSES.includes(p.status)).map((p) => p.event_id);
    if (ids.length === 0) return [];
    base = [["id", "in", ids], ["organization_id", "eq", ctx.orgId]];
    visible = () => true;
  } else if (scope.startsWith("group:")) {
    const group = await loadGroupInOrg(ctx, scope.slice(6));
    if (!isOrgAdmin(ctx) && !(await groupRole(ctx, group.id))) throw forbidden("Vous n'êtes pas membre de ce groupe.");
    base = [["group_id", "eq", group.id], ["organization_id", "eq", ctx.orgId]];
    // Même règle que canViewEvent : un événement privé du groupe reste réservé à son créateur et à ses participants.
    visible = (e) => e.visibility !== "private" || e.created_by === ctx.userId || myStatus.has(e.id);
  } else if (scope === "org") {
    base = [["organization_id", "eq", ctx.orgId]];
    const myGroups = new Set((await ctx.store.select("group_members", { where: [["user_id", "eq", ctx.userId]] })).map((g) => g.group_id));
    visible = (e) =>
      isOrgAdmin(ctx)
        ? e.visibility !== "private" || myStatus.has(e.id)
        : e.visibility === "organization" || (e.visibility === "group" && Boolean(e.group_id && myGroups.has(e.group_id))) || myStatus.has(e.id);
  } else {
    throw badRequest("Portée inconnue.");
  }

  // Deux requêtes ciblées : événements ponctuels qui chevauchent la période, et séries récurrentes.
  const [single, recurring] = await Promise.all([
    ctx.store.select("events", { where: [...base, ["recurrence_rule", "is", null], ["starts_at", "lte", toIso], ["ends_at", "gte", fromIso]] }),
    ctx.store.select("events", { where: [...base, RECURRING_FILTER] }),
  ]);
  let events = [...single, ...recurring.filter((e) => e.recurrence_rule)].filter(visible);
  // Un événement annulé n'est montré que sur demande ; un événement simple annulé seulement s'il
  // chevauche la période (une série annulée est développée comme une série active, plus bas).
  events = events.filter((e) =>
    e.status !== "cancelled" ? true : includeCancelled && (Boolean(e.recurrence_rule) || (Date.parse(e.starts_at) < toMs && Date.parse(e.ends_at) > fromMs)),
  );
  const withEx = await withExceptions(ctx.store, events);

  const [groups, conflicts] = await Promise.all([
    ctx.store.select("groups", { where: [["organization_id", "eq", ctx.orgId]] }),
    ctx.store.select("calendar_conflicts", { where: [["user_id", "eq", ctx.userId], ["status", "eq", "open"]] }),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const conflictKeys = new Set(conflicts.flatMap((c) => [`${c.event_a_id}:${c.occurrence_a_start}`, `${c.event_b_id}:${c.occurrence_b_start}`]));

  return withEx
    .flatMap((e) =>
      (e.status === "cancelled" && !e.recurrence_rule
        ? [{ eventId: e.id, title: e.title, start: Date.parse(e.starts_at), end: Date.parse(e.ends_at), originalStart: Date.parse(e.starts_at) }]
        : expandOccurrences(eventToSlot(e), fromMs, toMs)
      ).map(
        (o) => {
          const start = new Date(o.start).toISOString();
          const g = e.group_id ? groupById.get(e.group_id) : undefined;
          return {
            id: `${e.id}:${start}`,
            eventId: e.id,
            title: e.title,
            start,
            end: new Date(o.end).toISOString(),
            status: e.status,
            groupId: e.group_id,
            groupName: g?.name ?? null,
            color: g?.color ?? null,
            myStatus: myStatus.get(e.id) ?? null,
            location: e.location,
            meetingUrl: e.meeting_url,
            recurring: Boolean(e.recurrence_rule),
            occurrenceStart: new Date(o.originalStart ?? o.start).toISOString(),
            moved: o.originalStart !== undefined && o.originalStart !== o.start,
            hasConflict: conflictKeys.has(`${e.id}:${start}`),
          };
        },
      ),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface OccurrenceDetails {
  /** Début d'origine selon la règle (clé de la date). */
  originalStart: string;
  start: string;
  end: string;
  status: "scheduled" | "moved" | "cancelled";
}

/** État d'UNE date d'un événement (récurrent ou non) ; null si cette date ne fait pas partie de l'événement. */
async function occurrenceDetails(ctx: Ctx, event: EventRow, occurrence: string): Promise<OccurrenceDetails | null> {
  const orig = Date.parse(occurrence);
  if (!Number.isFinite(orig)) throw badRequest("Date d'occurrence invalide.");
  const originalStart = new Date(orig).toISOString();
  const duration = Date.parse(event.ends_at) - Date.parse(event.starts_at);
  if (!event.recurrence_rule) {
    if (orig !== Date.parse(event.starts_at)) return null;
    return { originalStart, start: event.starts_at, end: event.ends_at, status: event.status === "cancelled" ? "cancelled" : "scheduled" };
  }
  const onRule = expandOccurrences({ ...eventToSlot(event), exceptions: undefined }, orig - 1000, orig + 1000).some((o) => o.originalStart === orig);
  if (!onRule) return null;
  const [row] = await ctx.store.select("event_occurrences", { where: [["event_id", "eq", event.id], ["starts_at", "eq", originalStart]] });
  const scheduled = { originalStart, start: originalStart, end: new Date(orig + duration).toISOString() };
  if (event.status === "cancelled" || row?.status === "cancelled") return { ...scheduled, status: "cancelled" };
  if (row?.overrides.starts_at && row.overrides.ends_at) {
    const moved = row.overrides.starts_at !== originalStart || row.overrides.ends_at !== scheduled.end;
    return { originalStart, start: row.overrides.starts_at, end: row.overrides.ends_at, status: moved ? "moved" : "scheduled" };
  }
  return { ...scheduled, status: "scheduled" };
}

/**
 * Détail d'un événement. Avec `occurrence` (début d'origine ISO d'une date),
 * renvoie aussi l'état de cette date : horaire effectif et statut
 * (prévue, déplacée ou annulée).
 */
export async function getEventDetails(ctx: Ctx, eventId: string, occurrence?: string | null) {
  const event = await loadViewableEvent(ctx, eventId);
  const parts = await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id]] });
  const profiles = parts.length ? await ctx.store.select("profiles", { where: [["id", "in", parts.map((p) => p.user_id)]] }) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const group = event.group_id ? await ctx.store.get("groups", event.group_id) : null;
  const changes = await ctx.store.select("event_changes", { where: [["event_id", "eq", event.id]], order: [{ column: "created_at", ascending: false }], limit: 20 });
  const reminders = await ctx.store.select("reminders", { where: [["event_id", "eq", event.id], ["user_id", "eq", ctx.userId], ["status", "eq", "scheduled"]] });
  const me = parts.find((p) => p.user_id === ctx.userId) ?? null;
  return {
    event,
    group: group ? { id: group.id, name: group.name, color: group.color } : null,
    participants: parts.map((p) => ({
      userId: p.user_id,
      name: byId.get(p.user_id)?.display_name ?? "Utilisateur",
      role: p.role,
      status: p.status,
    })),
    me,
    canEdit: await canEditEvent(ctx, event),
    changes,
    reminders: reminders.sort((a, b) => a.remind_at.localeCompare(b.remind_at)).slice(0, 10),
    defaultWithdrawMessage: defaultWithdrawMessage(event),
    occurrence: occurrence ? await occurrenceDetails(ctx, event, occurrence) : null,
  };
}
