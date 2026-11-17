import { z } from "zod";
import { api, body, REQUEST_REJECTED } from "@/lib/http/api";
import { AppError } from "@/lib/errors";
import { eventPatchSchema } from "@/lib/schemas/event";
import { cancelEvent, getEventDetails, updateEvent } from "@/lib/agents/calendar-agent";

/** Détail d'un événement ; ?occurrence=<début d'origine ISO> ajoute l'état de cette date (prévue, déplacée, annulée). */
export const GET = api(async ({ req, ctx, params }) => getEventDetails(ctx, params.id, req.nextUrl.searchParams.get("occurrence")));

export const PATCH = api(async ({ req, ctx, params }) => {
  const patch = await body(req, eventPatchSchema);
  return { event: await updateEvent(ctx, params.id, patch) };
});

/** Taille maximale du corps d'annulation (le message lui-même est limité à 1000 caractères). */
const MAX_CANCEL_BODY = 8192;
const cancelSchema = z.object({ message: z.string().trim().max(1000).nullish() });

/** Message d'annulation : corps JSON { message } (préféré) ou, pour compatibilité, ?message=. */
async function cancelMessage(req: Request, sp: URLSearchParams): Promise<string | null> {
  const raw = await req.text();
  if (raw.length > MAX_CANCEL_BODY) throw new AppError(400, "bad_request", REQUEST_REJECTED);
  if (raw.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AppError(400, "bad_request", REQUEST_REJECTED);
    }
    return cancelSchema.parse(json).message || null;
  }
  return cancelSchema.parse({ message: sp.get("message") }).message || null;
}

/**
 * Annulation COLLECTIVE de l'événement (organisateur / responsable uniquement).
 * Exige ?confirm=true ; message facultatif (1000 caractères max) dans le corps JSON.
 * Pour un désistement personnel : POST /api/events/:id/withdraw.
 */
export const DELETE = api(async ({ req, ctx, params }) => {
  const sp = req.nextUrl.searchParams;
  const message = await cancelMessage(req, sp);
  const r = await cancelEvent(ctx, params.id, { confirm: sp.get("confirm") === "true", message });
  return { event: r.event, notified: r.notified, deliveries: (r.deliveries ?? []).map((d) => ({ channel: d.channel, status: d.status, error: d.last_error })) };
});
