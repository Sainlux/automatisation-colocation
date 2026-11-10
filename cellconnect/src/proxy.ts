import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirige vers la page de connexion les visiteurs sans cookie de session.
 * Il s'agit d'un filtre d'ergonomie : la vérification réelle de la session
 * (signature / Supabase) est faite côté serveur par chaque route API.
 */
const PUBLIC = ["/connexion", "/inscription", "/invitation/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession = req.cookies.has("cc_session") || req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname === "/" ? "" : `?suite=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
