import { api } from "@/lib/http/api";
import { getJob } from "@/lib/agents/orchestrator";

export const GET = api(async ({ ctx, params }) => getJob(ctx, params.id));
