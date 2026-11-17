import { api } from "@/lib/http/api";
import { isOrgAdmin } from "@/lib/auth/permissions";
import type { Filter } from "@/lib/db/store";
import type { AuditLog } from "@/lib/types";

/**
 * Historique : actions de l'utilisateur (ou de toute l'organisation pour un administrateur).
 * Chaque ligne porte le titre de l'élément concerné (événement ou groupe) quand on peut le montrer :
 * élément de l'organisation courante, et pour un événement sans groupe, seulement s'il est le vôtre
 * (un événement personnel d'un autre membre reste anonyme).
 */
export const GET = api(async ({ req, ctx }) => {
  const scope = req.nextUrl.searchParams.get("scope");
  const where: Filter<AuditLog>[] = scope === "org" && isOrgAdmin(ctx) ? [["organization_id", "eq", ctx.orgId]] : [["actor_id", "eq", ctx.userId]];
  const logs = await ctx.store.select("audit_logs", { where, order: [{ column: "created_at", ascending: false }], limit: 200 });

  const idsOf = (type: string) => [...new Set(logs.filter((l) => l.entity_type === type && l.entity_id).map((l) => l.entity_id as string))];
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => Boolean(x)))];
  const eventIds = idsOf("event");
  const groupIds = idsOf("group");
  const [profiles, events, groups] = await Promise.all([
    actorIds.length ? ctx.store.select("profiles", { where: [["id", "in", actorIds]] }) : [],
    eventIds.length ? ctx.store.select("events", { where: [["id", "in", eventIds]] }) : [],
    groupIds.length ? ctx.store.select("groups", { where: [["id", "in", groupIds]] }) : [],
  ]);

  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  const titles = new Map<string, string>();
  for (const e of events) {
    if (e.organization_id === ctx.orgId && (e.group_id !== null || e.created_by === ctx.userId)) titles.set(`event:${e.id}`, e.title);
  }
  for (const g of groups) if (g.organization_id === ctx.orgId) titles.set(`group:${g.id}`, g.name);

  return {
    logs: logs.map((l) => ({
      ...l,
      actor: l.actor_id ? (names.get(l.actor_id) ?? "—") : "Système",
      title: l.entity_id ? (titles.get(`${l.entity_type}:${l.entity_id}`) ?? null) : null,
    })),
  };
});
