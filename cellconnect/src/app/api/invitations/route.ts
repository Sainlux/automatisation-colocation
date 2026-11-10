import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { inviteToEvent, listInvitations } from "@/lib/agents/invitation-agent";

export const GET = api(async ({ ctx }) => listInvitations(ctx));

const schema = z.object({ eventId: z.string().uuid(), userIds: z.array(z.string().uuid()).max(200).optional(), groupId: z.string().uuid().nullish() });
export const POST = api(async ({ req, ctx }) => {
  const { eventId, ...target } = await body(req, schema);
  return { results: await inviteToEvent(ctx, eventId, target) };
});
