import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { handleInboundEmail, parseFormPayload, parseJsonPayload, webhookTokenValid } from "@/lib/inbound/email";

export const maxDuration = 60;

/**
 * Webhook du fournisseur d'e-mails entrants (Postmark, Mailgun, SendGrid ou JSON générique).
 * Authentifié par ?token=INBOUND_EMAIL_WEBHOOK_TOKEN. Répond 200 même pour une adresse inconnue
 * (sinon le fournisseur réessaie en boucle) ; 401 si le jeton est faux, 503 si le canal est désactivé.
 */
export async function POST(req: NextRequest) {
  if (!env.inbound.email.configured) return NextResponse.json({ error: "disabled" }, { status: 503 });
  if (!webhookTokenValid(req.nextUrl.searchParams.get("token"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 30 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let mail;
  try {
    const type = req.headers.get("content-type") ?? "";
    mail = type.includes("application/json") ? parseJsonPayload((await req.json()) as Record<string, unknown>) : await parseFormPayload(await req.formData());
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }
  const store = getStore();
  const r = await handleInboundEmail(store, smtpSender, mail);
  if (!r.accepted) {
    log("info", "inbound_email_ignored", { reason: r.reason });
    return NextResponse.json({ ok: true, accepted: false });
  }
  after(() => r.finish().catch((e) => log("warn", "inbound_email_finish_failed", { error: (e as Error).message })));
  return NextResponse.json({ ok: true, accepted: true });
}
