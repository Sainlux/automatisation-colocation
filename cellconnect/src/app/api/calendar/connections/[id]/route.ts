import { api } from "@/lib/http/api";
import { notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";

/** Déconnecte un calendrier externe et efface ses jetons chiffrés. */
export const DELETE = api(async ({ ctx, params }) => {
  const c = await ctx.store.get("calendar_connections", params.id);
  if (!c || c.user_id !== ctx.userId) throw notFound();
  await ctx.store.update("calendar_connections", c.id, { status: "revoked", access_token_enc: null, refresh_token_enc: null });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "calendar.disconnected", entityType: "calendar_connection", entityId: c.id });
  return { ok: true };
});
