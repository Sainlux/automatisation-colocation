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
    })),
    providers: {
      google: { available: env.google.configured, reason: env.google.configured ? null : "Identifiants Google non configurés (voir docs/GOOGLE_CALENDAR.md)" },
      outlook: { available: false, reason: "Prévu pour une version ultérieure" },
      ics: { available: true, reason: null },
    },
  };
});
