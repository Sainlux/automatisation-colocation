import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { inviteToEvent } from "@/lib/agents/invitation-agent";

const schema = z.object({ userIds: z.array(z.string().uuid()).max(200).optional(), groupId: z.string().uuid().nullish() });
export const POST = api(async ({ req, ctx, params }) => ({ results: await inviteToEvent(ctx, params.id, await body(req, schema)) }));
