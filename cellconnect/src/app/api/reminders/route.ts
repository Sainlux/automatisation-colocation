import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { loadViewableEvent } from "@/lib/auth/permissions";
import { badRequest } from "@/lib/errors";
import { cancelReminders, scheduleForParticipant } from "@/lib/agents/reminder-agent";

export const GET = api(async ({ ctx }) => {
  const reminders = await ctx.store.select("reminders", {
    where: [["user_id", "eq", ctx.userId], ["status", "eq", "scheduled"], ["organization_id", "eq", ctx.orgId]],
    order: [{ column: "remind_at" }],
    limit: 50,
  });
  return { reminders };
});

/** Définit les rappels personnels d'un événement (remplace les rappels programmés). */
const schema = z.object({ eventId: z.string().uuid(), offsets: z.array(z.number().int().min(5).max(40320)).max(6) });
export const POST = api(async ({ req, ctx }) => {
  const { eventId, offsets } = await body(req, schema);
  const event = await loadViewableEvent(ctx, eventId);
  const [me] = await ctx.store.select("event_participants", { where: [["event_id", "eq", event.id], ["user_id", "eq", ctx.userId]] });
  if (!me || !["accepted", "tentative", "invited"].includes(me.status)) throw badRequest("Vous ne participez pas à cet événement.");
  await cancelReminders(ctx.store, event.id, ctx.userId);
  const created = await scheduleForParticipant(ctx.store, event, ctx.userId, offsets, ctx.now());
  return { reminders: created };
});
