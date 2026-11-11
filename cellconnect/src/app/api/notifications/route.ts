import { api } from "@/lib/http/api";

export const GET = api(async ({ ctx }) => {
  const notifications = await ctx.store.select("notifications", {
    where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId]],
    order: [{ column: "created_at", ascending: false }],
    limit: 100,
  });
  const ids = notifications.map((n) => n.id);
  const deliveries = ids.length ? await ctx.store.select("notification_deliveries", { where: [["notification_id", "in", ids]] }) : [];
  return {
    notifications: notifications.map((n) => ({
      ...n,
      deliveries: deliveries.filter((d) => d.notification_id === n.id).map((d) => ({ channel: d.channel, status: d.status, attempts: d.attempts, error: d.last_error })),
    })),
    unread: notifications.filter((n) => !n.read_at).length,
  };
});
