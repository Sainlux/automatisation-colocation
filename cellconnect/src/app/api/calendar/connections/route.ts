import { api } from "@/lib/http/api";
import { env } from "@/lib/env";

export const GET = api(async ({ ctx }) => {
  const conns = await ctx.store.select("calendar_connections", { where: [["user_id", "eq", ctx.userId]] });
  return {
    connections: conns.map((c) => ({
      id: c.id,
      provider: c.provider,
      accountEmail: c.account_email,
      status: c.status,
      lastSyncedAt: c.last_synced_at,
      lastError: c.last_error,
      webhook: Boolean(c.watch_channel_id && c.watch_expires_at && Date.parse(c.watch_expires_at) > Date.now()),
    })),
    providers: {
      google: { available: env.google.configured, reason: env.google.configured ? null : "Identifiants Google non configurés (voir docs/GOOGLE_CALENDAR.md)" },
      outlook: { available: env.microsoft.configured, reason: env.microsoft.configured ? null : "Identifiants Microsoft non configurés (voir docs/OUTLOOK_ZOOM.md)" },
      zoom: { available: env.zoom.configured, reason: env.zoom.configured ? null : "Identifiants Zoom non configurés (voir docs/OUTLOOK_ZOOM.md)" },
      ics: { available: true, reason: null },
    },
  };
});
