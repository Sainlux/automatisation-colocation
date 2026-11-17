import { api, body } from "@/lib/http/api";
import { eventPatchSchema } from "@/lib/schemas/event";
import { cancelEvent, getEventDetails, updateEvent } from "@/lib/agents/calendar-agent";

/** Détail d'un événement ; ?occurrence=<début d'origine ISO> ajoute l'état de cette date (prévue, déplacée, annulée). */
export const GET = api(async ({ req, ctx, params }) => getEventDetails(ctx, params.id, req.nextUrl.searchParams.get("occurrence")));

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
