import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { channelToken } from "@/lib/integrations/oauth";
import { safeEqual } from "@/lib/auth/crypto";
import { log } from "@/lib/audit";
import { clientIp, sharedRateLimit } from "@/lib/http/api";

/** Taille maximale acceptée d'un lot de notifications Graph. */
const MAX_BODY_BYTES = 65536;
/** Nombre maximal de notifications traitées par appel. */
const MAX_NOTIFICATIONS = 100;

/**
 * Notifications Microsoft Graph. Gère la validation initiale (validationToken
 * renvoyé en texte brut) et vérifie le clientState de chaque notification.
 */
export async function POST(req: NextRequest) {
  const validation = req.nextUrl.searchParams.get("validationToken");
  if (validation) return new NextResponse(validation.slice(0, 1000), { status: 200, headers: { "content-type": "text/plain" } });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
  if (!(await sharedRateLimit(`outlook-webhook:${clientIp(req)}`, 120))) return new NextResponse(null, { status: 429 });
  let payload: { value?: { subscriptionId: string; clientState?: string }[] };
  try {
    // Content-Length peut manquer (envoi fragmenté) : on revérifie la taille réelle.
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const store = getStore();
  const toSync = new Map<string, Awaited<ReturnType<typeof store.get<"calendar_connections">>>>();
  const notifications = Array.isArray(payload?.value) ? payload.value.slice(0, MAX_NOTIFICATIONS) : [];
  for (const n of notifications) {
    if (!n || typeof n.subscriptionId !== "string") continue;
    const [conn] = await store.select("calendar_connections", { where: [["watch_channel_id", "eq", n.subscriptionId]] });
    if (conn && conn.provider === "outlook" && conn.status === "active" && safeEqual(typeof n.clientState === "string" ? n.clientState : "", channelToken(conn.id))) toSync.set(conn.id, conn);
  }
  if (toSync.size) {
    after(async () => {
      const { syncConnection } = await import("@/lib/worker");
      for (const c of toSync.values()) if (c) await syncConnection(store, smtpSender, c).catch((e) => log("warn", "webhook_sync_failed", { provider: "outlook", error: (e as Error).message }));
    });
  }
  return new NextResponse(null, { status: 202 });
}
