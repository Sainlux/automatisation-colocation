import { api } from "@/lib/http/api";
import { env } from "@/lib/env";
import { inboundAddress } from "@/lib/inbound/email";

/** État des canaux entrants de l'utilisateur : adresse e-mail personnelle et Telegram lié. */
export const GET = api(async ({ ctx }) => {
  const [tg] = await ctx.store.select("messaging_links", { where: [["user_id", "eq", ctx.userId], ["channel", "eq", "telegram"]] });
  return {
    email: { available: env.inbound.email.configured, address: inboundAddress(ctx.userId) },
    telegram: {
      available: env.inbound.telegram.configured,
      botUsername: env.inbound.telegram.configured ? env.inbound.telegram.botUsername : null,
      linked: tg ? { label: tg.label, since: tg.created_at } : null,
    },
  };
});
