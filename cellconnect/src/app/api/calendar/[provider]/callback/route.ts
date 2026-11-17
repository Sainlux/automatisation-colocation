import { after, NextResponse, type NextRequest } from "next/server";
import { requireCtx } from "@/lib/auth/session";
import { exchangeCode, verifyState, type Provider } from "@/lib/integrations/oauth";
import { log } from "@/lib/audit";

const PROVIDERS: Provider[] = ["google", "outlook", "zoom"];

/** Retour OAuth (Google, Microsoft, Zoom) : vérifie l'état signé puis stocke les jetons chiffrés. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/parametres/calendriers?${q}`, req.url));
  if (!PROVIDERS.includes(provider as Provider)) return back("erreur=fournisseur");
  const p = provider as Provider;
  try {
    const ctx = await requireCtx();
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (req.nextUrl.searchParams.get("error")) return back(`${p}=refuse`);
    if (!code || !state) return back(`${p}=erreur`);
    const s = verifyState(state, ctx.userId, p);
    if (!s) return back(`${p}=etat-invalide`);
    const conn = await exchangeCode(ctx.store, p, code, ctx.userId, s.orgId);
    if (p !== "zoom") {
      // Première synchronisation + ouverture du canal de notifications, après la réponse.
      after(async () => {
        const { syncConnection } = await import("@/lib/worker");
        const { watch } = await import("@/lib/integrations");
        await syncConnection(ctx.store, ctx.mailer, conn).catch((e) => log("warn", "initial_sync_failed", { error: (e as Error).message }));
        await watch(ctx.store, conn).catch((e) => log("warn", "watch_failed", { error: (e as Error).message }));
      });
    }
    return back(`${p}=connecte`);
  } catch (e) {
    log("error", "oauth_callback_failed", { provider: p, error: (e as Error).message });
    return back(`${p}=erreur`);
  }
}
