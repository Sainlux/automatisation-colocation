import { api } from "@/lib/http/api";
import { deleteJobSources } from "@/lib/agents/orchestrator";

/** Supprime définitivement les captures/fichiers d'une analyse. */
export const DELETE = api(async ({ ctx, params }) => {
  await deleteJobSources(ctx, params.id);
  return { ok: true };
});
