import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import type { Me } from "@/components/app/session";
import { requireCtx } from "@/lib/auth/session";
import { getMe } from "@/lib/auth/me";
import { AppError } from "@/lib/errors";
import type { Ctx } from "@/lib/context";

/**
 * Cadre de l'application, rendu côté serveur : la session et le profil sont résolus ici,
 * si bien que les pages montent tout de suite et lancent leurs propres requêtes dès
 * l'hydratation (plus d'attente de /api/me dans le navigateur).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx: Ctx | null = null;
  try {
    ctx = await requireCtx();
  } catch (e) {
    // Session absente, expirée ou compte supprimé : retour à la connexion (redirect est appelé hors du try).
    if (!(e instanceof AppError && e.status === 401)) throw e;
  }
  if (!ctx) redirect("/connexion");
  const me = await getMe(ctx);
  if (!me.profile) redirect("/connexion");
  return <AppShell initialMe={me as Me}>{children}</AppShell>;
}
