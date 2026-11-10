import { after } from "next/server";
import { api } from "@/lib/http/api";
import { retryJob, runExtractionJob } from "@/lib/agents/orchestrator";

export const POST = api(async ({ ctx, params }) => {
  const job = await retryJob(ctx, params.id);
  const store = ctx.store;
  after(() => runExtractionJob(store, job.id));
  return { ok: true };
}, { rateLimit: 10 });
