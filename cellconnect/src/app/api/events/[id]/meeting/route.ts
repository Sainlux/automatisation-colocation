import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { createOnlineMeeting } from "@/lib/agents/meeting-agent";

/** Crée une réunion Zoom ou Google Meet pour l'événement (organisateur / responsable). */
export const POST = api(async ({ req, ctx, params }) => {
  const { provider, replace } = await body(req, z.object({ provider: z.enum(["zoom", "google_meet"]), replace: z.boolean().optional() }));
  return createOnlineMeeting(ctx, params.id, provider, { replace });
}, { rateLimit: 10 });
