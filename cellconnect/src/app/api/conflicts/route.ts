import { z } from "zod";
import { api } from "@/lib/http/api";
import { listConflicts } from "@/lib/agents/conflict-resolution";

const eventIdSchema = z.string().uuid();

export const GET = api(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const s = params.get("status");
  const statuses = s === "all" ? (["open", "postponed", "resolved", "dismissed"] as const) : (["open", "postponed"] as const);
  // Filtre optionnel ?eventId= : conflits où l'événement apparaît (côté A ou B). Un identifiant invalide ne renvoie rien.
  const rawEventId = params.get("eventId");
  if (rawEventId !== null && !eventIdSchema.safeParse(rawEventId).success) return { conflicts: [] };
  return { conflicts: await listConflicts(ctx, [...statuses], rawEventId ? { eventId: rawEventId } : {}) };
});
