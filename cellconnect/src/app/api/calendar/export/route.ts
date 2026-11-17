import { api } from "@/lib/http/api";
import { activeEventsForUser } from "@/lib/agents/conflict-agent";
import { eventsToIcs } from "@/lib/ics";
import { env } from "@/lib/env";

/** Export iCalendar (.ics) de tous les événements actifs de l'utilisateur. */
export const GET = api(async ({ ctx }) => {
  const events = await activeEventsForUser(ctx.store, ctx.userId, ctx.orgId);
  return new Response(eventsToIcs(events, env.appUrl, "CellConnect AI — mon agenda"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="cellconnect.ics"',
      "cache-control": "private, no-store",
    },
  });
});
