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
import type { EventChange, EventRow, EventSource, ParticipantStatus } from "@/lib/types";
import { formatDateFr, formatRangeFr, formatTimeFr, utcToZoned, zonedToUtc } from "@/lib/time";
import { expandOccurrences } from "./conflict-engine";
import { ACTIVE_STATUSES, closeConflictsForEvent, detectForEventParticipants, detectForUserEvent, eventToSlot } from "./conflict-agent";
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
  }
  return { start, end };
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
  hasConflict: boolean;
}

export async function listCalendar(ctx: Ctx, from: string, to: string, scope: string = "me", includeCancelled = false): Promise<CalendarItem[]> {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) throw badRequest("Période invalide.");
  if (toMs - fromMs > 400 * 86400000) throw badRequest("Période trop longue (400 jours maximum).");

  const myParts = await ctx.store.select("event_participants", { where: [["user_id", "eq", ctx.userId]] });
  const myStatus = new Map(myParts.map((p) => [p.event_id, p.status]));
  let events: EventRow[];
  if (scope === "me") {
    const ids = myParts.filter((p) => ACTIVE_STATUSES.includes(p.status)).map((p) => p.event_id);
    events = ids.length ? await ctx.store.select("events", { where: [["id", "in", ids], ["organization_id", "eq", ctx.orgId]] }) : [];
  } else if (scope.startsWith("group:")) {
    const group = await loadGroupInOrg(ctx, scope.slice(6));
    if (!isOrgAdmin(ctx) && !(await groupRole(ctx, group.id))) throw forbidden("Vous n'êtes pas membre de ce groupe.");
    events = await ctx.store.select("events", { where: [["group_id", "eq", group.id]] });
  } else if (scope === "org") {
    const all = await ctx.store.select("events", { where: [["organization_id", "eq", ctx.orgId]] });
    const myGroups = new Set((await ctx.store.select("group_members", { where: [["user_id", "eq", ctx.userId]] })).map((g) => g.group_id));
    events = all.filter(
      (e) => isOrgAdmin(ctx) || e.visibility === "organization" || (e.visibility === "group" && e.group_id && myGroups.has(e.group_id)) || myStatus.has(e.id),
    );
    if (isOrgAdmin(ctx)) events = events.filter((e) => e.visibility !== "private" || myStatus.has(e.id));
  } else {
    throw badRequest("Portée inconnue.");
  }
  if (!includeCancelled) events = events.filter((e) => e.status !== "cancelled");

  const groups = await ctx.store.select("groups", { where: [["organization_id", "eq", ctx.orgId]] });
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const conflicts = await ctx.store.select("calendar_conflicts", { where: [["user_id", "eq", ctx.userId], ["status", "eq", "open"]] });
  const conflictKeys = new Set(conflicts.flatMap((c) => [`${c.event_a_id}:${c.occurrence_a_start}`, `${c.event_b_id}:${c.occurrence_b_start}`]));

  return events
    .flatMap((e) =>
      (e.status === "cancelled" ? [{ eventId: e.id, title: e.title, start: Date.parse(e.starts_at), end: Date.parse(e.ends_at) }] : expandOccurrences(eventToSlot(e), fromMs, toMs)).map(
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
            hasConflict: conflictKeys.has(`${e.id}:${start}`),
          };
        },
      ),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function getEventDetails(ctx: Ctx, eventId: string) {
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
  };
}

export function nextOccurrence(e: EventRow, now: Date) {
  const occ = expandOccurrences(eventToSlot(e), now.getTime(), now.getTime() + 400 * 86400000);
  return occ[0] ?? null;
}
