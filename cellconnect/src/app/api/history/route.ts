import { api } from "@/lib/http/api";
import { isOrgAdmin } from "@/lib/auth/permissions";

/** Historique : actions de l'utilisateur (ou de toute l'organisation pour un administrateur). */
export const GET = api(async ({ req, ctx }) => {
  const scope = req.nextUrl.searchParams.get("scope");
  const where = scope === "org" && isOrgAdmin(ctx) ? [["organization_id", "eq", ctx.orgId] as const] : [["actor_id", "eq", ctx.userId] as const];
  const logs = await ctx.store.select("audit_logs", { where: where.map((w) => [...w]) as never, order: [{ column: "created_at", ascending: false }], limit: 200 });
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const profiles = actorIds.length ? await ctx.store.select("profiles", { where: [["id", "in", actorIds]] }) : [];
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  return { logs: logs.map((l) => ({ ...l, actor: l.actor_id ? (names.get(l.actor_id) ?? "—") : "Système" })) };
});
