import "server-only";
import { createHmac } from "node:crypto";
import type { Store } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { IncomingItem } from "@/lib/agents/orchestrator";
import { env } from "@/lib/env";
import { audit, log } from "@/lib/audit";
import { safeEqual } from "@/lib/auth/crypto";
import { detectFileType } from "@/lib/storage";
import { analyse, ctxForUser, inboundAllowed, ingest, notifyOutcome } from "./common";

/**
 * Réception par e-mail : chaque utilisateur a une adresse personnelle signée,
 *   agenda+<identifiant><signature>@<INBOUND_EMAIL_DOMAIN>
 * Il y transfère un message ; le fournisseur d'e-mails entrants (Postmark,
 * Mailgun, SendGrid…) appelle POST /api/inbound/email?token=… avec son contenu.
 * La signature (HMAC, 64 bits) empêche de deviner l'adresse d'un autre compte.
 */

const LOCAL = "agenda";

function userMac(userHex: string) {
  return createHmac("sha256", env.inbound.email.secret ?? "").update(`inbound-email:${userHex}`).digest("hex").slice(0, 16);
}

export function inboundAddress(userId: string): string | null {
  if (!env.inbound.email.configured) return null;
  const hex = userId.replace(/-/g, "").toLowerCase();
  return `${LOCAL}+${hex}${userMac(hex)}@${env.inbound.email.domain}`;
}

/** Retrouve l'utilisateur à partir d'une adresse destinataire ; null si l'adresse n'est pas une adresse valide. */
export function userFromAddress(address: string): string | null {
  const m = /^[^@+\s]+\+([0-9a-f]{32})([0-9a-f]{16})@([^\s>]+)$/i.exec(address.trim());
  if (!m || m[3].toLowerCase() !== env.inbound.email.domain) return null;
  const hex = m[1].toLowerCase();
  if (!safeEqual(m[2].toLowerCase(), userMac(hex))) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function webhookTokenValid(token: string | null) {
  const expected = env.inbound.email.webhookToken;
  return Boolean(expected && token && safeEqual(token, expected));
}

export interface InboundAttachment {
  name: string | null;
  mime: string | null;
  data: Buffer;
}

export interface InboundEmail {
  recipients: string[];
  from: string | null;
  subject: string;
  text: string;
  attachments: InboundAttachment[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const emailsIn = (v: unknown): string[] => (typeof v === "string" ? (v.match(EMAIL_RE) ?? []) : []);

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Postmark (JSON) ou format JSON générique { from, to, subject, text, html, attachments[{ filename, contentType, content(base64) }] }. */
export function parseJsonPayload(p: Record<string, unknown>): InboundEmail {
  const get = (...keys: string[]) => keys.map((k) => p[k]).find((v) => v !== undefined && v !== null);
  const recipients = new Set<string>();
  for (const key of ["OriginalRecipient", "To", "Cc", "Bcc", "to", "recipient", "cc"]) emailsIn(p[key]).forEach((e) => recipients.add(e));
  for (const key of ["ToFull", "CcFull", "BccFull"]) {
    const list = p[key];
    if (Array.isArray(list)) for (const x of list) emailsIn((x as { Email?: string })?.Email).forEach((e) => recipients.add(e));
  }
  if (Array.isArray(p.to)) for (const x of p.to) emailsIn(typeof x === "string" ? x : (x as { address?: string })?.address).forEach((e) => recipients.add(e));
  const html = get("HtmlBody", "html");
  const text = String(get("TextBody", "text", "body-plain") ?? (typeof html === "string" ? htmlToText(html) : ""));
  const attachments: InboundAttachment[] = [];
  const raw = get("Attachments", "attachments");
  if (Array.isArray(raw)) {
    for (const a of raw as Record<string, unknown>[]) {
      const content = a.Content ?? a.content;
      if (typeof content !== "string") continue;
      attachments.push({
        name: String(a.Name ?? a.filename ?? a.name ?? "") || null,
        mime: String(a.ContentType ?? a.contentType ?? a.content_type ?? "") || null,
        data: Buffer.from(content, "base64"),
      });
    }
  }
  return { recipients: [...recipients], from: emailsIn(get("From", "from", "sender"))[0] ?? null, subject: String(get("Subject", "subject") ?? ""), text, attachments };
}

/** Mailgun / SendGrid (multipart/form-data). */
export async function parseFormPayload(form: FormData): Promise<InboundEmail> {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const recipients = new Set<string>();
  for (const k of ["recipient", "to", "To", "cc"]) emailsIn(str(k)).forEach((e) => recipients.add(e));
  try {
    const envelope = JSON.parse(str("envelope") || "{}") as { to?: string[] };
    for (const t of envelope.to ?? []) emailsIn(t).forEach((e) => recipients.add(e));
  } catch {
    /* enveloppe absente ou illisible : on garde les autres champs */
  }
  const html = str("body-html") || str("html");
  const text = str("body-plain") || str("text") || (html ? htmlToText(html) : "");
  const attachments: InboundAttachment[] = [];
  for (const [, v] of form.entries()) {
    if (typeof v === "string") continue;
    attachments.push({ name: v.name || null, mime: v.type || null, data: Buffer.from(await v.arrayBuffer()) });
  }
  return { recipients: [...recipients], from: emailsIn(str("sender") || str("from"))[0] ?? null, subject: str("subject"), text, attachments };
}

/** Convertit l'e-mail en éléments à analyser : texte (objet + corps), fichiers d'agenda, images et PDF. */
export function emailToItems(mail: InboundEmail): IncomingItem[] {
  const items: IncomingItem[] = [];
  for (const a of mail.attachments) {
    const isIcs = /calendar/i.test(a.mime ?? "") || /\.ics$/i.test(a.name ?? "");
    if (isIcs) {
      items.push({ type: "ics", text: a.data.toString("utf8"), name: a.name });
      continue;
    }
    const t = detectFileType(a.data);
    // Images et PDF seulement ; les signatures, logos minuscules et autres fichiers sont ignorés.
    if (t && t.kind !== "heic" && a.data.length >= 2048) items.push({ type: "file", data: a.data, name: a.name });
  }
  const subject = mail.subject.replace(/^\s*((re|tr|fwd?|wg)\s*:\s*)+/i, "").trim();
  const body = mail.text.trim();
  const text = [subject, body].filter(Boolean).join("\n\n").slice(0, env.uploads.maxTextChars);
  if (body) items.unshift({ type: "text", text });
  return items;
}

export type EmailResult = { accepted: false; reason: string } | { accepted: true; jobId: string; finish: () => Promise<void> };

/** Traite un e-mail reçu : identifie le compte via l'adresse signée, crée l'analyse, prépare la notification. */
export async function handleInboundEmail(store: Store, mailer: ChannelSender, mail: InboundEmail): Promise<EmailResult> {
  const userId = mail.recipients.map(userFromAddress).find(Boolean);
  if (!userId) return { accepted: false, reason: "unknown_recipient" };
  const ctx = await ctxForUser(store, userId, mailer);
  if (!ctx) return { accepted: false, reason: "unknown_user" };
  if (!(await inboundAllowed("email", userId))) return { accepted: false, reason: "rate_limited" };
  const items = emailToItems(mail);
  if (items.length === 0) return { accepted: false, reason: "empty" };
  const r = await ingest(ctx, items);
  if ("error" in r) {
    log("info", "inbound_email_rejected", { reason: r.error });
    return { accepted: false, reason: r.error };
  }
  await audit(store, { orgId: ctx.orgId, actorId: userId, action: "inbound.email", entityType: "extraction_job", entityId: r.jobId, metadata: { items: items.length } });
  return {
    accepted: true,
    jobId: r.jobId,
    // Réponse par e-mail à l'adresse du COMPTE (jamais à l'expéditeur, qui pourrait être usurpé).
    finish: async () => notifyOutcome(ctx, r.jobId, await analyse(store, r.jobId), "e-mail", true),
  };
}
