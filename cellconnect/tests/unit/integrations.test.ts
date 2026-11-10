import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { FakeMailer, joinOrg, makeUser, memoryStore } from "./helpers";
import { setHttpFetch } from "@/lib/integrations/http";
import { buildAuthUrl, exchangeCode, verifyState, accessToken, channelToken } from "@/lib/integrations/oauth";
import * as google from "@/lib/integrations/google-calendar";
import * as outlook from "@/lib/integrations/outlook-calendar";
import { createEvent, modifyOccurrence, cancelEvent } from "@/lib/agents/calendar-agent";
import { withExceptions } from "@/lib/agents/conflict-agent";
import { listConflicts } from "@/lib/agents/conflict-resolution";
import { createOnlineMeeting } from "@/lib/agents/meeting-agent";
import { createGroup, addGroupMember } from "@/lib/agents/group-agent";
import { tick, syncConnection } from "@/lib/worker";
import { decryptSecret } from "@/lib/auth/crypto";
import type { CalendarConnection } from "@/lib/types";

/** API externes simulées : chaque appel est enregistré et reçoit une réponse programmée. */
type Call = { method: string; url: string; headers: Record<string, string>; body: string | null };
let calls: Call[] = [];
let routes: [string, RegExp, (c: Call) => { status?: number; json?: unknown }][] = [];
function route(method: string, re: RegExp, fn: (c: Call) => { status?: number; json?: unknown }) {
  routes.push([method, re, fn]);
}
const KEY = Buffer.alloc(32, 9).toString("base64");
const tz = "Europe/Zurich";
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

beforeEach(() => {
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", MS_CLIENT_ID: "mid", MS_CLIENT_SECRET: "msecret",
    ZOOM_CLIENT_ID: "zid", ZOOM_CLIENT_SECRET: "zsecret", TOKEN_ENCRYPTION_KEY: KEY, APP_URL: "https://cellconnect.test",
  });
  calls = [];
  routes = [];
  setHttpFetch(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body == null ? null : String(init.body);
    const call = { method, url, headers, body };
    calls.push(call);
    const r = routes.find(([m, re]) => m === method && re.test(url));
    if (!r) return new Response(JSON.stringify({ error: "route non simulée" }), { status: 500 });
    const out = r[2](call);
    return new Response(out.json === undefined ? null : JSON.stringify(out.json), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => setHttpFetch(null));

const tokenRoutes = () => {
  route("POST", /oauth2\.googleapis\.com\/token/, () => ({ json: { access_token: "g-access", refresh_token: "g-refresh", expires_in: 3600, scope: "calendar.events", id_token: idToken("daniel@gmail.com") } }));
  route("POST", /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/token/, () => ({ json: { access_token: "m-access", refresh_token: "m-refresh", expires_in: 3600, id_token: idToken("daniel@outlook.com") } }));
  route("POST", /zoom\.us\/oauth\/token/, () => ({ json: { access_token: "z-access", refresh_token: "z-refresh", expires_in: 3600 } }));
};

async function connected(provider: "google" | "outlook" | "zoom") {
  const store = memoryStore();
  const mailer = new FakeMailer();
  const u = await makeUser(store, "Daniel", mailer);
  tokenRoutes();
  const conn = await exchangeCode(store, provider, "code-123", u.userId, u.orgId);
  calls = [];
  return { store, mailer, u, conn };
}

describe("OAuth commun", () => {
  it("URL d'autorisation, état signé lié à l'utilisateur et au fournisseur", () => {
    const url = new URL(buildAuthUrl("outlook", "u1", "o1"));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toContain("Calendars.ReadWrite");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cellconnect.test/api/calendar/outlook/callback");
    const state = url.searchParams.get("state")!;
    expect(verifyState(state, "u1", "outlook")).toEqual({ orgId: "o1" });
    expect(verifyState(state, "autre", "outlook")).toBeNull();
    expect(verifyState(state, "u1", "google")).toBeNull();
    expect(verifyState(state, "u1", "outlook", Date.now() + 16 * 60000)).toBeNull();
    expect(verifyState(`${state.split(".")[0]}.faux`, "u1", "outlook")).toBeNull();
  });

  it("échange du code : jetons chiffrés, e-mail du compte ; Zoom en authentification Basic", async () => {
    const { conn } = await connected("google");
    expect(conn.account_email).toBe("daniel@gmail.com");
    expect(conn.access_token_enc).not.toContain("g-access");
    expect(decryptSecret(conn.refresh_token_enc!, KEY)).toBe("g-refresh");
    const z = await connected("zoom");
    void z;
    tokenRoutes();
    const store = memoryStore();
    const u = await makeUser(store, "Z", new FakeMailer());
    calls = [];
    await exchangeCode(store, "zoom", "c", u.userId, u.orgId);
    expect(calls[0].headers.authorization).toBe(`Basic ${Buffer.from("zid:zsecret").toString("base64")}`);
    expect(calls[0].body).not.toContain("client_secret");
  });

  it("rafraîchit un jeton expiré ; révocation → connexion en erreur", async () => {
    const { store, conn } = await connected("google");
    await store.update("calendar_connections", conn.id, { token_expires_at: new Date(0).toISOString() });
    routes = [];
    route("POST", /oauth2\.googleapis\.com\/token/, (c) => ({ json: { access_token: c.body!.includes("refresh_token=g-refresh") ? "g-new" : "?", expires_in: 3600 } }));
    expect(await accessToken(store, (await store.get("calendar_connections", conn.id))!)).toBe("g-new");
    routes = [];
    route("POST", /oauth2\.googleapis\.com\/token/, () => ({ status: 400, json: { error: "invalid_grant" } }));
    await store.update("calendar_connections", conn.id, { token_expires_at: new Date(0).toISOString() });
    await expect(accessToken(store, (await store.get("calendar_connections", conn.id))!)).rejects.toThrow(/invalid_grant/);
    expect((await store.get("calendar_connections", conn.id))!.status).toBe("error");
  });
});

describe("Google Calendar", () => {
  it("push : création, mise à jour, exceptions (EXDATE), suppression ; aucun doublon", async () => {
    const { store, u, conn } = await connected("google");
    route("POST", /calendars\/primary\/events$/, () => ({ json: { id: "g1", updated: "u1" } }));
    route("PATCH", /calendars\/primary\/events\/g1$/, () => ({ json: { id: "g1", updated: "u2" } }));
    route("DELETE", /calendars\/primary\/events\/g1$/, () => ({ status: 204 }));
    const e = await createEvent(u, { title: "Cellule", date: "2027-01-06", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY;COUNT=4" });
    await google.pushEvent(store, conn, (await withExceptions(store, [e]))[0], "upsert");
    const created = JSON.parse(calls[0].body!);
    expect(calls[0].headers.authorization).toBe("Bearer g-access");
    expect(created).toMatchObject({ summary: "Cellule", start: { dateTime: "2027-01-06T19:00:00.000Z", timeZone: tz }, extendedProperties: { private: { cellconnectId: e.id } } });
    expect(created.recurrence).toEqual(["RRULE:FREQ=WEEKLY;COUNT=4"]);

    await modifyOccurrence(u, e.id, { occurrenceStart: "2027-01-13T19:00:00.000Z", action: "cancel" });
    await google.pushEvent(store, conn, (await withExceptions(store, [(await store.get("events", e.id))!]))[0], "upsert");
    expect(calls[1].method).toBe("PATCH");
    expect(JSON.parse(calls[1].body!).recurrence).toContain("EXDATE:20270113T190000Z");

    await google.pushEvent(store, conn, (await store.get("events", e.id))!, "delete");
    expect(calls[2].method).toBe("DELETE");
    expect(await store.select("calendar_sync_records", { where: [["connection_id", "eq", conn.id]] })).toHaveLength(1);
  });

  it("pull : importe les rendez-vous Google (pas les siens), détecte le conflit", async () => {
    const { store, mailer, u, conn } = await connected("google");
    const mine = await createEvent(u, { title: "Formation", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });
    route("GET", /calendars\/primary\/events\?/, () => ({
      json: {
        items: [
          { id: "x1", status: "confirmed", summary: "Dîner", updated: "a", start: { dateTime: "2027-01-20T20:00:00+01:00", timeZone: tz }, end: { dateTime: "2027-01-20T21:00:00+01:00" } },
          { id: "x2", status: "confirmed", summary: "Copie", updated: "a", start: { dateTime: "2027-01-20T20:00:00+01:00" }, end: { dateTime: "2027-01-20T21:00:00+01:00" }, extendedProperties: { private: { cellconnectId: mine.id } } },
          { id: "x3", status: "confirmed", summary: "Disponible", transparency: "transparent", updated: "a", start: { dateTime: "2027-01-20T20:00:00+01:00" }, end: { dateTime: "2027-01-20T21:00:00+01:00" } },
          { id: "x4", status: "confirmed", summary: "Anniversaire", updated: "a", start: { date: "2027-01-20" }, end: { date: "2027-01-21" } },
        ],
      },
    }));
    const r = await syncConnection(store, mailer, conn);
    expect(r.imported).toBe(1);
    const [c] = await listConflicts(u);
    expect(c.overlapMinutes).toBe(30);
    expect([c.a!.title, c.b!.title].sort()).toEqual(["Dîner", "Formation"]);
    // Deuxième synchronisation identique : rien de nouveau.
    expect((await syncConnection(store, mailer, conn)).imported).toBe(0);
  });

  it("Google Meet : lien issu de la réponse de Google uniquement, participants informés", async () => {
    const { store, u, conn } = await connected("google");
    const member = await joinOrg(u, await makeUser(store, "Paul", new FakeMailer()));
    const g = await createGroup(u, { name: "Cellule", color: "#000000" });
    await addGroupMember(u, g.id, member.userId);
    const e = await createEvent(u, { title: "Réunion", date: "2027-01-20", startTime: "20:00", endTime: "21:00", timezone: tz, groupId: g.id, inviteGroup: true });
    route("POST", /calendars\/primary\/events\?conferenceDataVersion=1$/, (c) => {
      expect(JSON.parse(c.body!).conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
      return { json: { id: "g9", updated: "u", hangoutLink: "https://meet.google.com/abc-defg-hij" } };
    });
    const r = await createOnlineMeeting(u, e.id, "google_meet");
    expect(r.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect((await store.get("events", e.id))!.meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    const n = await store.select("notifications", { where: [["user_id", "eq", member.userId], ["type", "eq", "event_rescheduled"]] });
    expect(n.some((x) => x.title.startsWith("Mise à jour"))).toBe(true);
    void conn;
  });

  it("webhook : jeton du canal vérifié", async () => {
    const { store, conn } = await connected("google");
    await store.update("calendar_connections", conn.id, { watch_channel_id: "chan-1" });
    const { __setStoreForTests } = await import("@/lib/db");
    __setStoreForTests(store);
    const { POST } = await import("@/app/api/calendar/google/webhook/route");
    const bad = await POST(new NextRequest("https://cellconnect.test/api/calendar/google/webhook", { method: "POST", headers: { "x-goog-channel-id": "chan-1", "x-goog-channel-token": "faux", "x-goog-resource-state": "exists" } }));
    expect(bad.status).toBe(404);
    const sync = await POST(new NextRequest("https://cellconnect.test/api/calendar/google/webhook", { method: "POST", headers: { "x-goog-channel-id": "chan-1", "x-goog-channel-token": channelToken(conn.id), "x-goog-resource-state": "sync" } }));
    expect(sync.status).toBe(200);
  });

  it("ouverture du canal (watch) avec URL https et jeton secret", async () => {
    const { store, conn } = await connected("google");
    route("POST", /events\/watch$/, () => ({ json: { resourceId: "res-1", expiration: String(Date.now() + 7 * 86400000) } }));
    const w = await google.watch(store, conn);
    const body = JSON.parse(calls[0].body!);
    expect(body).toMatchObject({ type: "web_hook", address: "https://cellconnect.test/api/calendar/google/webhook", token: channelToken(conn.id) });
    expect(w!.watch_resource_id).toBe("res-1");
  });
});

describe("Outlook (Microsoft Graph)", () => {
  it("conversion de la récurrence RRULE → patternedRecurrence", async () => {
    const { u } = await connected("outlook");
    const e = await createEvent(u, { title: "Cellule", date: "2027-01-06", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY;INTERVAL=2;COUNT=5" });
    expect(outlook.toGraphRecurrence(e)).toEqual({
      pattern: { type: "weekly", interval: 2, daysOfWeek: ["wednesday"], firstDayOfWeek: "monday" },
      range: { type: "numbered", startDate: "2027-01-06", numberOfOccurrences: 5, recurrenceTimeZone: tz },
    });
    const g = outlook.toGraph(e);
    expect(g.start).toEqual({ dateTime: "2027-01-06T20:00:00", timeZone: tz });
    expect(g.transactionId).toBe(e.id);
  });

  it("push + exceptions : instance supprimée et instance déplacée", async () => {
    const { store, u, conn } = await connected("outlook");
    route("POST", /graph\.microsoft\.com\/v1\.0\/me\/events$/, () => ({ json: { id: "m1", lastModifiedDateTime: "t" } }));
    route("GET", /me\/events\/m1\/instances\?/, () => ({
      json: { value: [ { id: "i1", originalStart: "2027-01-13T19:00:00Z", start: { dateTime: "2027-01-13T19:00:00.0000000" } }, { id: "i2", originalStart: "2027-01-20T19:00:00Z", start: { dateTime: "2027-01-20T19:00:00.0000000" } } ] },
    }));
    route("DELETE", /me\/events\/i1$/, () => ({ status: 204 }));
    route("PATCH", /me\/events\/i2$/, () => ({ json: {} }));
    const e = await createEvent(u, { title: "Cellule", date: "2027-01-06", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY;COUNT=4" });
    await modifyOccurrence(u, e.id, { occurrenceStart: "2027-01-13T19:00:00.000Z", action: "cancel" });
    await modifyOccurrence(u, e.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "move", date: "2027-01-21", startTime: "20:00", endTime: "21:30" });
    calls = [];
    await outlook.pushEvent(store, conn, (await withExceptions(store, [(await store.get("events", e.id))!]))[0], "upsert");
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["POST /v1.0/me/events", "GET /v1.0/me/events/m1/instances", "DELETE /v1.0/me/events/i1", "PATCH /v1.0/me/events/i2"]);
    expect(JSON.parse(calls[3].body!).start).toEqual({ dateTime: "2027-01-21T20:00:00", timeZone: tz });
  });

  it("pull : heures UTC, rendez-vous « libre » et événements CellConnect ignorés", async () => {
    const { store, mailer, u, conn } = await connected("outlook");
    await createEvent(u, { title: "Formation", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });
    route("GET", /me\/calendarView\?/, (c) => {
      expect(c.headers.prefer).toBe('outlook.timezone="UTC"');
      return {
        json: {
          value: [
            { id: "o1", subject: "Conseil", start: { dateTime: "2027-01-20T20:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2027-01-20T21:00:00.0000000", timeZone: "UTC" }, lastModifiedDateTime: "t", showAs: "busy" },
            { id: "o2", subject: "Libre", start: { dateTime: "2027-01-20T20:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2027-01-20T21:00:00.0000000", timeZone: "UTC" }, lastModifiedDateTime: "t", showAs: "free" },
            { id: "o3", subject: "De CellConnect", transactionId: "abc", start: { dateTime: "2027-01-20T20:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2027-01-20T21:00:00.0000000", timeZone: "UTC" }, lastModifiedDateTime: "t" },
          ],
        },
      };
    });
    expect((await syncConnection(store, mailer, conn)).imported).toBe(1);
    const [c] = await listConflicts(u);
    expect(c.overlapMinutes).toBe(60); // Conseil 21h00-22h00 (Zurich) vs Formation 20h30-22h00
  });

  it("webhook : poignée de main de validation et clientState vérifié", async () => {
    const { store, conn } = await connected("outlook");
    await store.update("calendar_connections", conn.id, { watch_channel_id: "sub-1" });
    const { __setStoreForTests } = await import("@/lib/db");
    __setStoreForTests(store);
    const { POST } = await import("@/app/api/calendar/outlook/webhook/route");
    const v = await POST(new NextRequest("https://cellconnect.test/api/calendar/outlook/webhook?validationToken=abc%20123", { method: "POST" }));
    expect(await v.text()).toBe("abc 123");
    expect(v.headers.get("content-type")).toBe("text/plain");
    const forged = await POST(new NextRequest("https://cellconnect.test/api/calendar/outlook/webhook", { method: "POST", body: JSON.stringify({ value: [{ subscriptionId: "sub-1", clientState: "faux" }] }) }));
    expect(forged.status).toBe(202);
  });

  it("worker : une modification est envoyée à Outlook via la file persistante", async () => {
    const { store, mailer, u, conn } = await connected("outlook");
    route("POST", /me\/events$/, () => ({ json: { id: "m7", lastModifiedDateTime: "t" } }));
    await createEvent(u, { title: "Prière", date: "2027-02-01", startTime: "07:00", endTime: "07:30", timezone: tz });
    const report = await tick(store, mailer);
    expect(report.syncs).toBe(1);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/me/events"))).toBe(true);
    expect((await store.select("calendar_sync_records", { where: [["connection_id", "eq", conn.id]] }))[0].external_id).toBe("m7");
  });
});

describe("Zoom", () => {
  it("crée la réunion, enregistre l'identifiant, puis répercute l'annulation", async () => {
    const { store, u, conn } = await connected("zoom");
    route("POST", /api\.zoom\.us\/v2\/users\/me\/meetings$/, (c) => {
      expect(JSON.parse(c.body!)).toMatchObject({ topic: "Formation", type: 2, start_time: "2027-01-20T19:30:00Z", duration: 90, timezone: tz });
      return { status: 201, json: { id: 8812345, join_url: "https://us02web.zoom.us/j/8812345?pwd=x" } };
    });
    route("DELETE", /api\.zoom\.us\/v2\/meetings\/8812345$/, () => ({ status: 204 }));
    const e = await createEvent(u, { title: "Formation", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });
    const r = await createOnlineMeeting(u, e.id, "zoom");
    expect(r.meetingUrl).toBe("https://us02web.zoom.us/j/8812345?pwd=x");
    await expect(createOnlineMeeting(u, e.id, "zoom")).rejects.toMatchObject({ status: 400 }); // déjà un lien
    await cancelEvent(u, e.id, { confirm: true });
    await tick(store, new FakeMailer());
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/meetings/8812345"))).toBe(true);
    void conn;
  });

  it("n'invente jamais de lien : réponse sans join_url refusée ; compte non connecté refusé", async () => {
    const { u } = await connected("zoom");
    route("POST", /users\/me\/meetings$/, () => ({ status: 201, json: { id: 1 } }));
    const e = await createEvent(u, { title: "X", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });
    await expect(createOnlineMeeting(u, e.id, "zoom")).rejects.toThrow(/lien/);
    expect((await u.store.get("events", e.id))!.meeting_url).toBeNull();
    await expect(createOnlineMeeting(u, e.id, "google_meet")).rejects.toMatchObject({ status: 400 });
  });
});

void ({} as CalendarConnection);
