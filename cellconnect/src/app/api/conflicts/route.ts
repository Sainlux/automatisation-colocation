import { api } from "@/lib/http/api";
import { listConflicts } from "@/lib/agents/conflict-resolution";

export const GET = api(async ({ req, ctx }) => {
  const s = req.nextUrl.searchParams.get("status");
  const statuses = s === "all" ? (["open", "postponed", "resolved", "dismissed"] as const) : (["open", "postponed"] as const);
  return { conflicts: await listConflicts(ctx, [...statuses]) };
});
