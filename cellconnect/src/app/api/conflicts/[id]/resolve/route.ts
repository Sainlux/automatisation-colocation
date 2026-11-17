import { api, body, idempotent } from "@/lib/http/api";
import { resolveConflict, resolveSchema } from "@/lib/agents/conflict-resolution";

export const POST = api(async ({ req, ctx, params }) => {
  const input = await body(req, resolveSchema);
  return idempotent(ctx, req, `conflict.resolve:${params.id}`, () => resolveConflict(ctx, params.id, input));
});
