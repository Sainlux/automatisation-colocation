import { NextResponse, type NextRequest } from "next/server";
import { env, integrationStatus } from "@/lib/env";
import { supabaseAdmin } from "@/lib/db";
import { safeEqual } from "@/lib/auth/crypto";
import { log } from "@/lib/audit";

/**
 * Sonde de disponibilité. Réponse publique minimale { ok } ; le détail des
 * intégrations n'est donné qu'avec Authorization: Bearer <CRON_SECRET>.
 * En mode Supabase, la base est réellement interrogée (503 si elle ne répond pas).
 */
export async function GET(req: NextRequest) {
  let backend;
  try {
    backend = env.dataBackend;
    if (backend === "supabase") {
      const { error } = await supabaseAdmin().from("profiles").select("id").limit(1);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    log("error", "health_check_failed", { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && safeEqual(auth, `Bearer ${secret}`)) {
    const s = integrationStatus();
    return NextResponse.json({ ok: true, backend, ai: s.ai.available, email: s.email.available, google: s.google.available }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
