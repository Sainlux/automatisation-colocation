import { api } from "@/lib/http/api";
import { listCalendar } from "@/lib/agents/calendar-agent";
import { listGroups } from "@/lib/agents/group-agent";
import { listJobs } from "@/lib/agents/orchestrator";
import { DateTime } from "luxon";

/** Fenêtre de l'accueil : aujourd'hui et les 14 jours suivants (suffisant pour « à venir »). */
const WINDOW_DAYS = 14;

export const GET = api(async ({ ctx }) => {
  const now = DateTime.fromJSDate(ctx.now()).setZone(ctx.timezone);
  const todayEnd = now.endOf("day").toMillis();
  const weekAgo = now.minus({ days: 7 }).toUTC().toISO()!;
  // Toutes les lectures en parallèle ; les compteurs utilisent count (aucune ligne transférée).
  const [upcoming, openConflicts, pendingInvitations, notifications, groups, jobs, failedSyncs, savedEvents] = await Promise.all([
    listCalendar(ctx, now.startOf("day").toUTC().toISO()!, now.plus({ days: WINDOW_DAYS }).toUTC().toISO()!),
    ctx.store.count("calendar_conflicts", [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "open"]]),
    ctx.store.count("invitations", [["invitee_user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "pending"]]),
    ctx.store.select("notifications", { where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["read_at", "is", null]], order: [{ column: "created_at", ascending: false }], limit: 5 }),
    listGroups(ctx),
    listJobs(ctx, 5),
    ctx.store.select("agent_tasks", {
      where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "failed"], ["updated_at", "gte", weekAgo]],
      order: [{ column: "updated_at", ascending: false }],
      limit: 5,
    }),
    ctx.store.count("events", [["created_by", "eq", ctx.userId]]),
  ]);
  return {
    today: upcoming.filter((e) => Date.parse(e.start) <= todayEnd && Date.parse(e.end) >= now.toMillis()),
    upcoming: upcoming.filter((e) => Date.parse(e.end) >= now.toMillis()).slice(0, 8),
    openConflicts,
    pendingInvitations,
    notifications,
    groups: groups.slice(0, 6),
    jobs,
    pendingReview: jobs.filter((j) => j.status === "needs_review").length,
    failures: failedSyncs.map((t) => ({ id: t.id, type: t.type })),
    /** Vrai dès que l'utilisateur a enregistré au moins un événement (parcours de première utilisation). */
    firstEventSaved: savedEvents > 0,
  };
});
