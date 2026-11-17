import { api, body } from "@/lib/http/api";
import { createGroup, groupInputSchema, listGroups } from "@/lib/agents/group-agent";

export const GET = api(async ({ ctx }) => ({ groups: await listGroups(ctx) }));
export const POST = api(async ({ req, ctx }) => ({ group: await createGroup(ctx, await body(req, groupInputSchema)) }));
