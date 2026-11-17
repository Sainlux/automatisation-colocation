import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { setActiveOrg } from "@/lib/auth/session";
import { forbidden } from "@/lib/errors";

export const POST = api(async ({ req, ctx }) => {
  const { orgId } = await body(req, z.object({ orgId: z.string().uuid() }));
  const [m] = await ctx.store.select("organization_members", { where: [["organization_id", "eq", orgId], ["user_id", "eq", ctx.userId]] });
  if (!m) throw forbidden("Vous n'êtes pas membre de cette organisation.");
  await setActiveOrg(orgId);
  return { ok: true };
});
