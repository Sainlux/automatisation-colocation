import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { groupRole, isOrgAdmin, loadEditableEvent, loadGroupInOrg } from "@/lib/auth/permissions";
import type { OrgRole } from "@/lib/types";
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
  const eventIds = [...new Set([...received, ...sent].map((i) => i.event_id).filter(Boolean))] as string[];
  const events = eventIds.length ? await ctx.store.select("events", { where: [["id", "in", eventIds]] }) : [];
  const userIds = [...new Set([...received.map((i) => i.invited_by), ...sent.map((i) => i.invitee_user_id).filter(Boolean)] as string[])];
  const profiles = userIds.length ? await ctx.store.select("profiles", { where: [["id", "in", userIds]] }) : [];
  const ev = new Map(events.map((e) => [e.id, e]));
  const pr = new Map(profiles.map((p) => [p.id, p.display_name]));
  const shape = (i: (typeof received)[number]) => {
    const e = i.event_id ? ev.get(i.event_id) : undefined;
    return {
      id: i.id,
      status: i.status,
      createdAt: i.created_at,
      kind: i.event_id ? ("event" as const) : ("organization" as const),
      emailStatus: i.email_status ?? null,
      emailError: i.email_error ?? null,
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
  if (!inv.event_id) throw badRequest("Invitation d'organisation : utilisez le lien reçu par e-mail.");
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

// ---------------------------------------------------------------------------
// Invitations par e-mail (personnes sans compte ou hors de l'organisation)
// ---------------------------------------------------------------------------

export const INVITATION_TTL_DAYS = 30;

/**
 * Invite par e-mail. Si l'adresse correspond déjà à un membre de
 * l'organisation, l'invitation interne classique est utilisée. Sinon, un lien
 * à usage unique (30 jours) est envoyé : la personne crée son compte (ou se
 * connecte) puis rejoint l'organisation en tant qu'invitée et l'événement.
 * Seule l'empreinte SHA-256 du jeton est stockée.
 */
export async function inviteByEmail(
  ctx: Ctx,
  input: { emails: string[]; eventId?: string | null; orgRole?: OrgRole | null },
  appUrl: string,
) {
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length === 0) throw badRequest("Aucune adresse e-mail.");
  if (emails.length > 50) throw badRequest("50 adresses maximum à la fois.");
  let eventTitle: string | null = null;
  let eventWhen: string | null = null;
  if (input.eventId) {
    const event = await loadEditableEvent(ctx, input.eventId);
    if (event.status === "cancelled") throw badRequest("Impossible d'inviter à un événement annulé.");
    eventTitle = event.title;
    eventWhen = formatRangeFr(event.starts_at, event.ends_at, event.timezone);
  } else {
    if (!isOrgAdmin(ctx)) throw forbidden("Seuls les administrateurs peuvent inviter dans l'organisation.");
    if (input.orgRole === "super_admin") throw forbidden("Rôle non attribuable.");
  }
  const org = await ctx.store.get("organizations", ctx.orgId);
  const inviter = await ctx.store.get("profiles", ctx.userId);
  const results: { email: string; status: "invited_member" | "email_sent" | "email_failed" | "email_skipped" | "already_member"; error?: string; link?: string }[] = [];

  for (const email of emails) {
    const [profile] = await ctx.store.select("profiles", { where: [["email", "eq", email]] });
    const [membership] = profile ? await ctx.store.select("organization_members", { where: [["organization_id", "eq", ctx.orgId], ["user_id", "eq", profile.id]] }) : [];
    if (membership) {
      if (input.eventId) {
        await inviteToEvent(ctx, input.eventId, { userIds: [profile.id] });
        results.push({ email, status: "invited_member" });
      } else results.push({ email, status: "already_member" });
      continue;
    }
    const token = randomToken(32);
    const inv = await ctx.store.insert("invitations", {
      event_id: input.eventId ?? null,
      organization_id: ctx.orgId,
      invited_by: ctx.userId,
      invitee_user_id: null,
      invitee_email: email,
      group_id: null,
      status: "pending",
      token_hash: sha256Hex(token),
      responded_at: null,
      org_role: input.eventId ? "guest" : (input.orgRole ?? "member"),
      email_status: null,
      email_error: null,
      expires_at: new Date(ctx.now().getTime() + INVITATION_TTL_DAYS * 86400000).toISOString(),
    });
    const link = `${appUrl}/invitation/${token}`;
    const subject = eventTitle ? `Invitation : ${eventTitle}` : `Invitation à rejoindre ${org?.name ?? "CellConnect"}`;
    const text = [
      `Bonjour,`,
      ``,
      eventTitle
        ? `${inviter?.display_name ?? "Un organisateur"} vous invite à « ${eventTitle} » (${eventWhen}).`
        : `${inviter?.display_name ?? "Un administrateur"} vous invite à rejoindre « ${org?.name ?? "son organisation"} » sur CellConnect AI.`,
      ``,
      `Pour répondre, ouvrez ce lien (valable ${INVITATION_TTL_DAYS} jours, à usage unique) :`,
      link,
      ``,
      `Si vous ne connaissez pas l'expéditeur, ignorez simplement ce message.`,
    ].join("\n");
    let status: "sent" | "failed" | "skipped" = "sent";
    let error: string | null = null;
    if (!ctx.mailer.available) {
      status = "skipped";
      error = "Canal e-mail non configuré (SMTP) : transmettez le lien manuellement.";
    } else {
      try {
        await ctx.mailer.send({ to: email, subject: `[CellConnect] ${subject}`, text });
      } catch (e) {
        status = "failed";
        error = (e as Error).message.slice(0, 300);
      }
    }
    await ctx.store.update("invitations", inv.id, { email_status: status, email_error: error });
    results.push({ email, status: status === "sent" ? "email_sent" : status === "failed" ? "email_failed" : "email_skipped", error: error ?? undefined, ...(status !== "sent" ? { link } : {}) });
  }
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "invitation.email_sent", entityType: input.eventId ? "event" : "organization", entityId: input.eventId ?? ctx.orgId, metadata: { count: emails.length } });
  return results;
}

async function findByToken(store: Ctx["store"], token: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound("Invitation introuvable.");
  const [inv] = await store.select("invitations", { where: [["token_hash", "eq", sha256Hex(token)]] });
  if (!inv || !inv.invitee_email) throw notFound("Invitation introuvable.");
  const expired = inv.expires_at ? Date.parse(inv.expires_at) < now.getTime() : false;
  return { inv, expired };
}

/** Informations PUBLIQUES minimales affichées sur la page du lien (sans compte). */
export async function previewInvitation(store: Ctx["store"], token: string, now = new Date()) {
  const { inv, expired } = await findByToken(store, token, now);
  const org = await store.get("organizations", inv.organization_id);
  const inviter = await store.get("profiles", inv.invited_by);
  const event = inv.event_id ? await store.get("events", inv.event_id) : null;
  return {
    status: expired && inv.status === "pending" ? "expired" : inv.status,
    organization: org?.name ?? null,
    invitedBy: inviter?.display_name ?? null,
    emailHint: inv.invitee_email!.replace(/^(.).*(@.*)$/, "$1…$2"),
    event: event ? { title: event.title, start: event.starts_at, end: event.ends_at, timezone: event.timezone, cancelled: event.status === "cancelled" } : null,
  };
}

/**
 * Acceptation par l'utilisateur connecté : rejoint l'organisation (rôle
 * prévu), puis l'événement. Jeton à usage unique.
 */
export async function acceptInvitationToken(
  base: { store: Ctx["store"]; userId: string; mailer: Ctx["mailer"]; now: () => Date; timezone: string; email: string },
  token: string,
  response: "accepted" | "declined" | "tentative",
) {
  const { inv, expired } = await findByToken(base.store, token, base.now());
  if (inv.status !== "pending") throw badRequest("Cette invitation a déjà été utilisée.");
  if (expired) throw badRequest("Cette invitation a expiré. Demandez-en une nouvelle.");
  const now = base.now().toISOString();
  let [membership] = await base.store.select("organization_members", { where: [["organization_id", "eq", inv.organization_id], ["user_id", "eq", base.userId]] });
  if (!membership && response !== "declined") {
    membership = await base.store.insert("organization_members", { organization_id: inv.organization_id, user_id: base.userId, role: inv.org_role ?? "guest" });
  }
  await base.store.update("invitations", inv.id, { invitee_user_id: base.userId, status: inv.event_id ? response : response === "declined" ? "declined" : "accepted", responded_at: now });
  if (inv.event_id && membership) {
    const ctx: Ctx = { ...base, orgId: inv.organization_id, orgRole: membership.role };
    const [p] = await base.store.select("event_participants", { where: [["event_id", "eq", inv.event_id], ["user_id", "eq", base.userId]] });
    if (!p)
      await base.store.insert("event_participants", { event_id: inv.event_id, organization_id: inv.organization_id, user_id: base.userId, role: "participant", status: "invited", responded_at: null });
    await respondToEvent(ctx, inv.event_id, response);
  }
  const me = await base.store.get("profiles", base.userId);
  const event = inv.event_id ? await base.store.get("events", inv.event_id) : null;
  const label = { accepted: "a accepté", declined: "a décliné", tentative: "a répondu « peut-être » à" }[response];
  await notify(
    base.store,
    {
      userId: inv.invited_by,
      orgId: inv.organization_id,
      type: "invitation_response",
      title: event ? `Réponse à l'invitation : ${event.title}` : "Invitation à l'organisation",
      body: `${me?.display_name ?? inv.invitee_email} ${label} ${event ? `« ${event.title} »` : "l'invitation à rejoindre l'organisation"}.`,
      data: { eventId: inv.event_id, invitationId: inv.id },
      dedupeKey: `invitation-token:${inv.id}`,
    },
    base.mailer,
    base.now(),
  );
  await audit(base.store, { orgId: inv.organization_id, actorId: base.userId, action: `invitation.${response}`, entityType: "invitation", entityId: inv.id });
  return { organizationId: membership ? inv.organization_id : null, eventId: response === "declined" ? null : inv.event_id };
}

/** Annule une invitation envoyée (par son auteur ou un administrateur). */
export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  const inv = await ctx.store.get("invitations", invitationId);
  if (!inv || inv.organization_id !== ctx.orgId) throw notFound("Invitation introuvable.");
  if (inv.invited_by !== ctx.userId && !isOrgAdmin(ctx)) throw forbidden();
  if (inv.status !== "pending") throw badRequest("Cette invitation a déjà reçu une réponse.");
  return ctx.store.update("invitations", inv.id, { status: "cancelled" });
}
