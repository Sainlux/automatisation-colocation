import { env } from "@/lib/env";
import type { Store } from "@/lib/db/store";
import { decryptSecret, encryptSecret, hmac, randomToken, safeEqual } from "@/lib/auth/crypto";
import { audit } from "@/lib/audit";
import { unavailable } from "@/lib/errors";
import type { CalendarConnection } from "@/lib/types";
import { httpFetch } from "./http";

/**
 * OAuth 2.0 (code d'autorisation) commun à Google, Microsoft et Zoom.
 * - État signé HMAC, lié à l'utilisateur, valable 15 minutes (anti-CSRF) ;
 * - jetons chiffrés AES-256-GCM ; rafraîchissement automatique ;
 * - portées minimales.
 */

export type Provider = "google" | "outlook" | "zoom";

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
  configured: boolean;
  extraAuthParams?: Record<string, string>;
  /** Zoom exige l'authentification client en en-tête Basic. */
  basicAuth?: boolean;
  label: string;
}

export function providerConfig(p: Provider): ProviderConfig {
  switch (p) {
    case "google":
      return {
        label: "Google Calendar",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.events", "openid", "email"],
        clientId: env.google.clientId,
        clientSecret: env.google.clientSecret,
        configured: env.google.configured,
        extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      };
    case "outlook":
      return {
        label: "Outlook",
        authUrl: `https://login.microsoftonline.com/${env.microsoft.tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${env.microsoft.tenant}/oauth2/v2.0/token`,
        scopes: ["offline_access", "openid", "email", "User.Read", "Calendars.ReadWrite"],
        clientId: env.microsoft.clientId,
        clientSecret: env.microsoft.clientSecret,
        configured: env.microsoft.configured,
        extraAuthParams: { prompt: "select_account" },
      };
    case "zoom":
      return {
        label: "Zoom",
        authUrl: "https://zoom.us/oauth/authorize",
        tokenUrl: "https://zoom.us/oauth/token",
        scopes: [], // portées définies dans l'application Zoom (meeting:write)
        clientId: env.zoom.clientId,
        clientSecret: env.zoom.clientSecret,
        configured: env.zoom.configured,
        basicAuth: true,
      };
  }
}

function requireConfig(p: Provider) {
  const c = providerConfig(p);
  if (!c.configured) throw unavailable(`${c.label} n'est pas configuré sur ce serveur.`);
  return { ...c, key: env.encryptionKey! };
}

export const redirectUri = (p: Provider) => `${env.appUrl}/api/calendar/${p}/callback`;

export function buildAuthUrl(p: Provider, userId: string, orgId: string) {
  const c = requireConfig(p);
  const payload = Buffer.from(JSON.stringify({ u: userId, o: orgId, p, n: randomToken(16), t: Date.now() })).toString("base64url");
  const state = `${payload}.${hmac(env.sessionSecret, payload)}`;
  const url = new URL(c.authUrl);
  url.search = new URLSearchParams({
    client_id: c.clientId!,
    redirect_uri: redirectUri(p),
    response_type: "code",
    ...(c.scopes.length ? { scope: c.scopes.join(" ") } : {}),
    ...(c.extraAuthParams ?? {}),
    state,
  }).toString();
  return url.toString();
}

export function verifyState(state: string, userId: string, p: Provider, now = Date.now()): { orgId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(env.sessionSecret, payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: string; o: string; p: string; t: number };
    if (s.u !== userId || s.p !== p || now - s.t > 15 * 60000) return null;
    return { orgId: s.o };
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenResponse> {
  const c = requireConfig(p);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(params);
  if (c.basicAuth) headers.authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
  else {
    body.set("client_id", c.clientId!);
    body.set("client_secret", c.clientSecret!);
  }
  const res = await httpFetch(c.tokenUrl, { method: "POST", headers, body });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(`OAuth ${c.label} : ${json.error ?? res.status}`);
  return json;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return claims.email ?? claims.preferred_username ?? null;
  } catch {
    return null;
  }
}

export async function exchangeCode(store: Store, p: Provider, code: string, userId: string, orgId: string) {
  const { key } = requireConfig(p);
  const t = await tokenRequest(p, { code, grant_type: "authorization_code", redirect_uri: redirectUri(p) });
  // Une seule connexion active par fournisseur et par utilisateur.
  for (const old of await store.select("calendar_connections", { where: [["user_id", "eq", userId], ["provider", "eq", p], ["status", "eq", "active"]] })) {
    await store.update("calendar_connections", old.id, { status: "revoked", access_token_enc: null, refresh_token_enc: null });
  }
  const conn = await store.insert("calendar_connections", {
    user_id: userId,
    organization_id: orgId,
    provider: p,
    account_email: emailFromIdToken(t.id_token),
    access_token_enc: encryptSecret(t.access_token!, key),
    refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token, key) : null,
    token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    scopes: (t.scope ?? "").split(/[ ,]/).filter(Boolean),
    calendar_id: "primary",
    status: "active",
    last_synced_at: null,
    last_error: null,
    watch_channel_id: null,
    watch_resource_id: null,
    watch_expires_at: null,
  });
  await audit(store, { orgId, actorId: userId, action: "calendar.connected", entityType: "calendar_connection", entityId: conn.id, metadata: { provider: p } });
  return conn;
}

/** Jeton d'accès valide (rafraîchi si nécessaire, nouveau jeton de rafraîchissement conservé). */
export async function accessToken(store: Store, c: CalendarConnection): Promise<string> {
  const { key } = requireConfig(c.provider);
  if (c.access_token_enc && c.token_expires_at && Date.parse(c.token_expires_at) > Date.now() + 60000) return decryptSecret(c.access_token_enc, key);
  if (!c.refresh_token_enc) throw new Error("Jeton expiré : reconnectez le compte.");
  let t: TokenResponse;
  try {
    t = await tokenRequest(c.provider, { grant_type: "refresh_token", refresh_token: decryptSecret(c.refresh_token_enc, key) });
  } catch (e) {
    await store.update("calendar_connections", c.id, { status: "error", last_error: `${(e as Error).message} — reconnectez le compte.` });
    throw e;
  }
  await store.update("calendar_connections", c.id, {
    access_token_enc: encryptSecret(t.access_token!, key),
    ...(t.refresh_token ? { refresh_token_enc: encryptSecret(t.refresh_token, key) } : {}),
    token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
  });
  return t.access_token!;
}

/** Appel authentifié ; marque la connexion en erreur si l'accès est révoqué. */
export async function authedFetch(store: Store, c: CalendarConnection, url: string, init: RequestInit = {}) {
  const token = await accessToken(store, c);
  const res = await httpFetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 401 || res.status === 403) {
    await store.update("calendar_connections", c.id, { status: "error", last_error: `Accès refusé par ${providerConfig(c.provider).label} (${res.status}) : reconnectez le compte.` });
  }
  return res;
}

/** Jeton secret d'un canal de notification (vérifié à chaque appel de webhook). */
export const channelToken = (connectionId: string) => hmac(env.sessionSecret, `watch:${connectionId}`);
