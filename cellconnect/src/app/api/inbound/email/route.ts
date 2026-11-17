import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { errMsg } from "@/lib/errors";
import { jsonError } from "@/lib/http/api";
import { handleInboundEmail, parseFormPayload, parseJsonPayload, webhookTokenValid } from "@/lib/inbound/email";

export const maxDuration = 60;

const MAX_BYTES = 30 * 1024 * 1024;

/**
 * Lit le corps en s'arrêtant dès qu'il dépasse la limite. Certains fournisseurs
 * envoient en « chunked » (sans Content-Length) : on ne les refuse pas (le
 * courrier serait perdu ou renvoyé en boucle), mais on ne lit jamais sans borne.
 */
async function readBounded(req: NextRequest, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Webhook du fournisseur d'e-mails entrants (Postmark, Mailgun, SendGrid ou JSON générique).
 * Authentifié par ?token=INBOUND_EMAIL_WEBHOOK_TOKEN. Répond 200 même pour une adresse inconnue
 * (sinon le fournisseur réessaie en boucle) ; 401 si le jeton est faux, 503 si le canal est désactivé.
 * Le contenu reçu est une DONNÉE à analyser, jamais une instruction.
 */
export async function POST(req: NextRequest) {
  if (!env.inbound.email.configured) return jsonError(503, "disabled", "La réception d'e-mails n'est pas activée sur ce serveur.");
  if (!webhookTokenValid(req.nextUrl.searchParams.get("token"))) return jsonError(401, "unauthorized", "Jeton du webhook invalide.");
  const declared = req.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) return jsonError(411, "length_required", "En-tête Content-Length invalide.");
  if (declared !== null && Number(declared) > MAX_BYTES) return jsonError(413, "too_large", "Message trop volumineux (30 Mo maximum).");
  const raw = await readBounded(req, MAX_BYTES);
  if (!raw) return jsonError(413, "too_large", "Message trop volumineux (30 Mo maximum).");
  let mail;
  try {
    const type = req.headers.get("content-type") ?? "";
    mail = type.includes("application/json")
      ? parseJsonPayload(JSON.parse(raw.toString("utf8")) as Record<string, unknown>)
      : await parseFormPayload(await new Response(new Uint8Array(raw), { headers: { "content-type": type } }).formData());
  } catch {
    return jsonError(400, "bad_payload", "Contenu du webhook illisible.");
  }
  const store = getStore();
  const r = await handleInboundEmail(store, smtpSender, mail);
  if (!r.accepted) {
    log("info", "inbound_email_ignored", { reason: r.reason });
    return NextResponse.json({ ok: true, accepted: false });
  }
  after(() => r.finish().catch((e) => log("warn", "inbound_email_finish_failed", { error: errMsg(e) })));
  return NextResponse.json({ ok: true, accepted: true });
}
