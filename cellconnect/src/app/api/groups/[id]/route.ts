import { api, body } from "@/lib/http/api";
import { deleteGroup, groupInputSchema, listGroupMembers, updateGroup } from "@/lib/agents/group-agent";

export const GET = api(async ({ ctx, params }) => listGroupMembers(ctx, params.id));
export const PATCH = api(async ({ req, ctx, params }) => ({ group: await updateGroup(ctx, params.id, await body(req, groupInputSchema.partial())) }));
export const DELETE = api(async ({ ctx, params }) => {
  await deleteGroup(ctx, params.id);
  return { ok: true };
});
