import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { groupRole, isOrgAdmin, loadEditableEvent, loadGroupInOrg } from "@/lib/auth/permissions";
import { randomToken, sha256Hex } from "@/lib/auth/crypto";
import { formatRangeFr } from "@/lib/time";
import { notify } from "./notification-agent";
import { respondToEvent } from "./calendar-agent";
import { scheduleForParticipant, DEFAULT_REMINDER_OFFSETS } from "./reminder-agent";
import { detectForUserEvent } from "./conflict-agent";

/**
 * InvitationAgent — invitations à des événements (personnes ou groupes).
 * Les invités doivent appartenir à l'organisation. Chaque invité reçoit une
 * notification interne (et un e-mail si configuré et accepté).
 */

export async function inviteToEvent(ctx: Ctx, eventId: string, target: { userIds?: string[]; groupId?: string | null }) {
  const event = await loadEditableEvent(ctx, eventId);
  if (event.status === "cancelled") throw badRequest("Impossible d'inviter à un événement annulé.");

  const invitees = new Set<string>(target.userIds ?? []);
  if (target.groupId) {
    const group = await loadGroupInOrg(ctx, target.groupId);
    if (!isOrgAdmin(ctx) && (await groupRole(ctx, group.id)) !== "leader") throw forbidden("Seuls les responsables peuvent inviter tout le groupe.");
    for (const m of await ctx.store.select("group_members", { where: [["group_id", "eq", group.id]] })) invitees.add(m.user_id);
  }
  invitees.delete(ctx.userId);
  if (invitees.size === 0) throw badRequest("Aucun invité.");

  const members = await ctx.store.select("organization_members", { where: [["organization_id", "eq", ctx.orgId], ["user_id", "in", [...invitees]]] });
  const allowed = new Set(members.map((m) => m.user_id));
  const outsiders = [...invitees].filter((u) => !allowed.has(u));
  if (outsiders.length) throw forbidden("Certains invités n'appartiennent pas à l'organisation.");

  const inviter = await ctx.store.get("profiles", ctx.userId);
  const results: { userId: string; status: "invited" | "already" }[] = [];
  for (const userId of invitees) {
    const [existing] = await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id], ["user_id", "eq", userId]] });
    if (existing && ["accepted", "tentative", "invited"].includes(existing.status)) {
      results.push({ userId, status: "already" });
      continue;
    }
    if (existing) await ctx.store.update("event_participants", existing.id, { status: "invited", responded_at: null });
    else
      await ctx.store.insert("event_participants", {
        event_id: event.id,
        organization_id: event.organization_id,
        user_id: userId,
        role: "participant",
        status: "invited",
        responded_at: null,
      });
    const invitation = await ctx.store.insert("invitations", {
      event_id: event.id,
      organization_id: event.organization_id,
      invited_by: ctx.userId,
      invitee_user_id: userId,
      invitee_email: null,
      group_id: target.groupId ?? null,
      status: "pending",
      token_hash: sha256Hex(randomToken()),
      responded_at: null,
    });
    const profile = await ctx.store.get("profiles", userId);
    await scheduleForParticipant(ctx.store, event, userId, profile?.reminder_offsets ?? DEFAULT_REMINDER_OFFSETS, ctx.now());
    await detectForUserEvent(ctx.store, ctx.mailer, userId, event.id, ctx.now());
    await notify(
      ctx.store,
      {
        userId,
        orgId: event.organization_id,
        type: "invitation",
        title: `Invitation : ${event.title}`,
        body: `${inviter?.display_name ?? "Un organisateur"} vous invite à « ${event.title} » — ${formatRangeFr(event.starts_at, event.ends_at, event.timezone)}.${event.meeting_url ? `\nLien : ${event.meeting_url}` : ""}\nRépondez dans CellConnect (Invitations).`,
        data: { eventId: event.id, invitationId: invitation.id },
        dedupeKey: `invitation:${invitation.id}`,
        email: true,
      },
      ctx.mailer,
      ctx.now(),
    );
    results.push({ userId, status: "invited" });
  }
  await ctx.store.insert("event_changes", {
    event_id: event.id,
    organization_id: event.organization_id,
    changed_by: ctx.userId,
    change_type: "participants_invited",
    before: null,
    after: { invited: results.filter((r) => r.status === "invited").map((r) => r.userId), groupId: target.groupId ?? null },
  });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "invitation.sent", entityType: "event", entityId: event.id, metadata: { count: results.length } });
  return results;
}

export async function listInvitations(ctx: Ctx) {
  const received = await ctx.store.select("invitations", {
    where: [["invitee_user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId]],
    order: [{ column: "created_at", ascending: false }],
    limit: 100,
  });
  const sent = await ctx.store.select("invitations", {
    where: [["invited_by", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId]],
    order: [{ column: "created_at", ascending: false }],
    limit: 200,
  });
  const eventIds = [...new Set([...received, ...sent].map((i) => i.event_id))];
  const events = eventIds.length ? await ctx.store.select("events", { where: [["id", "in", eventIds]] }) : [];
  const userIds = [...new Set([...received.map((i) => i.invited_by), ...sent.map((i) => i.invitee_user_id).filter(Boolean)] as string[])];
  const profiles = userIds.length ? await ctx.store.select("profiles", { where: [["id", "in", userIds]] }) : [];
  const ev = new Map(events.map((e) => [e.id, e]));
  const pr = new Map(profiles.map((p) => [p.id, p.display_name]));
  const shape = (i: (typeof received)[number]) => {
    const e = ev.get(i.event_id);
    return {
      id: i.id,
      status: i.status,
      createdAt: i.created_at,
      event: e ? { id: e.id, title: e.title, start: e.starts_at, end: e.ends_at, timezone: e.timezone, status: e.status, meetingUrl: e.meeting_url, location: e.location } : null,
      invitedBy: pr.get(i.invited_by) ?? "—",
      invitee: i.invitee_user_id ? (pr.get(i.invitee_user_id) ?? "—") : i.invitee_email,
    };
  };
  return { received: received.map(shape), sent: sent.map(shape) };
}

export async function respondToInvitation(ctx: Ctx, invitationId: string, response: "accepted" | "declined" | "tentative") {
  const inv = await ctx.store.get("invitations", invitationId);
  if (!inv || inv.invitee_user_id !== ctx.userId || inv.organization_id !== ctx.orgId) throw notFound("Invitation introuvable.");
  if (inv.status === "cancelled") throw badRequest("Cette invitation a été annulée.");
  await respondToEvent(ctx, inv.event_id, response);
  const updated = await ctx.store.update("invitations", inv.id, { status: response, responded_at: ctx.now().toISOString() });
  const event = await ctx.store.get("events", inv.event_id);
  const me = await ctx.store.get("profiles", ctx.userId);
  const label = { accepted: "accepte", declined: "décline", tentative: "répond « peut-être » à" }[response];
  await notify(
    ctx.store,
    {
      userId: inv.invited_by,
      orgId: inv.organization_id,
      type: "invitation_response",
      title: `Réponse à l'invitation : ${event?.title ?? ""}`,
      body: `${me?.display_name ?? "Un invité"} ${label} « ${event?.title ?? "l'événement"} ».`,
      data: { eventId: inv.event_id, invitationId: inv.id },
      dedupeKey: `invitation-response:${inv.id}:${response}:${updated.responded_at}`,
    },
    ctx.mailer,
    ctx.now(),
  );
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: `invitation.${response}`, entityType: "invitation", entityId: inv.id });
  return updated;
}
