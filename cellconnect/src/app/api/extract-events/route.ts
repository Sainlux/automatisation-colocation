import { after } from "next/server";
import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { getJob, listJobs, runExtractionJob } from "@/lib/agents/orchestrator";

export const maxDuration = 60;

/** Lance l'analyse (asynchrone) d'un envoi ; la progression se consulte via GET /api/extract-events/:id. */
export const POST = api(
  async ({ req, ctx }) => {
    const { jobId } = await body(req, z.object({ jobId: z.string().uuid() }));
    const { job } = await getJob(ctx, jobId);
    if (job.status === "pending") {
      const store = ctx.store;
      // Exécuté après l'envoi de la réponse ; le worker reprend la tâche si elle est interrompue.
      after(() => runExtractionJob(store, job.id));
    }
    return { jobId: job.id, status: job.status };
  },
  { rateLimit: 20 },
);

/** Nombre d'analyses renvoyées : ?limit=1..50 (20 par défaut, valeur invalide ignorée). */
function parseJobsLimit(raw: string | null): number {
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 20;
}

export const GET = api(async ({ req, ctx }) => ({ jobs: await listJobs(ctx, parseJobsLimit(new URL(req.url).searchParams.get("limit"))) }));
