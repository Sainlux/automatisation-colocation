import "server-only";
import { env } from "@/lib/env";
import type { Store } from "@/lib/db/store";
import { decryptSecret, encryptSecret, hmac, randomToken, safeEqual } from "@/lib/auth/crypto";
import type { CalendarConnection, EventRow } from "@/lib/types";
import { unavailable } from "@/lib/errors";
import { audit } from "@/lib/audit";

/**
 * Intégration Google Calendar (OAuth 2.0 + API REST v3), sans SDK.
 *
 * - Portée minimale : calendar.events (lecture/écriture des événements) ;
 * - jetons chiffrés en AES-256-GCM (TOKEN_ENCRYPTION_KEY) ;
 * - « push » : événements CellConnect -> calendrier principal Google ;
 * - « pull » : événements Google des 60 prochains jours -> événements
 *   privés importés (source = google) pour la détection des conflits.
 *
 * ⚠️ Implémenté mais non testé contre l'API réelle (identifiants requis).
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"];

function requireConfig() {
  if (!env.google.configured) throw unavailable("Google Calendar n'est pas configuré (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY).");
  return { clientId: env.google.clientId!, clientSecret: env.google.clientSecret!, key: env.encryptionKey! };
}

const redirectUri = () => `${env.appUrl}/api/calendar/google/callback`;

/** État OAuth signé (anti-CSRF) lié à l'utilisateur. */
export function buildAuthUrl(userId: string, orgId: string) {
  const { clientId } = requireConfig();
  const nonce = randomToken(16);
  const payload = Buffer.from(JSON.stringify({ u: userId, o: orgId, n: nonce, t: Date.now() })).toString("base64url");
  const state = `${payload}.${hmac(env.sessionSecret, payload)}`;
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

export function verifyState(state: string, userId: string): { orgId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(env.sessionSecret, payload))) return null;
  const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: string; o: string; t: number };
  if (s.u !== userId || Date.now() - s.t > 15 * 60000) return null;
  return { orgId: s.o };
}

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = requireConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`OAuth Google : ${json.error ?? res.status}`);
  return json;
}

export async function exchangeCode(store: Store, code: string, userId: string, orgId: string) {
  const { key } = requireConfig();
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  if (t.id_token) {
    try {
      email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8")).email ?? null;
    } catch {
      email = null;
    }
  }
  const conn = await store.insert("calendar_connections", {
    user_id: userId,
    organization_id: orgId,
    provider: "google",
    account_email: email,
    access_token_enc: encryptSecret(t.access_token!, key),
    refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token, key) : null,
    token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    scopes: (t.scope ?? "").split(" ").filter(Boolean),
    calendar_id: "primary",
    status: "active",
    last_synced_at: null,
    last_error: null,
  });
  await audit(store, { orgId, actorId: userId, action: "calendar.connected", entityType: "calendar_connection", entityId: conn.id, metadata: { provider: "google" } });
  return conn;
}

async function accessToken(store: Store, c: CalendarConnection): Promise<string> {
  const { key } = requireConfig();
  if (c.access_token_enc && c.token_expires_at && Date.parse(c.token_expires_at) > Date.now() + 60000) return decryptSecret(c.access_token_enc, key);
  if (!c.refresh_token_enc) throw new Error("Jeton expiré : reconnectez Google Calendar.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(c.refresh_token_enc, key) });
  await store.update("calendar_connections", c.id, {
    access_token_enc: encryptSecret(t.access_token!, key),
    token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
  });
  return t.access_token!;
}

async function gfetch(store: Store, c: CalendarConnection, path: string, init: RequestInit = {}) {
  const token = await accessToken(store, c);
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 401 || res.status === 403) {
    await store.update("calendar_connections", c.id, { status: "error", last_error: `Accès refusé par Google (${res.status}).` });
  }
  return res;
}

function toGoogle(e: EventRow) {
  return {
    summary: e.title,
    description: [e.description, e.meeting_url ? `Lien : ${e.meeting_url}` : null, "— Créé via CellConnect AI"].filter(Boolean).join("\n"),
    location: e.location ?? undefined,
    start: { dateTime: e.starts_at, timeZone: e.timezone },
    end: { dateTime: e.ends_at, timeZone: e.timezone },
    recurrence: e.recurrence_rule ? [`RRULE:${e.recurrence_rule.replace(/^RRULE:/i, "")}`] : undefined,
    extendedProperties: { private: { cellconnectId: e.id } },
  };
}

/** Pousse (crée / met à jour / supprime) un événement vers Google. */
export async function pushEvent(store: Store, c: CalendarConnection, event: EventRow, op: "upsert" | "delete") {
  const [rec] = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id], ["event_id", "eq", event.id]] });
  if (rec?.direction === "pull") return; // ne jamais réécrire un événement importé de Google
  const cal = encodeURIComponent(c.calendar_id);
  if (op === "delete" || event.status === "cancelled") {
    if (!rec) return;
    const res = await gfetch(store, c, `/calendars/${cal}/events/${encodeURIComponent(rec.external_id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google DELETE ${res.status}`);
    await store.update("calendar_sync_records", rec.id, { status: "deleted", last_synced_at: new Date().toISOString() });
    return;
  }
  const res = rec
    ? await gfetch(store, c, `/calendars/${cal}/events/${encodeURIComponent(rec.external_id)}`, { method: "PATCH", body: JSON.stringify(toGoogle(event)) })
    : await gfetch(store, c, `/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(toGoogle(event)) });
  if (!res.ok) throw new Error(`Google ${rec ? "PATCH" : "POST"} ${res.status}`);
  const g = (await res.json()) as { id: string; updated: string };
  if (rec) await store.update("calendar_sync_records", rec.id, { external_updated_at: g.updated, status: "synced", error: null, last_synced_at: new Date().toISOString() });
  else
    await store.insert("calendar_sync_records", {
      connection_id: c.id,
      event_id: event.id,
      external_id: g.id,
      direction: "push",
      external_updated_at: g.updated,
      status: "synced",
      error: null,
      last_synced_at: new Date().toISOString(),
    });
}

interface GoogleEvent {
  id: string;
  status: string;
  summary?: string;
  location?: string;
  updated: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  transparency?: string;
}

/**
 * Importe les événements Google (60 jours) comme événements privés de
 * l'utilisateur, afin que ConflictManagerAgent puisse détecter les
 * chevauchements. Les événements créés par CellConnect sont ignorés
 * (pas de doublon).
 */
export async function pullEvents(store: Store, c: CalendarConnection) {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 60 * 86400000).toISOString(),
    singleEvents: "true",
    maxResults: "250",
    orderBy: "startTime",
  });
  const res = await gfetch(store, c, `/calendars/${encodeURIComponent(c.calendar_id)}/events?${params}`);
  if (!res.ok) throw new Error(`Google LIST ${res.status}`);
  const { items = [] } = (await res.json()) as { items?: GoogleEvent[] };
  const records = await store.select("calendar_sync_records", { where: [["connection_id", "eq", c.id]] });
  const byExternal = new Map(records.map((r) => [r.external_id, r]));
  let imported = 0;
  for (const g of items) {
    if (g.extendedProperties?.private?.cellconnectId || g.transparency === "transparent") continue;
    if (!g.start?.dateTime || !g.end?.dateTime) continue; // journées entières ignorées (non bloquantes)
    const rec = byExternal.get(g.id);
    if (rec?.direction === "push") continue;
    const fields = {
      title: g.summary?.slice(0, 200) || "Occupé (Google)",
      location: g.location?.slice(0, 300) ?? null,
      starts_at: new Date(g.start.dateTime).toISOString(),
      ends_at: new Date(g.end.dateTime).toISOString(),
      timezone: g.start.timeZone ?? "Europe/Zurich",
      status: g.status === "cancelled" ? ("cancelled" as const) : ("confirmed" as const),
    };
    if (rec) {
      if (rec.external_updated_at === g.updated) continue;
      const ev = await store.get("events", rec.event_id);
      if (ev) await store.update("events", ev.id, { ...fields, version: ev.version + 1 });
      await store.update("calendar_sync_records", rec.id, { external_updated_at: g.updated, last_synced_at: new Date().toISOString() });
    } else {
      const ev = await store.insert("events", {
        organization_id: c.organization_id,
        group_id: null,
        created_by: c.user_id,
        description: null,
        meeting_url: null,
        all_day: false,
        recurrence_rule: null,
        recurrence_until: null,
        visibility: "private",
        source: "google",
        source_job_id: null,
        external_uid: g.id,
        version: 1,
        updated_at: new Date().toISOString(),
        ...fields,
      });
      await store.insert("event_participants", { event_id: ev.id, organization_id: c.organization_id, user_id: c.user_id, role: "organizer", status: "accepted", responded_at: null });
      await store.insert("calendar_sync_records", {
        connection_id: c.id,
        event_id: ev.id,
        external_id: g.id,
        direction: "pull",
        external_updated_at: g.updated,
        status: "synced",
        error: null,
        last_synced_at: new Date().toISOString(),
      });
      imported++;
    }
  }
  await store.update("calendar_connections", c.id, { last_synced_at: new Date().toISOString(), last_error: null, status: "active" });
  return { imported, seen: items.length };
}
