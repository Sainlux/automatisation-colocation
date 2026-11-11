import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { channelToken } from "@/lib/integrations/oauth";
import { safeEqual } from "@/lib/auth/crypto";
import { log } from "@/lib/audit";

/**
 * Notifications Microsoft Graph. Gère la validation initiale (validationToken
 * renvoyé en texte brut) et vérifie le clientState de chaque notification.
 */
export async function POST(req: NextRequest) {
  const validation = req.nextUrl.searchParams.get("validationToken");
  if (validation) return new NextResponse(validation.slice(0, 1000), { status: 200, headers: { "content-type": "text/plain" } });
  let payload: { value?: { subscriptionId: string; clientState?: string }[] };
  try {
    payload = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const store = getStore();
  const toSync = new Map<string, Awaited<ReturnType<typeof store.get<"calendar_connections">>>>();
  for (const n of payload.value ?? []) {
    const [conn] = await store.select("calendar_connections", { where: [["watch_channel_id", "eq", n.subscriptionId]] });
    if (conn && conn.provider === "outlook" && conn.status === "active" && safeEqual(n.clientState ?? "", channelToken(conn.id))) toSync.set(conn.id, conn);
  }
  if (toSync.size) {
    after(async () => {
      const { syncConnection } = await import("@/lib/worker");
      for (const c of toSync.values()) if (c) await syncConnection(store, smtpSender, c).catch((e) => log("warn", "webhook_sync_failed", { provider: "outlook", error: (e as Error).message }));
    });
  }
  return new NextResponse(null, { status: 202 });
}
