import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * Filtre d'ergonomie de src/proxy.ts : sans cookie de session, renvoi vers la connexion.
 * Seuls des chemins sans paramètres sont vérifiés (la conservation de ?query est traitée ailleurs).
 */
function visit(pathname: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return proxy(new NextRequest(`http://localhost:3000${pathname}`, { headers }));
}

function location(res: Response) {
  const loc = res.headers.get("location");
  if (!loc) return null;
  const u = new URL(loc);
  return u.pathname + u.search;
}

describe("proxy (redirection sans session)", () => {
  it("/agenda sans session → 307 vers /connexion?suite=%2Fagenda", () => {
    const res = visit("/agenda");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/connexion?suite=%2Fagenda");
  });

  it("/ sans session → /connexion (sans paramètre suite)", () => {
    const res = visit("/");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/connexion");
  });

  it.each(["/connexion", "/inscription", "/invitation/abc", "/hors-ligne"])("%s reste accessible sans session", (p) => {
    const res = visit(p);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["cc_session", "cc_session=valeur-signee"],
    ["Supabase", "sb-ref-auth-token=jeton"],
  ])("cookie %s : pas de redirection", (_nom, cookie) => {
    for (const p of ["/", "/agenda"]) {
      const res = visit(p, cookie);
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
