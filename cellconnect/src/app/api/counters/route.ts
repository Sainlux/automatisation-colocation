import { api } from "@/lib/http/api";

/**
 * Compteurs légers pour la navigation (pastilles) : trois comptages en
 * parallèle, aucune ligne transférée.
 */
export const GET = api(async ({ ctx }) => {
  const [openConflicts, pendingInvitations, unread] = await Promise.all([
    ctx.store.count("calendar_conflicts", [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "open"]]),
    ctx.store.count("invitations", [["invitee_user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["status", "eq", "pending"]]),
    ctx.store.count("notifications", [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId], ["read_at", "is", null]]),
  ]);
  return { openConflicts, pendingInvitations, unread };
});
