import { after, NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { channelToken } from "@/lib/integrations/oauth";
import { safeEqual } from "@/lib/auth/crypto";
import { log } from "@/lib/audit";

/**
 * Notification de changement Google Calendar (events.watch).
 * Authentifiée par le jeton secret du canal ; déclenche un import + une
 * vérification des conflits. Google ne transmet pas le détail : on resynchronise.
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token") ?? "";
  const state = req.headers.get("x-goog-resource-state");
  if (!channelId) return new NextResponse(null, { status: 400 });
  const store = getStore();
  const [conn] = await store.select("calendar_connections", { where: [["watch_channel_id", "eq", channelId]] });
  if (!conn || conn.provider !== "google" || !safeEqual(token, channelToken(conn.id))) return new NextResponse(null, { status: 404 });
  if (state !== "sync" && conn.status === "active") {
    after(async () => {
      const { syncConnection } = await import("@/lib/worker");
      await syncConnection(store, smtpSender, conn).catch((e) => log("warn", "webhook_sync_failed", { provider: "google", error: (e as Error).message }));
    });
  }
  return new NextResponse(null, { status: 200 });
}
