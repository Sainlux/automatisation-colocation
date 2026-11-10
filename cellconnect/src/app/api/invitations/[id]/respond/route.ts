import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { respondToInvitation } from "@/lib/agents/invitation-agent";

export const POST = api(async ({ req, ctx, params }) => {
  const { response } = await body(req, z.object({ response: z.enum(["accepted", "declined", "tentative"]) }));
  return { invitation: await respondToInvitation(ctx, params.id, response) };
});
