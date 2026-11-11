import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { handleTelegramUpdate, webhookSecretValid, type TgUpdate } from "@/lib/inbound/telegram";

export const maxDuration = 60;

/** Webhook du bot Telegram, authentifié par l'en-tête X-Telegram-Bot-Api-Secret-Token. */
export async function POST(req: NextRequest) {
  if (!env.inbound.telegram.configured) return new NextResponse(null, { status: 503 });
  if (!webhookSecretValid(req.headers.get("x-telegram-bot-api-secret-token"))) return new NextResponse(null, { status: 401 });
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const r = await handleTelegramUpdate(getStore(), smtpSender, update);
    if (r.followUp) after(() => r.followUp!().catch((e) => log("warn", "telegram_followup_failed", { error: (e as Error).message })));
  } catch (e) {
    // 200 malgré tout : Telegram réessaierait sinon la même mise à jour sans fin.
    log("error", "telegram_update_failed", { error: (e as Error).message });
  }
  return new NextResponse(null, { status: 200 });
}
