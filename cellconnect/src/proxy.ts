import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirige vers la page de connexion les visiteurs sans cookie de session.
 * Il s'agit d'un filtre d'ergonomie : la vérification réelle de la session
 * (signature / Supabase) est faite côté serveur par chaque route API.
 */
const PUBLIC = ["/connexion", "/inscription", "/invitation/", "/hors-ligne"];

/** En-tête interne : chemin demandé (avec ses paramètres), lu par le cadre (app)/layout.tsx. */
const PATH_HEADER = "x-cc-path";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession = req.cookies.has("cc_session") || req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) {
    // Retour après connexion : chemin ET paramètres (ex. /calendrier?vue=group:x).
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname === "/" && !search ? "" : `?suite=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Transmis au rendu serveur : si la session s'avère expirée, le cadre renvoie vers la même adresse.
  // Toujours écrasé ici : une valeur envoyée par le navigateur n'est jamais reprise telle quelle.
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
