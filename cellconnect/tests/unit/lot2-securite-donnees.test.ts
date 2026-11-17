import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { FakeMailer, makeUser, memoryStore, NOW } from "./helpers";
import { env } from "@/lib/env";
import { sharedRateLimit } from "@/lib/http/api";
import { maskEmails, log } from "@/lib/audit";
import { notify } from "@/lib/agents/notification-agent";
import { createEvent } from "@/lib/agents/calendar-agent";
import { bootstrapAccount } from "@/lib/auth/account";
import { __setStoreForTests, supabaseAdmin } from "@/lib/db";
import type { ChannelSender } from "@/lib/channels/email";

/** Lot 2 — sécurité, RLS et minimisation des données personnelles. */

// supabaseAdmin remplaçable test par test (le reste du module reste réel).
vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, supabaseAdmin: vi.fn(orig.supabaseAdmin) };
});

// Cookies de requête simulés (next/headers n'existe qu'à l'intérieur d'une requête Next).
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(supabaseAdmin).mockReset();
  jar.clear();
});

function noBackendEnv() {
  vi.stubEnv("DATA_BACKEND", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

describe("env : backend de données sur Vercel", () => {
  it("VERCEL=1 sans clés Supabase : erreur explicite", () => {
    noBackendEnv();
    vi.stubEnv("VERCEL", "1");
    expect(() => env.dataBackend).toThrow("DATA_BACKEND=supabase et les clés Supabase sont requis sur Vercel");
  });

  it("DATA_BACKEND=local explicite : accepté même sur Vercel", () => {
    noBackendEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATA_BACKEND", "local");
    expect(env.dataBackend).toBe("local");
  });

  it("hors Vercel : repli local inchangé", () => {
    noBackendEnv();
    vi.stubEnv("VERCEL", "");
    expect(env.dataBackend).toBe("local");
  });

  it("trustRealIp : TRUST_REAL_IP=1 ou VERCEL=1", () => {
    vi.stubEnv("TRUST_REAL_IP", "");
    vi.stubEnv("VERCEL", "");
    expect(env.trustRealIp).toBe(false);
    vi.stubEnv("TRUST_REAL_IP", "1");
    expect(env.trustRealIp).toBe(true);
    vi.stubEnv("TRUST_REAL_IP", "");
    vi.stubEnv("VERCEL", "1");
    expect(env.trustRealIp).toBe(true);
  });
});

describe("/api/health", () => {
  const get = async (headers: Record<string, string> = {}) => {
    const { GET } = await import("@/app/api/health/route");
    return GET(new NextRequest("http://app.test/api/health", { headers }));
  };

  it("mode local : 200 { ok: true } sans aucun détail", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Mauvais secret : toujours aucun détail.
    expect(await (await get({ authorization: `Bearer ${"x".repeat(32)}` })).json()).toEqual({ ok: true });
  });

  it("détail renvoyé seulement avec Authorization: Bearer CRON_SECRET", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    const res = await get({ authorization: `Bearer ${"c".repeat(32)}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, backend: "local", ai: expect.any(Boolean), email: expect.any(Boolean), google: expect.any(Boolean) });
  });

  it("configuration invalide (Vercel sans Supabase) : 503 { ok: false }", async () => {
    noBackendEnv();
    vi.stubEnv("VERCEL", "1");
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("mode Supabase : la base est interrogée, 503 si elle ne répond pas", async () => {
    vi.stubEnv("DATA_BACKEND", "supabase");
    const limit = vi.fn(async () => ({ error: { message: "connexion refusée" } }));
    const from = vi.fn(() => ({ select: () => ({ limit }) }));
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);
    const res = await get();
    expect(from).toHaveBeenCalledWith("profiles");
    expect(limit).toHaveBeenCalledWith(1);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });

    limit.mockResolvedValueOnce({ error: null } as never);
    const ok = await get();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });
});

describe("limitation de débit partagée : clé minimisée", () => {
  it("la clé envoyée à rate_limit_hit est une empreinte SHA-256 (64 caractères hex), jamais l'IP", async () => {
    vi.stubEnv("DATA_BACKEND", "supabase");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);
    expect(await sharedRateLimit("/api/auth/login:POST:203.0.113.9", 10)).toBe(true);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, { p_key: string; p_max: number }];
    expect(fn).toBe("rate_limit_hit");
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_key).not.toContain("203.0.113.9");
    expect(args.p_max).toBe(10);
  });
});

describe("journaux : adresses e-mail masquées", () => {
  it("maskEmails et log()", () => {
    expect(maskEmails("550 <a@b.ch> rejected, copie à jean.dupont+x@eglise-test.example.org")).toBe("550 <[email]> rejected, copie à [email]");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    log("warn", "test", { error: "550 <a@b.ch> rejected" });
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(line).not.toContain("a@b.ch");
    expect(line).toContain("[email]");
  });

  it("échec SMTP : last_error enregistré sans l'adresse du destinataire", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Marie", mailer);
    const failing: ChannelSender = {
      available: true,
      send: async () => {
        throw new Error("550 <a@b.ch> rejected");
      },
    } as ChannelSender;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "system", title: "T", body: "B", dedupeKey: "mask-1", email: true }, failing, NOW);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    warn.mockRestore();
    const email = r.deliveries.find((d) => d.channel === "email")!;
    expect(email.status).toBe("pending");
    expect(email.last_error).toBe("550 <[email]> rejected");
    const [row] = await store.select("notification_deliveries", { where: [["id", "eq", email.id]] });
    expect(row.last_error).not.toContain("a@b.ch");
    expect(logged).not.toContain("a@b.ch");
  });
});

describe("webhook Outlook : corps borné", () => {
  it("1000 notifications : au plus 100 recherches de connexion", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    const store = memoryStore();
    const select = vi.spyOn(store, "select");
    __setStoreForTests(store);
    const { POST } = await import("@/app/api/calendar/outlook/webhook/route");
    const value = Array.from({ length: 1000 }, (_, i) => ({ subscriptionId: `sub-${i}`, clientState: "x" }));
    const res = await POST(new NextRequest("http://app.test/api/calendar/outlook/webhook", { method: "POST", body: JSON.stringify({ value }), headers: { "x-forwarded-for": "192.0.2.10" } }));
    expect(res.status).toBe(202);
    expect(select.mock.calls.filter((c) => c[0] === "calendar_connections").length).toBe(100);
  });

  it("corps réel au-delà de 64 Kio sans Content-Length : 413", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    const { POST } = await import("@/app/api/calendar/outlook/webhook/route");
    const req = new NextRequest("http://app.test/api/calendar/outlook/webhook", { method: "POST", body: JSON.stringify({ value: [], pad: "x".repeat(70000) }), headers: { "x-forwarded-for": "192.0.2.12" } });
    req.headers.delete("content-length");
    expect((await POST(req)).status).toBe(413);
  });

  it("Content-Length au-delà de 64 Kio : 413", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    const { POST } = await import("@/app/api/calendar/outlook/webhook/route");
    const res = await POST(new NextRequest("http://app.test/api/calendar/outlook/webhook", { method: "POST", body: "{}", headers: { "content-length": "70000", "x-forwarded-for": "192.0.2.11" } }));
    expect(res.status).toBe(413);
  });
});

describe("DELETE /api/events/:id : message d'annulation borné", () => {
  async function setup() {
    vi.stubEnv("DATA_BACKEND", "local");
    const store = memoryStore();
    __setStoreForTests(store);
    const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    const id = randomUUID();
    await store.insert("local_users", { id, email: "orga@exemple.ch", password_hash: "x" });
    await bootstrapAccount(store, { id, email: "orga@exemple.ch", name: "Orga" });
    jar.set(SESSION_COOKIE, signSession({ uid: id, email: "orga@exemple.ch", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const [m] = await store.select("organization_members", { where: [["user_id", "eq", id]] });
    const ctx = { store, userId: id, email: "orga@exemple.ch", orgId: m.organization_id, orgRole: m.role, timezone: "Europe/Zurich", now: () => NOW, mailer: new FakeMailer() };
    const e = await createEvent(ctx, { title: "Répétition", date: "2027-01-20", startTime: "20:00", endTime: "21:00", timezone: "Europe/Zurich" });
    const { DELETE } = await import("@/app/api/events/[id]/route");
    const call = (query: string, body?: unknown) =>
      DELETE(
        new NextRequest(`http://app.test/api/events/${e.id}?confirm=true${query}`, {
          method: "DELETE",
          headers: { host: "app.test", origin: "http://app.test", "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: e.id }) },
      );
    return { store, e, call };
  }

  it("message de 1001 caractères (corps JSON ou ?message=) : 400, événement non annulé", async () => {
    const { store, e, call } = await setup();
    expect((await call("", { message: "a".repeat(1001) })).status).toBe(400);
    expect((await call(`&message=${"a".repeat(1001)}`)).status).toBe(400);
    expect((await store.get("events", e.id))?.status).not.toBe("cancelled");
  });

  it("message valide dans le corps JSON : annulation", async () => {
    const { store, e, call } = await setup();
    const res = await call("", { message: "Reportée à cause de la neige." });
    expect(res.status).toBe(200);
    expect((await store.get("events", e.id))?.status).toBe("cancelled");
  });
});
