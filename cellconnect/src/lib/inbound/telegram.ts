import "server-only";
import { createHmac } from "node:crypto";
import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { IncomingItem } from "@/lib/agents/orchestrator";
import type { MessagingLink } from "@/lib/types";
import { env } from "@/lib/env";
import { audit, log } from "@/lib/audit";
import { safeEqual } from "@/lib/auth/crypto";
import { httpFetch } from "@/lib/integrations/http";
import { UniqueViolationError } from "@/lib/db/store";
import { analyse, ctxForUser, inboundAllowed, ingest, notifyOutcome, outcomeText } from "./common";

/**
 * Bot Telegram (API officielle Bot API, webhook).
 *  - Liaison : l'utilisateur ouvre t.me/<bot>?start=<code> depuis les Paramètres ;
 *    le code est signé et expire après 15 minutes.
 *  - Ensuite, tout message transféré au bot (texte, photo, PDF, .ics) devient
 *    une analyse « à vérifier ». Rien n'est ajouté sans validation dans l'app.
 *  - Conversations privées uniquement : le bot ignore les groupes.
 */

const LINK_TTL_SECONDS = 15 * 60;
const API = "https://api.telegram.org";

function linkMac(payload: string) {
  return createHmac("sha256", env.inbound.telegram.botToken ?? "").update(`tg-link:${payload}`).digest("hex").slice(0, 16);
}

/** Code de liaison (≤ 64 caractères [0-9a-f], format exigé par le paramètre start de Telegram). */
export function linkCode(userId: string, now = new Date()): string {
  const payload = userId.replace(/-/g, "").toLowerCase() + Math.floor(now.getTime() / 1000 + LINK_TTL_SECONDS).toString(16).padStart(8, "0");
  return payload + linkMac(payload);
}

export function linkUrl(userId: string, now = new Date()): string | null {
  if (!env.inbound.telegram.configured) return null;
  return `https://t.me/${env.inbound.telegram.botUsername}?start=${linkCode(userId, now)}`;
}

export function userFromLinkCode(code: string, now = new Date()): string | null {
  const m = /^([0-9a-f]{32})([0-9a-f]{8})([0-9a-f]{16})$/.exec(code.trim().toLowerCase());
  if (!m || !safeEqual(m[3], linkMac(m[1] + m[2]))) return null;
  if (parseInt(m[2], 16) * 1000 < now.getTime()) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function webhookSecretValid(header: string | null) {
  const expected = env.inbound.telegram.webhookSecret;
  return Boolean(expected && header && safeEqual(header, expected));
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await httpFetch(`${API}/bot${env.inbound.telegram.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) throw new Error(`Telegram ${method} : ${json.description ?? res.status}`);
  return json.result as T;
}

export async function sendMessage(chatId: number | string, text: string, buttonUrl?: string) {
  const markup = buttonUrl?.startsWith("https://") ? { reply_markup: { inline_keyboard: [[{ text: "Vérifier les dates", url: buttonUrl }]] } } : {};
  await call("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...markup });
}

async function downloadFile(fileId: string, maxBytes: number): Promise<Buffer> {
  const f = await call<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Fichier indisponible");
  if (f.file_size && f.file_size > maxBytes) throw new Error("Fichier trop volumineux");
  const res = await httpFetch(`${API}/file/bot${env.inbound.telegram.botToken}/${f.file_path}`);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("Fichier trop volumineux");
  return buf;
}

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

const HELP =
  "Transférez-moi un message (texte, capture d'écran, PDF ou fichier d'agenda) qui contient des dates. Je vous renvoie un lien pour les vérifier ; rien n'est ajouté à votre agenda sans votre accord.\n\n/stop : délier ce compte Telegram.";

export type TelegramResult = { followUp?: () => Promise<void> };

/** Traite une mise à jour Telegram. La suite (analyse + réponse) est renvoyée dans followUp pour s'exécuter après la réponse HTTP. */
export async function handleTelegramUpdate(store: Store, mailer: ChannelSender, update: TgUpdate, now = new Date()): Promise<TelegramResult> {
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return {};
  const chatId = String(msg.chat.id);
  const reply = (text: string, url?: string) => sendMessage(chatId, text, url).catch((e) => log("warn", "telegram_send_failed", { error: (e as Error).message }));
  const text = (msg.text ?? "").trim();

  // Liaison : /start <code>
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (start) {
    const userId = start[1] ? userFromLinkCode(start[1], now) : null;
    if (!userId || !(await store.get("profiles", userId))) {
      await reply("Bonjour ! Pour utiliser ce bot, ouvrez CellConnect › Plus › Paramètres › « Recevoir des messages » et touchez « Connecter Telegram ». Le lien est valable 15 minutes.");
      return {};
    }
    const label = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? null);
    // Une conversation = un compte ; un compte = une conversation (la nouvelle remplace l'ancienne).
    await store.deleteWhere("messaging_links", [["channel", "eq", "telegram"], ["external_id", "eq", chatId]]);
    await store.deleteWhere("messaging_links", [["channel", "eq", "telegram"], ["user_id", "eq", userId]]);
    try {
      await store.insert("messaging_links", { user_id: userId, channel: "telegram", external_id: chatId, label: label?.slice(0, 100) ?? null, last_update_id: update.update_id });
    } catch (e) {
      if (!(e instanceof UniqueViolationError)) throw e;
    }
    await audit(store, { orgId: null, actorId: userId, action: "inbound.telegram_linked", entityType: "messaging_link", metadata: {} });
    await reply(`C'est relié à votre compte CellConnect ✅\n\n${HELP}`);
    return {};
  }

  const [link] = await store.select("messaging_links", { where: [["channel", "eq", "telegram"], ["external_id", "eq", chatId]] });
  if (!link) {
    await reply("Cette conversation n'est pas encore reliée à un compte. Dans CellConnect : Plus › Paramètres › « Recevoir des messages » › « Connecter Telegram ».");
    return {};
  }
  // Telegram renvoie une mise à jour tant qu'elle n'est pas acquittée : on ne la traite qu'une fois.
  if (link.last_update_id !== null && update.update_id <= link.last_update_id) return {};
  await store.update("messaging_links", link.id, { last_update_id: update.update_id });

  if (/^\/stop(@\w+)?$/.test(text)) {
    await store.delete("messaging_links", link.id);
    await reply("Ce compte Telegram n'est plus relié à CellConnect. Vous pouvez le relier à nouveau depuis les Paramètres.");
    return {};
  }
  if (/^\/(aide|help)(@\w+)?$/.test(text) || (text.startsWith("/") && !msg.photo && !msg.document)) {
    await reply(HELP);
    return {};
  }
  return processContent(store, mailer, link, msg, reply);
}

async function processContent(
  store: Store,
  mailer: ChannelSender,
  link: MessagingLink,
  msg: TgMessage,
  reply: (text: string, url?: string) => Promise<void>,
): Promise<TelegramResult> {
  const ctx = await ctxForUser(store, link.user_id, mailer);
  if (!ctx) {
    await reply("Compte introuvable. Reliez à nouveau Telegram depuis CellConnect.");
    return {};
  }
  if (!(await inboundAllowed("telegram", link.user_id))) {
    await reply("Beaucoup de messages d'un coup : patientez une minute avant d'envoyer le suivant.");
    return {};
  }

  const items: IncomingItem[] = [];
  try {
    if (msg.photo?.length) {
      // La plus grande taille proposée par Telegram (lisibilité maximale pour l'analyse).
      const best = [...msg.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      items.push({ type: "file", data: await downloadFile(best.file_id, env.uploads.maxImageBytes), name: null });
    } else if (msg.document) {
      const d = msg.document;
      const isIcs = /calendar/i.test(d.mime_type ?? "") || /\.ics$/i.test(d.file_name ?? "");
      if (isIcs) items.push({ type: "ics", text: (await downloadFile(d.file_id, 1024 * 1024)).toString("utf8"), name: d.file_name ?? null });
      else if (/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(d.mime_type ?? "")) items.push({ type: "file", data: await downloadFile(d.file_id, env.uploads.maxPdfBytes), name: d.file_name ?? null });
      else {
        await reply("Ce type de fichier n'est pas pris en charge. Envoyez du texte, une capture (PNG, JPEG), un PDF ou un fichier .ics.");
        return {};
      }
    }
  } catch (e) {
    log("warn", "telegram_download_failed", { error: (e as Error).message });
    await reply(`Je n'ai pas pu récupérer ce fichier (${(e as Error).message}). Réessayez ou envoyez une capture d'écran.`);
    return {};
  }
  const body = (msg.text ?? msg.caption ?? "").trim();
  if (body) items.unshift({ type: "text", text: body });
  if (items.length === 0) {
    await reply(HELP);
    return {};
  }

  const r = await ingest(ctx, items);
  if ("error" in r) {
    await reply(`Ce message n'a pas pu être importé : ${r.error}`);
    return {};
  }
  await audit(store, { orgId: ctx.orgId, actorId: ctx.userId, action: "inbound.telegram", entityType: "extraction_job", entityId: r.jobId, metadata: { items: items.length } });
  await reply("Reçu, je lis le message…");
  return {
    followUp: async () => {
      const outcome = await analyse(store, r.jobId);
      await reply(outcomeText(outcome), outcome.url);
      await notifyOutcome(ctx, r.jobId, outcome, "Telegram", false);
    },
  };
}

/** Enregistre l'URL du webhook auprès de Telegram (script d'installation). */
export async function registerWebhook(appUrl: string) {
  return call<boolean>("setWebhook", {
    url: `${appUrl.replace(/\/$/, "")}/api/inbound/telegram`,
    secret_token: env.inbound.telegram.webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}
