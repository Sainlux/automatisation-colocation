import { api } from "@/lib/http/api";
import { listCalendar } from "@/lib/agents/calendar-agent";
import { listGroups } from "@/lib/agents/group-agent";
import { listJobs } from "@/lib/agents/orchestrator";
import { DateTime } from "luxon";

export const GET = api(async ({ ctx }) => {
  const now = DateTime.now().setZone(ctx.timezone);
  const upcoming = await listCalendar(ctx, now.startOf("day").toUTC().toISO()!, now.plus({ days: 60 }).toUTC().toISO()!);
  const todayEnd = now.endOf("day").toMillis();
  const [conflicts, invitations, notifications, groups, jobs] = await Promise.all([
    ctx.store.select("calendar_conflicts", { where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "open"]] }),
    ctx.store.select("invitations", { where: [["invitee_user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "pending"]] }),
    ctx.store.select("notifications", { where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["read_at", "is", null]], order: [{ column: "created_at", ascending: false }], limit: 5 }),
    listGroups(ctx),
    listJobs(ctx, 5),
  ]);
  const failedSyncs = await ctx.store.select("agent_tasks", { where: [["user_id", "eq", ctx.userId], ["status", "eq", "failed"]], limit: 5 });
  return {
    today: upcoming.filter((e) => Date.parse(e.start) <= todayEnd && Date.parse(e.end) >= now.toMillis()),
    upcoming: upcoming.filter((e) => Date.parse(e.end) >= now.toMillis()).slice(0, 8),
    openConflicts: conflicts.length,
    pendingInvitations: invitations.length,
    notifications,
    groups: groups.slice(0, 6),
    jobs,
    pendingReview: jobs.filter((j) => j.status === "needs_review").length,
    failures: failedSyncs.map((t) => ({ id: t.id, type: t.type, error: t.error })),
  };
});
