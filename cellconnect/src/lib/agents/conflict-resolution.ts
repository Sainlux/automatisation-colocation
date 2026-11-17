import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { canEditEventWith } from "@/lib/auth/permissions";
import type { Filter } from "@/lib/db/store";
import { formatRangeFr } from "@/lib/time";
import type { CalendarConflict, EventRow } from "@/lib/types";
import { withdrawFromEvent } from "./calendar-agent";
import { notify } from "./notification-agent";

/**
 * Résolution des conflits d'agenda (ConflictManagerAgent, volet décision).
 * Toutes les actions sont PERSONNELLES : elles ne modifient jamais un
 * événement collectif pour les autres participants.
 */

export const resolveSchema = z.object({
  action: z.enum(["keep_a", "keep_b", "withdraw_a", "withdraw_b", "propose_slot", "request_change", "postpone", "keep_both"]),
  notifyOrganizer: z.boolean().default(false),
  message: z.string().trim().max(1000).nullish(),
  /** Pour propose_slot / request_change : événement visé (A ou B). */
  target: z.enum(["a", "b"]).optional(),
  proposedStart: z.string().datetime().nullish(),
  proposedEnd: z.string().datetime().nullish(),
});

export type ResolveInput = z.infer<typeof resolveSchema>;

async function loadOwnConflict(ctx: Ctx, conflictId: string) {
  const c = await ctx.store.get("calendar_conflicts", conflictId);
  if (!c || c.user_id !== ctx.userId || c.organization_id !== ctx.orgId) throw notFound("Conflit introuvable.");
  return c;
}

export async function listConflicts(ctx: Ctx, status: CalendarConflict["status"][] = ["open", "postponed"], opts: { eventId?: string } = {}) {
  const base: Filter<CalendarConflict>[] = [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "in", status]];
  const query = (extra: Filter<CalendarConflict>[]) =>
    ctx.store.select("calendar_conflicts", { where: [...base, ...extra], order: [{ column: "occurrence_a_start", ascending: true }], limit: 200 });
  // Filtre par événement : côté A ou côté B (deux requêtes indexées, fusionnées).
  const rows = opts.eventId
    ? (await Promise.all([query([["event_a_id", "eq", opts.eventId]]), query([["event_b_id", "eq", opts.eventId]])]))
        .flat()
        .sort((x, y) => x.occurrence_a_start.localeCompare(y.occurrence_a_start))
        .slice(0, 200)
    : await query([]);
  const ids = [...new Set(rows.flatMap((r) => [r.event_a_id, r.event_b_id]))];
  const [events, groups, memberships, parts] = await Promise.all([
    ids.length ? ctx.store.select("events", { where: [["id", "in", ids]] }) : Promise.resolve([]),
    ctx.store.select("groups", { where: [["organization_id", "eq", ctx.orgId]] }),
    ctx.store.select("group_members", { where: [["user_id", "eq", ctx.userId]] }),
    ids.length ? ctx.store.select("event_participants", { where: [["event_id", "in", ids]] }) : Promise.resolve([]),
  ]);
  const creatorIds = [...new Set(events.map((e) => e.created_by))];
  const creators = creatorIds.length ? await ctx.store.select("profiles", { where: [["id", "in", creatorIds]] }) : [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const cName = new Map(creators.map((p) => [p.id, p.display_name]));
  const myRoles = new Map(memberships.map((m) => [m.group_id, m.role]));

  const shape = (e: EventRow | undefined, start: string, end: string) =>
    e && {
      id: e.id,
      title: e.title,
      start,
      end,
      timezone: e.timezone,
      createdAt: e.created_at,
      groupName: e.group_id ? (gName.get(e.group_id) ?? null) : null,
      organizer: cName.get(e.created_by) ?? "—",
      isOrganizer: e.created_by === ctx.userId,
      canEdit: canEditEventWith(ctx, e, myRoles),
      otherParticipants: parts.filter((p) => p.event_id === e.id && p.user_id !== ctx.userId && ["accepted", "tentative", "invited"].includes(p.status)).length,
      location: e.location,
      meetingUrl: e.meeting_url,
    };

  return rows.map((c) => ({
    id: c.id,
    status: c.status,
    kind: c.kind,
    overlapMinutes: c.overlap_minutes,
    detectedAt: c.detected_at,
    a: shape(byId.get(c.event_a_id), c.occurrence_a_start, c.occurrence_a_end),
    b: shape(byId.get(c.event_b_id), c.occurrence_b_start, c.occurrence_b_end),
  }));
}

export async function resolveConflict(ctx: Ctx, conflictId: string, input: ResolveInput) {
  const c = await loadOwnConflict(ctx, conflictId);
  if (c.status === "resolved" || c.status === "dismissed") throw badRequest("Ce conflit est déjà clos.");
  const eventA = await ctx.store.get("events", c.event_a_id);
  const eventB = await ctx.store.get("events", c.event_b_id);
  if (!eventA || !eventB) throw notFound("Événement introuvable.");
  const now = ctx.now().toISOString();

  let withdrawn: string | null = null;
  let outcome: Record<string, unknown> = {};
  let newStatus: CalendarConflict["status"] = "resolved";

  switch (input.action) {
    case "keep_a":
    case "withdraw_b":
      withdrawn = eventB.id;
      break;
    case "keep_b":
    case "withdraw_a":
      withdrawn = eventA.id;
      break;
    case "keep_both":
      break;
    case "postpone":
      newStatus = "postponed";
      break;
    case "propose_slot":
    case "request_change": {
      const target = input.target === "b" ? eventB : eventA;
      if (input.action === "propose_slot" && (!input.proposedStart || !input.proposedEnd || input.proposedEnd <= input.proposedStart)) {
        throw badRequest("Indiquez un créneau proposé valide.");
      }
      const organizer = target.created_by;
      if (organizer === ctx.userId) throw badRequest("Vous êtes l'organisateur : modifiez directement l'horaire de l'événement.");
      const me = await ctx.store.get("profiles", ctx.userId);
      const slot = input.proposedStart && input.proposedEnd ? formatRangeFr(input.proposedStart, input.proposedEnd, target.timezone) : null;
      const r = await notify(
        ctx.store,
        {
          userId: organizer,
          orgId: target.organization_id,
          type: input.action === "propose_slot" ? "slot_proposed" : "change_requested",
          title: input.action === "propose_slot" ? `Proposition d'un autre créneau : ${target.title}` : `Demande de changement : ${target.title}`,
          // Confidentialité : on ne mentionne jamais l'autre événement.
          body: [
            `${me?.display_name ?? "Un participant"} n'est pas disponible pour « ${target.title} » (${formatRangeFr(target.starts_at, target.ends_at, target.timezone)}).`,
            slot ? `Créneau proposé : ${slot}.` : null,
            input.message ? `Message : ${input.message}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          data: { eventId: target.id, proposedStart: input.proposedStart ?? null, proposedEnd: input.proposedEnd ?? null },
          dedupeKey: `${input.action}:${c.id}:${now}`,
          email: true,
        },
        ctx.mailer,
        ctx.now(),
      );
      outcome = { notified: true, deliveries: r.deliveries.map((d) => ({ channel: d.channel, status: d.status, error: d.last_error })) };
      newStatus = "postponed"; // en attente de la réponse de l'organisateur
      break;
    }
  }

  if (withdrawn) {
    const res = await withdrawFromEvent(ctx, withdrawn, { notifyOrganizer: input.notifyOrganizer, message: input.message });
    outcome = {
      withdrawnEventId: withdrawn,
      cancelledPersonalEvent: res.cancelledPersonalEvent,
      notified: res.notified,
      deliveries: (res.deliveries ?? []).map((d) => {
        const x = d as { channel: string; status: string; last_error: string | null };
        return { channel: x.channel, status: x.status, error: x.last_error };
      }),
    };
  }

  const resolution = await ctx.store.insert("conflict_resolutions", {
    conflict_id: c.id,
    user_id: ctx.userId,
    action: input.action,
    withdrawn_event_id: withdrawn,
    message: input.message ?? null,
    notify_organizer: input.notifyOrganizer,
    proposed_start: input.proposedStart ?? null,
    proposed_end: input.proposedEnd ?? null,
  });
  const updated = await ctx.store.update("calendar_conflicts", c.id, { status: newStatus, resolved_at: newStatus === "resolved" ? now : null });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: `conflict.${input.action}`, entityType: "conflict", entityId: c.id, metadata: { withdrawn } });
  return { conflict: updated, resolution, outcome };
}
