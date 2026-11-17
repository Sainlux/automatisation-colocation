import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { draftSchema } from "@/lib/schemas/draft";
import { saveDrafts } from "@/lib/agents/orchestrator";

/** Enregistre les corrections de l'utilisateur sur les brouillons. */
export const PUT = api(async ({ req, ctx, params }) => {
  const { drafts } = await body(req, z.object({ drafts: z.array(draftSchema).max(50) }));
  await saveDrafts(ctx, params.id, drafts);
  return { ok: true };
});
