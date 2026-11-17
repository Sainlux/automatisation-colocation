import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { checkDraftConflicts } from "@/lib/agents/orchestrator";

/** Vérifie des brouillons contre l'agenda de l'utilisateur, AVANT toute création. */
export const POST = api(async ({ req, ctx }) => {
  const { drafts } = await body(req, z.object({ drafts: z.array(z.unknown()).min(1).max(50) }));
  return checkDraftConflicts(ctx, drafts);
}, { rateLimit: 60 });
