import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { modifyOccurrence } from "@/lib/agents/calendar-agent";
import { timeString } from "@/lib/schemas/extraction";
import { isValidIsoDate } from "@/lib/time";

const schema = z.object({
  occurrenceStart: z.string().datetime(),
  action: z.enum(["cancel", "move", "restore"]),
  date: z.string().refine(isValidIsoDate, "Date invalide").optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  message: z.string().trim().max(1000).nullish(),
});

/** Annuler, déplacer ou rétablir UNE date d'un événement récurrent (organisateur / responsable). */
export const POST = api(async ({ req, ctx, params }) => modifyOccurrence(ctx, params.id, await body(req, schema)));
