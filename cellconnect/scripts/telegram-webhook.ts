/**
 * Enregistre le webhook du bot Telegram : npm run telegram:webhook
 * Prérequis : TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET et APP_URL (https public).
 */
import "./load-env";
import { env } from "@/lib/env";
import { registerWebhook } from "@/lib/inbound/telegram";

async function main() {
  if (!env.inbound.telegram.configured) throw new Error("Bot non configuré : TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET (16 caractères min., A-Z a-z 0-9 _ -).");
  if (!env.appUrl.startsWith("https://")) throw new Error(`APP_URL doit être une adresse https publique (actuellement : ${env.appUrl}).`);
  await registerWebhook(env.appUrl);
  console.log(`Webhook enregistré : ${env.appUrl.replace(/\/$/, "")}/api/inbound/telegram (bot @${env.inbound.telegram.botUsername}).`);
}

main().catch((e) => {
  console.error(`Échec : ${(e as Error).message}`);
  process.exit(1);
});
