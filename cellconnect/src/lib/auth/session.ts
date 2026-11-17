import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { unauthorized } from "@/lib/errors";
import { smtpSender } from "@/lib/channels/email";
import { hmac, safeEqual } from "./crypto";
import { serverNow } from "@/lib/clock";
import { bootstrapAccount, createPersonalOrganization } from "./account";

/**
 * Sessions.
 *  - Mode local : cookie HttpOnly signé (HMAC-SHA256), 14 jours.
 *  - Mode Supabase : Supabase Auth (cookies gérés par @supabase/ssr) ;
 *    l'identité est revalidée auprès de Supabase à chaque requête (getUser).
 */

export const SESSION_COOKIE = "cc_session";
export const ORG_COOKIE = "cc_org";
const SESSION_TTL_S = 14 * 24 * 3600;

interface LocalSession {
  uid: string;
  email: string;
  exp: number;
}

export function signSession(s: LocalSession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${hmac(env.sessionSecret, payload)}`;
}

export function verifySession(token: string | undefined, nowS = Math.floor(Date.now() / 1000)): LocalSession | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(env.sessionSecret, payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocalSession;
    return s.exp > nowS ? s : null;
  } catch {
    return null;
  }
}

const cookieBase = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" });

export async function setLocalSession(uid: string, email: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession({ uid, email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S }), { ...cookieBase(), maxAge: SESSION_TTL_S });
}

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(env.supabase.url!, env.supabase.anonKey!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) jar.set(name, value, options);
      },
    },
  });
}

export async function clearSession() {
  const jar = await cookies();
  if (env.dataBackend === "supabase") await (await supabaseServer()).auth.signOut();
  jar.delete(SESSION_COOKIE);
  jar.delete(ORG_COOKIE);
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  if (env.dataBackend === "supabase") {
    const { data } = await (await supabaseServer()).auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  }
  const s = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  // Un cookie encore valide d'un compte supprimé ne doit plus rien ouvrir.
  const user = await getStore().get("local_users", s.uid);
  return user ? { id: user.id, email: user.email } : null;
}

export async function setActiveOrg(orgId: string) {
  (await cookies()).set(ORG_COOKIE, orgId, { ...cookieBase(), maxAge: 365 * 24 * 3600 });
}

/** Construit le contexte authentifié d'une requête (ou lève 401). */
export async function requireCtx(): Promise<Ctx> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const store = getStore();
  let profile = await store.get("profiles", user.id);
  if (!profile) {
    // Mode local : getSessionUser a déjà vérifié local_users ; on revérifie avant
    // de recréer quoi que ce soit (jamais de compte fantôme pour un utilisateur effacé).
    if (env.dataBackend !== "supabase" && !(await store.get("local_users", user.id))) throw unauthorized();
    profile = await bootstrapAccount(store, { id: user.id, email: user.email, name: user.email.split("@")[0] });
  }
  let memberships = await store.select("organization_members", { where: [["user_id", "eq", user.id]], order: [{ column: "created_at" }] });
  if (memberships.length === 0) {
    // Compte créé via une invitation puis refusée (ou retiré de toutes ses églises) :
    // on lui donne son propre espace plutôt que de le bloquer.
    await createPersonalOrganization(store, user.id);
    memberships = await store.select("organization_members", { where: [["user_id", "eq", user.id]], order: [{ column: "created_at" }] });
  }
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.organization_id === wanted) ?? memberships[0];
  return {
    store,
    userId: user.id,
    email: profile.email,
    orgId: m.organization_id,
    orgRole: m.role,
    timezone: profile.timezone,
    now: serverNow,
    mailer: smtpSender,
  };
}
