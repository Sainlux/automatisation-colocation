import type { Ctx } from "@/lib/context";
import { integrationStatus } from "@/lib/env";

/**
 * Profil de l'utilisateur connecté, son organisation courante et ses autres
 * organisations. Profil, adhésions et organisation courante sont lus en
 * parallèle ; les autres organisations ne sont chargées que si besoin.
 */
export async function getMe(ctx: Ctx) {
  const [profile, memberships, current] = await Promise.all([
    ctx.store.get("profiles", ctx.userId),
    ctx.store.select("organization_members", { where: [["user_id", "eq", ctx.userId]] }),
    ctx.store.get("organizations", ctx.orgId),
  ]);
  const otherIds = memberships.map((m) => m.organization_id).filter((id) => id !== ctx.orgId);
  const others = otherIds.length ? await ctx.store.select("organizations", { where: [["id", "in", otherIds]] }) : [];
  const orgs = [...(current && memberships.some((m) => m.organization_id === current.id) ? [current] : []), ...others];
  return {
    profile,
    organization: orgs.find((o) => o.id === ctx.orgId) ?? null,
    role: ctx.orgRole,
    organizations: orgs.map((o) => ({ id: o.id, name: o.name, role: memberships.find((m) => m.organization_id === o.id)?.role })),
    integrations: integrationStatus(),
  };
}

export type Me = Awaited<ReturnType<typeof getMe>>;
