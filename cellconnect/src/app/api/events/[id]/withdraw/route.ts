import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { withdrawFromEvent } from "@/lib/agents/calendar-agent";

const schema = z.object({ notifyOrganizer: z.boolean().default(false), message: z.string().trim().max(1000).nullish() });

/** Désistement personnel : l'événement est maintenu pour les autres participants. */
export const POST = api(async ({ req, ctx, params }) => {
  const input = await body(req, schema);
  const r = await withdrawFromEvent(ctx, params.id, input);
  return {
    cancelledPersonalEvent: r.cancelledPersonalEvent,
    notified: r.notified,
    deliveries: (r.deliveries ?? []).map((d) => {
      const x = d as { channel: string; status: string; last_error: string | null };
      return { channel: x.channel, status: x.status, error: x.last_error };
    }),
  };
});
