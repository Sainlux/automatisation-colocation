import type { Ctx } from "@/lib/context";
import { forbidden, notFound } from "@/lib/errors";
import type { EventRow, Group, OrgRole } from "@/lib/types";

/**
 * Règles d'autorisation centralisées. Appliquées par tous les agents avant
 * toute lecture ou écriture, quel que soit le backend de données.
 */

const RANK: Record<OrgRole, number> = { guest: 1, member: 2, group_leader: 3, org_admin: 4, super_admin: 5 };

export function hasOrgRole(role: OrgRole, min: OrgRole): boolean {
  return RANK[role] >= RANK[min];
}

export function isOrgAdmin(ctx: Ctx): boolean {
  return hasOrgRole(ctx.orgRole, "org_admin");
}

export async function groupRole(ctx: Ctx, groupId: string) {
  const [m] = await ctx.store.select("group_members", {
    where: [
      ["group_id", "eq", groupId],
      ["user_id", "eq", ctx.userId],
    ],
  });
  return m?.role ?? null;
}

export async function loadGroupInOrg(ctx: Ctx, groupId: string): Promise<Group> {
  const g = await ctx.store.get("groups", groupId);
  if (!g || g.organization_id !== ctx.orgId) throw notFound("Groupe introuvable.");
  return g;
}

export async function canManageGroup(ctx: Ctx, group: Group): Promise<boolean> {
  if (group.organization_id !== ctx.orgId) return false;
  if (isOrgAdmin(ctx)) return true;
  return (await groupRole(ctx, group.id)) === "leader";
}

export async function assertCanManageGroup(ctx: Ctx, group: Group) {
  if (!(await canManageGroup(ctx, group))) throw forbidden("Seuls les responsables du groupe peuvent effectuer cette action.");
}

/** Peut modifier / déplacer / annuler l'événement collectif. */
export async function canEditEvent(ctx: Ctx, event: EventRow): Promise<boolean> {
  if (event.organization_id !== ctx.orgId) return false;
  if (event.created_by === ctx.userId) return true;
  if (isOrgAdmin(ctx)) return true;
  if (event.group_id) return (await groupRole(ctx, event.group_id)) === "leader";
  return false;
}

export async function canViewEvent(ctx: Ctx, event: EventRow): Promise<boolean> {
  if (event.organization_id !== ctx.orgId) return false;
  if (event.created_by === ctx.userId || isOrgAdmin(ctx)) return true;
  const [p] = await ctx.store.select("event_participants", {
    where: [
      ["event_id", "eq", event.id],
      ["user_id", "eq", ctx.userId],
    ],
  });
  if (p) return true;
  if (event.visibility === "organization") return true;
  if (event.visibility === "group" && event.group_id) return (await groupRole(ctx, event.group_id)) !== null;
  return false;
}

export async function loadViewableEvent(ctx: Ctx, eventId: string): Promise<EventRow> {
  const e = await ctx.store.get("events", eventId);
  // On renvoie 404 (et non 403) pour ne pas révéler l'existence d'un événement d'une autre organisation.
  if (!e || !(await canViewEvent(ctx, e))) throw notFound("Événement introuvable.");
  return e;
}

export async function loadEditableEvent(ctx: Ctx, eventId: string): Promise<EventRow> {
  const e = await loadViewableEvent(ctx, eventId);
  if (!(await canEditEvent(ctx, e)))
    throw forbidden("Seul l'organisateur ou un responsable autorisé peut modifier ou annuler cet événement.");
  return e;
}
