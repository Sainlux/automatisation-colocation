import type { Ctx } from "@/lib/context";
import { badRequest } from "@/lib/errors";
import { loadEditableEvent } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { updateEvent } from "./calendar-agent";
import { withExceptions } from "./conflict-agent";

/**
 * MeetingAgent — création de réunions en ligne via les API officielles.
 * Le lien n'est JAMAIS inventé : il provient uniquement de la réponse de
 * Zoom ou de Google. Le compte correspondant doit être connecté.
 */
export async function createOnlineMeeting(ctx: Ctx, eventId: string, provider: "zoom" | "google_meet", opts: { replace?: boolean } = {}) {
  const event = await loadEditableEvent(ctx, eventId);
  if (event.status === "cancelled") throw badRequest("Cet événement est annulé.");
  if (event.meeting_url && !opts.replace) throw badRequest("Cet événement a déjà un lien de réunion.");
  const needed = provider === "zoom" ? "zoom" : "google";
  const [conn] = await ctx.store.select("calendar_connections", { where: [["user_id", "eq", ctx.userId], ["provider", "eq", needed], ["status", "eq", "active"]] });
  if (!conn) throw badRequest(provider === "zoom" ? "Connectez d'abord votre compte Zoom (Paramètres → Connexions)." : "Connectez d'abord Google Calendar (Paramètres → Connexions).");
  const { isConfigured } = await import("@/lib/integrations");
  if (!isConfigured(conn)) throw badRequest("Ce service n'est pas configuré sur le serveur.");

  let url: string | null = null;
  if (provider === "zoom") {
    const { createMeeting } = await import("@/lib/integrations/zoom");
    url = (await createMeeting(ctx.store, conn, event)).meetingUrl;
  } else {
    const { pushEvent } = await import("@/lib/integrations/google-calendar");
    const [ev] = await withExceptions(ctx.store, [event]);
    url = (await pushEvent(ctx.store, conn, ev, "upsert", { createMeet: true }))?.meetingUrl ?? null;
  }
  if (!url || !url.startsWith("https://")) throw badRequest("Le service n'a pas renvoyé de lien de réunion.");
  const updated = await updateEvent(ctx, event.id, { meetingUrl: url, expectedVersion: event.version, notifyParticipants: true });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "meeting.created", entityType: "event", entityId: event.id, metadata: { provider } });
  return { event: updated, meetingUrl: url };
}
