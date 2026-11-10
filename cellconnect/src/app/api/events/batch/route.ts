import { z } from "zod";
import { api, body, idempotent } from "@/lib/http/api";
import { commitDrafts } from "@/lib/agents/orchestrator";

const schema = z.object({
  jobId: z.string().uuid().nullish(),
  drafts: z.array(z.unknown()).min(1).max(50),
  decisions: z.array(z.unknown()).max(50).default([]),
});

/** Création confirmée d'un lot d'événements (après validation et choix face aux conflits). */
export const POST = api(async ({ req, ctx }) => {
  const input = await body(req, schema);
  return idempotent(ctx, req, "events.batch", () => commitDrafts(ctx, input));
}, { rateLimit: 30 });
