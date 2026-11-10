import { z } from "zod";
import type { Ctx } from "@/lib/context";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { assertCanManageGroup, canManageGroup, hasOrgRole, isOrgAdmin, loadGroupInOrg } from "@/lib/auth/permissions";
import { UniqueViolationError } from "@/lib/db/store";
import type { GroupRole, OrgRole } from "@/lib/types";

/** GroupAgent — organisations, groupes, membres et rôles. */

export const groupInputSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120),
  description: z.string().trim().max(1000).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#1d4ed8"),
});

export async function listGroups(ctx: Ctx) {
  const groups = await ctx.store.select("groups", { where: [["organization_id", "eq", ctx.orgId]], order: [{ column: "name" }] });
  const memberships = await ctx.store.select("group_members", { where: [["organization_id", "eq", ctx.orgId]] });
  const mine = new Map(memberships.filter((m) => m.user_id === ctx.userId).map((m) => [m.group_id, m.role]));
  return Promise.all(
    groups
      .filter((g) => isOrgAdmin(ctx) || mine.has(g.id))
      .map(async (g) => ({
        ...g,
        myRole: mine.get(g.id) ?? null,
        memberCount: memberships.filter((m) => m.group_id === g.id).length,
        canManage: await canManageGroup(ctx, g),
      })),
  );
}

export async function createGroup(ctx: Ctx, input: z.infer<typeof groupInputSchema>) {
  if (!hasOrgRole(ctx.orgRole, "group_leader")) {
    throw forbidden("Seuls les responsables de groupe et administrateurs peuvent créer un groupe.");
  }
  const g = await ctx.store.insert("groups", {
    organization_id: ctx.orgId,
    name: input.name,
    description: input.description ?? null,
    color: input.color,
    created_by: ctx.userId,
    updated_at: ctx.now().toISOString(),
  });
  await ctx.store.insert("group_members", { group_id: g.id, organization_id: ctx.orgId, user_id: ctx.userId, role: "leader" });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "group.created", entityType: "group", entityId: g.id });
  return g;
}

export async function updateGroup(ctx: Ctx, groupId: string, input: Partial<z.infer<typeof groupInputSchema>>) {
  const g = await loadGroupInOrg(ctx, groupId);
  await assertCanManageGroup(ctx, g);
  const updated = await ctx.store.update("groups", g.id, {
    name: input.name ?? g.name,
    description: input.description !== undefined ? (input.description ?? null) : g.description,
    color: input.color ?? g.color,
  });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "group.updated", entityType: "group", entityId: g.id });
  return updated;
}

export async function deleteGroup(ctx: Ctx, groupId: string) {
  const g = await loadGroupInOrg(ctx, groupId);
  if (!isOrgAdmin(ctx) && g.created_by !== ctx.userId) throw forbidden("Seul le créateur ou un administrateur peut supprimer le groupe.");
  const events = await ctx.store.select("events", { where: [["group_id", "eq", g.id], ["status", "neq", "cancelled"]] });
  if (events.length) throw badRequest("Ce groupe a encore des événements actifs : annulez-les ou détachez-les d'abord.");
  await ctx.store.deleteWhere("group_members", [["group_id", "eq", g.id]]);
  await ctx.store.delete("groups", g.id);
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "group.deleted", entityType: "group", entityId: g.id });
}

export async function listGroupMembers(ctx: Ctx, groupId: string) {
  const g = await loadGroupInOrg(ctx, groupId);
  const members = await ctx.store.select("group_members", { where: [["group_id", "eq", g.id]] });
  if (!isOrgAdmin(ctx) && !members.some((m) => m.user_id === ctx.userId)) throw notFound("Groupe introuvable.");
  const profiles = members.length ? await ctx.store.select("profiles", { where: [["id", "in", members.map((m) => m.user_id)]] }) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return {
    group: g,
    canManage: await canManageGroup(ctx, g),
    members: members.map((m) => ({ id: m.id, userId: m.user_id, role: m.role, name: byId.get(m.user_id)?.display_name ?? "—", email: byId.get(m.user_id)?.email ?? null })),
  };
}

export async function addGroupMember(ctx: Ctx, groupId: string, userId: string, role: GroupRole = "member") {
  const g = await loadGroupInOrg(ctx, groupId);
  await assertCanManageGroup(ctx, g);
  const [orgMember] = await ctx.store.select("organization_members", { where: [["organization_id", "eq", ctx.orgId], ["user_id", "eq", userId]] });
  if (!orgMember) throw badRequest("Cette personne n'est pas membre de l'organisation.");
  try {
    const m = await ctx.store.insert("group_members", { group_id: g.id, organization_id: ctx.orgId, user_id: userId, role });
    await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "group.member_added", entityType: "group", entityId: g.id, metadata: { userId, role } });
    return m;
  } catch (e) {
    if (e instanceof UniqueViolationError) throw badRequest("Cette personne est déjà membre du groupe.");
    throw e;
  }
}

export async function updateGroupMember(ctx: Ctx, groupId: string, memberId: string, role: GroupRole) {
  const g = await loadGroupInOrg(ctx, groupId);
  await assertCanManageGroup(ctx, g);
  const m = await ctx.store.get("group_members", memberId);
  if (!m || m.group_id !== g.id) throw notFound("Membre introuvable.");
  return ctx.store.update("group_members", m.id, { role });
}

export async function removeGroupMember(ctx: Ctx, groupId: string, memberId: string) {
  const g = await loadGroupInOrg(ctx, groupId);
  const m = await ctx.store.get("group_members", memberId);
  if (!m || m.group_id !== g.id) throw notFound("Membre introuvable.");
  if (m.user_id !== ctx.userId) await assertCanManageGroup(ctx, g); // on peut toujours quitter un groupe
  await ctx.store.delete("group_members", m.id);
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "group.member_removed", entityType: "group", entityId: g.id, metadata: { userId: m.user_id } });
}

// --- Organisation -----------------------------------------------------------

export async function listOrgMembers(ctx: Ctx) {
  const members = await ctx.store.select("organization_members", { where: [["organization_id", "eq", ctx.orgId]] });
  const profiles = members.length ? await ctx.store.select("profiles", { where: [["id", "in", members.map((m) => m.user_id)]] }) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return members.map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    name: byId.get(m.user_id)?.display_name ?? "—",
    // L'e-mail n'est visible que des administrateurs.
    email: isOrgAdmin(ctx) ? (byId.get(m.user_id)?.email ?? null) : null,
  }));
}

export async function addOrgMemberByEmail(ctx: Ctx, email: string, role: OrgRole) {
  if (!isOrgAdmin(ctx)) throw forbidden("Réservé aux administrateurs de l'organisation.");
  if (role === "super_admin" && ctx.orgRole !== "super_admin") throw forbidden("Rôle non attribuable.");
  const [profile] = await ctx.store.select("profiles", { where: [["email", "eq", email.trim().toLowerCase()]] });
  if (!profile) throw badRequest("Aucun compte CellConnect avec cet e-mail. La personne doit d'abord créer son compte.");
  try {
    const m = await ctx.store.insert("organization_members", { organization_id: ctx.orgId, user_id: profile.id, role });
    await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "org.member_added", entityType: "organization", entityId: ctx.orgId, metadata: { userId: profile.id, role } });
    return m;
  } catch (e) {
    if (e instanceof UniqueViolationError) throw badRequest("Cette personne est déjà membre.");
    throw e;
  }
}

export async function updateOrgMemberRole(ctx: Ctx, memberId: string, role: OrgRole) {
  if (!isOrgAdmin(ctx)) throw forbidden("Réservé aux administrateurs de l'organisation.");
  const m = await ctx.store.get("organization_members", memberId);
  if (!m || m.organization_id !== ctx.orgId) throw notFound("Membre introuvable.");
  if ((role === "super_admin" || m.role === "super_admin") && ctx.orgRole !== "super_admin") throw forbidden("Rôle non modifiable.");
  if (m.user_id === ctx.userId && !hasOrgRole(role, "org_admin")) {
    const admins = (await ctx.store.select("organization_members", { where: [["organization_id", "eq", ctx.orgId]] })).filter((x) => hasOrgRole(x.role, "org_admin"));
    if (admins.length <= 1) throw badRequest("L'organisation doit conserver au moins un administrateur.");
  }
  const updated = await ctx.store.update("organization_members", m.id, { role });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "org.role_changed", entityType: "organization", entityId: ctx.orgId, metadata: { memberId, role } });
  return updated;
}
