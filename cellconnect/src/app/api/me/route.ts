import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { isValidTimezone } from "@/lib/time";
import { audit, log } from "@/lib/audit";
import { getMe } from "@/lib/auth/me";
import { reminderOffsetsSchema } from "@/lib/schemas/reminder";
import { rescheduleUserReminders } from "@/lib/agents/reminder-agent";
import { runAfter } from "@/lib/agents/notification-agent";

export const GET = api(async ({ ctx }) => getMe(ctx));

const patchSchema = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().refine(isValidTimezone, "Fuseau invalide").optional(),
  reminder_offsets: reminderOffsetsSchema.optional(),
  travel_buffer_minutes: z.number().int().min(0).max(240).optional(),
  notify_email: z.boolean().optional(),
  delete_captures_after_analysis: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
});

const sameOffsets = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

export const PATCH = api(async ({ req, ctx }) => {
  const patch = await body(req, patchSchema);
  const before = patch.reminder_offsets ? await ctx.store.get("profiles", ctx.userId) : null;
  const profile = await ctx.store.update("profiles", ctx.userId, patch);
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "profile.updated", entityType: "profile", entityId: ctx.userId, metadata: { fields: Object.keys(patch) } });
  const offsets = patch.reminder_offsets;
  if (offsets && !sameOffsets(before?.reminder_offsets, offsets)) {
    // Nouveaux délais : rappels des participations futures recalculés après la réponse.
    const { store, userId } = ctx;
    const now = ctx.now();
    await runAfter(async () => {
      const created = await rescheduleUserReminders(store, userId, offsets, now);
      log("info", "reminders_rescheduled", { created });
    });
  }
  return { profile };
});
