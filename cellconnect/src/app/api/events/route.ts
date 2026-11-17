import { api, body, idempotent } from "@/lib/http/api";
import { eventInputSchema } from "@/lib/schemas/event";
import { createEvent, listCalendar } from "@/lib/agents/calendar-agent";

export const GET = api(async ({ req, ctx }) => {
  const sp = req.nextUrl.searchParams;
  const now = Date.now();
  const from = sp.get("from") ?? new Date(now - 7 * 86400000).toISOString();
  const to = sp.get("to") ?? new Date(now + 60 * 86400000).toISOString();
  return { items: await listCalendar(ctx, from, to, sp.get("scope") ?? "me", sp.get("includeCancelled") === "1") };
});

export const POST = api(async ({ req, ctx }) => {
  const input = await body(req, eventInputSchema);
  return idempotent(ctx, req, "events.create", async () => ({ event: await createEvent(ctx, input) }));
}, { rateLimit: 60 });
