import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { respondToEvent } from "@/lib/agents/calendar-agent";

export const POST = api(async ({ req, ctx, params }) => {
  const { status } = await body(req, z.object({ status: z.enum(["accepted", "declined", "tentative"]) }));
  return { participant: await respondToEvent(ctx, params.id, status) };
});
