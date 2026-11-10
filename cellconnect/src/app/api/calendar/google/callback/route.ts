import { NextResponse, type NextRequest } from "next/server";
import { requireCtx } from "@/lib/auth/session";
import { exchangeCode, verifyState } from "@/lib/integrations/google-calendar";
import { log } from "@/lib/audit";

/** Retour OAuth Google : vérifie l'état signé puis stocke les jetons chiffrés. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/parametres/calendriers?${q}`, req.url));
  try {
    const ctx = await requireCtx();
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (req.nextUrl.searchParams.get("error")) return back("google=refuse");
    if (!code || !state) return back("google=erreur");
    const s = verifyState(state, ctx.userId);
    if (!s) return back("google=etat-invalide");
    await exchangeCode(ctx.store, code, ctx.userId, s.orgId);
    return back("google=connecte");
  } catch (e) {
    log("error", "google_callback_failed", { error: (e as Error).message });
    return back("google=erreur");
  }
}
