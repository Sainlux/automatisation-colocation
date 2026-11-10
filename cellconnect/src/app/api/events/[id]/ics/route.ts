import { api } from "@/lib/http/api";
import { loadViewableEvent } from "@/lib/auth/permissions";
import { withExceptions } from "@/lib/agents/conflict-agent";
import { eventsToIcs } from "@/lib/ics";
import { env } from "@/lib/env";

export const GET = api(async ({ ctx, params }) => {
  const event = await loadViewableEvent(ctx, params.id);
  return new Response(eventsToIcs(await withExceptions(ctx.store, [event]), env.appUrl), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="evenement-${event.id.slice(0, 8)}.ics"`,
      "cache-control": "private, no-store",
    },
  });
});
