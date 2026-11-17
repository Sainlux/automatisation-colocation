import { api } from "@/lib/http/api";
import { AppError } from "@/lib/errors";
import { linkUrl } from "@/lib/inbound/telegram";

/** Lien de liaison (t.me/<bot>?start=<code signé, 15 min>). */
export const POST = api(
  async ({ ctx }) => {
    const url = linkUrl(ctx.userId);
    if (!url) throw new AppError(503, "unavailable", "Le bot Telegram n'est pas encore configuré.");
    return { url };
  },
  { rateLimit: 10 },
);

/** Délier Telegram. */
export const DELETE = api(async ({ ctx }) => {
  await ctx.store.deleteWhere("messaging_links", [["user_id", "eq", ctx.userId], ["channel", "eq", "telegram"]]);
  return { ok: true };
});
