import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { safeEqual } from "@/lib/auth/crypto";
import { pullAllConnections, tick } from "@/lib/worker";

export const maxDuration = 60;

/** Tâches planifiées (Vercel Cron) — protégé par CRON_SECRET (Authorization: Bearer). */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  const store = getStore();
  const report = await tick(store, smtpSender);
  const pull = req.nextUrl.searchParams.get("pull") === "1" ? await pullAllConnections(store, smtpSender) : null;
  return NextResponse.json({ ...report, pulled: pull?.pulled ?? 0 });
}
