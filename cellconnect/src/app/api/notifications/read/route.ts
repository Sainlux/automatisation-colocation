import { z } from "zod";
import { api, body } from "@/lib/http/api";

export const POST = api(async ({ req, ctx }) => {
  const input = await body(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }));
  const rows = await ctx.store.select("notifications", { where: [["user_id", "eq", ctx.userId], ["read_at", "is", null]] });
  const now = ctx.now().toISOString();
  let n = 0;
  for (const r of rows) {
    if (input.all || input.ids?.includes(r.id)) {
      await ctx.store.update("notifications", r.id, { read_at: now });
      n++;
    }
  }
  return { updated: n };
});
