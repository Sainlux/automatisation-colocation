import { api, body } from "@/lib/http/api";
import { eventPatchSchema } from "@/lib/schemas/event";
import { cancelEvent, getEventDetails, updateEvent } from "@/lib/agents/calendar-agent";

export const GET = api(async ({ ctx, params }) => getEventDetails(ctx, params.id));

export const PATCH = api(async ({ req, ctx, params }) => {
  const patch = await body(req, eventPatchSchema);
  return { event: await updateEvent(ctx, params.id, patch) };
});

/**
 * Annulation COLLECTIVE de l'événement (organisateur / responsable uniquement).
 * Exige ?confirm=true. Pour un désistement personnel : POST /api/events/:id/withdraw.
 */
export const DELETE = api(async ({ req, ctx, params }) => {
  const sp = req.nextUrl.searchParams;
  const r = await cancelEvent(ctx, params.id, { confirm: sp.get("confirm") === "true", message: sp.get("message") });
  return { event: r.event, notified: r.notified, deliveries: (r.deliveries ?? []).map((d) => ({ channel: d.channel, status: d.status, error: d.last_error })) };
});
