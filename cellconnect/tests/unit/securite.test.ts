import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { FakeMailer, joinOrg, makeUser, memoryStore, NOW } from "./helpers";
import { createEvent } from "@/lib/agents/calendar-agent";
import { acceptInvitationToken, inviteByEmail } from "@/lib/agents/invitation-agent";
import { addOrgMemberByEmail, createGroup, listGroupMembers, listGroups, listOrgMembers, addGroupMember } from "@/lib/agents/group-agent";
import { bootstrapAccount, deleteAccountData } from "@/lib/auth/account";
import { randomToken, sha256Hex, hmac } from "@/lib/auth/crypto";
import { env } from "@/lib/env";
import { api, clientIp, idempotent, checkRateLimit } from "@/lib/http/api";
import { channelToken, purposeKey } from "@/lib/integrations/oauth";
import { serverNow } from "@/lib/clock";
import { __setStoreForTests } from "@/lib/db";
import type { TableName } from "@/lib/types";

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
  jar.clear();
});

const tz = "Europe/Zurich";
const linkOf = (text: string) => /\/invitation\/([A-Za-z0-9_-]+)/.exec(text)![1];

async function newcomer(store: ReturnType<typeof memoryStore>, mailer: FakeMailer, email: string) {
  const id = randomUUID();
  await bootstrapAccount(store, { id, email, name: "Nouvelle" }, { invited: true });
  return { store, userId: id, email, mailer, now: () => NOW, timezone: tz };
}

describe("Invitations : acceptation sûre", () => {
  it("refuse une invitation forgée (autre église, rôle administrateur) sans créer d'adhésion", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const attacker = await makeUser(store, "Pirate", mailer);
    const victim = await makeUser(store, "Victime", mailer);
    const token = randomToken(32);
    // Ligne insérée directement (comme le permettait l'ancienne politique invitations_write).
    await store.insert("invitations", {
      event_id: null,
      organization_id: victim.orgId,
      invited_by: attacker.userId,
      invitee_user_id: null,
      invitee_email: "pirate2@exemple.ch",
      group_id: null,
      status: "pending",
      token_hash: sha256Hex(token),
      responded_at: null,
      org_role: "org_admin",
      email_status: null,
      email_error: null,
      expires_at: new Date(NOW.getTime() + 86400000).toISOString(),
    });
    const u = await newcomer(store, mailer, "pirate2@exemple.ch");
    await expect(acceptInvitationToken(u, token, "accepted")).rejects.toMatchObject({ status: 404 });
    expect(await store.select("organization_members", { where: [["organization_id", "eq", victim.orgId], ["user_id", "eq", u.userId]] })).toHaveLength(0);
    // Le lien n'a pas été consommé par la tentative.
    const [inv] = await store.select("invitations", { where: [["token_hash", "eq", sha256Hex(token)]] });
    expect(inv.status).toBe("pending");
  });

  it("refuse une invitation dont l'événement appartient à une autre église", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const a = await makeUser(store, "Anne", mailer);
    const b = await makeUser(store, "Bruno", mailer);
    const foreign = await createEvent(b, { title: "Privé", date: "2027-01-20", startTime: "20:00", endTime: "21:00", timezone: tz });
    const token = randomToken(32);
    await store.insert("invitations", {
      event_id: foreign.id,
      organization_id: a.orgId,
      invited_by: a.userId,
      invitee_user_id: null,
      invitee_email: "x@exemple.ch",
      group_id: null,
      status: "pending",
      token_hash: sha256Hex(token),
      responded_at: null,
      org_role: "guest",
    });
    const u = await newcomer(store, mailer, "x@exemple.ch");
    await expect(acceptInvitationToken(u, token, "accepted")).rejects.toMatchObject({ status: 404 });
    expect(await store.count("event_participants", [["event_id", "eq", foreign.id], ["user_id", "eq", u.userId]])).toBe(0);
  });

  it("une invitation avec groupe ajoute la personne au groupe après acceptation", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    const g = await createGroup(admin, { name: "Cellule Nord", color: "#1d4ed8" });
    await inviteByEmail(admin, { emails: ["groupe@exemple.ch"], orgRole: "member", groupId: g.id }, "https://app.test");
    const audit = await store.select("audit_logs", { where: [["action", "eq", "invitation.created"]] });
    expect(audit[0].metadata).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    const u = await newcomer(store, mailer, "groupe@exemple.ch");
    await acceptInvitationToken(u, linkOf(mailer.sent[0].text), "accepted");
    const gm = await store.select("group_members", { where: [["group_id", "eq", g.id], ["user_id", "eq", u.userId]] });
    expect(gm).toHaveLength(1);
    expect(gm[0].role).toBe("member");
  });

  it("refuse un groupe d'une autre église dans inviteByEmail", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const a = await makeUser(store, "Anne", mailer);
    const b = await makeUser(store, "Bruno", mailer);
    const gb = await createGroup(b, { name: "Groupe B", color: "#1d4ed8" });
    await expect(inviteByEmail(a, { emails: ["y@exemple.ch"], groupId: gb.id }, "https://app.test")).rejects.toMatchObject({ status: 404 });
  });
});

describe("GroupAgent : confidentialité", () => {
  it("addOrgMemberByEmail invite toujours, avec la même réponse, sans ajout direct", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    const existing = await makeUser(store, "Existant", mailer);
    const r1 = await addOrgMemberByEmail(admin, existing.email, "member", "https://app.test");
    const r2 = await addOrgMemberByEmail(admin, "inconnu@exemple.ch", "member", "https://app.test");
    expect(r1).toEqual(r2);
    expect(r1).toMatchObject({ invited: true });
    expect(await store.count("organization_members", [["organization_id", "eq", admin.orgId], ["user_id", "eq", existing.userId]])).toBe(0);
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["existant@exemple.ch", "inconnu@exemple.ch"]);
  });

  it("listGroupMembers : e-mails masqués pour un simple membre, visibles pour le responsable", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const leader = await makeUser(store, "Resp", mailer);
    const member = await joinOrg(leader, await makeUser(store, "Membre", mailer), "member");
    const g = await createGroup(leader, { name: "Cellule", color: "#1d4ed8" });
    await addGroupMember(leader, g.id, member.userId);
    const asMember = await listGroupMembers(member, g.id);
    expect(asMember.members.every((m) => m.email === null)).toBe(true);
    const asLeader = await listGroupMembers(leader, g.id);
    expect(asLeader.members.some((m) => m.email === "membre@exemple.ch")).toBe(true);
  });

  it("listOrgMembers : un invité ne voit pas l'annuaire", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    const guest = await joinOrg(admin, await makeUser(store, "Invite", mailer), "guest");
    expect(await listOrgMembers(guest)).toEqual([]);
    expect((await listOrgMembers(admin)).length).toBe(2);
  });

  it("listGroups : canManage pour admin et responsable seulement", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    const leader = await joinOrg(admin, await makeUser(store, "Resp", mailer), "group_leader");
    const member = await joinOrg(admin, await makeUser(store, "Membre", mailer), "member");
    const g = await createGroup(leader, { name: "Cellule", color: "#1d4ed8" });
    await addGroupMember(leader, g.id, member.userId);
    expect((await listGroups(admin)).find((x) => x.id === g.id)?.canManage).toBe(true);
    expect((await listGroups(leader)).find((x) => x.id === g.id)?.canManage).toBe(true);
    expect((await listGroups(member)).find((x) => x.id === g.id)?.canManage).toBe(false);
  });
});

describe("Configuration de production", () => {
  it("SESSION_SECRET obligatoire en production, quel que soit le backend", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATA_BACKEND", "supabase");
    expect(() => env.sessionSecret).toThrow(/SESSION_SECRET/);
    vi.stubEnv("DATA_BACKEND", "local");
    expect(() => env.sessionSecret).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "trop-court");
    vi.stubEnv("APP_URL", "https://cellconnect.example");
    expect(() => env.sessionSecret).toThrow(/32/);
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    expect(env.sessionSecret).toHaveLength(40);
  });

  it("APP_URL en https obligatoire en production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATA_BACKEND", "supabase");
    vi.stubEnv("APP_URL", "");
    expect(() => env.appUrl).toThrow(/APP_URL/);
    vi.stubEnv("APP_URL", "http://cellconnect.example");
    expect(() => env.appUrl).toThrow(/https/);
    vi.stubEnv("APP_URL", "https://cellconnect.example/");
    expect(env.appUrl).toBe("https://cellconnect.example");
  });

  it("clés dérivées par usage (HKDF) : état OAuth et jeton de canal distincts du secret de session", () => {
    const state = purposeKey("oauth-state");
    const watch = purposeKey("watch-channel");
    expect(state).not.toBe(watch);
    expect(state).not.toBe(env.sessionSecret);
    expect(channelToken("c1")).not.toBe(hmac(env.sessionSecret, "watch:c1"));
    expect(channelToken("c1")).toBe(channelToken("c1"));
  });

  it("TEST_NOW est ignoré en production avec Supabase", () => {
    vi.stubEnv("TEST_NOW", "2030-01-01T00:00:00Z");
    expect(serverNow().toISOString()).toBe("2030-01-01T00:00:00.000Z");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATA_BACKEND", "supabase");
    expect(serverNow().getUTCFullYear()).not.toBe(2030);
  });
});

describe("Couche HTTP", () => {
  it("idempotence : deux appels simultanés n'exécutent l'opération qu'une fois", async () => {
    const store = memoryStore();
    const ctx = await makeUser(store, "Ida", new FakeMailer());
    const req = () => new Request("http://app.test/api/events", { method: "POST", headers: { "idempotency-key": "cle-idempotence-1" } });
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: calls };
    };
    const settled = await Promise.allSettled([idempotent(ctx, req(), "s", fn), idempotent(ctx, req(), "s", fn)]);
    expect(calls).toBe(1);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((s) => s.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, message: "Enregistrement déjà en cours." });
    // Une fois terminé : la réponse enregistrée est renvoyée sans rejouer.
    expect(await idempotent(ctx, req(), "s", fn)).toEqual({ ok: 1 });
    expect(calls).toBe(1);
  });

  it("idempotence : une erreur libère la clé", async () => {
    const store = memoryStore();
    const ctx = await makeUser(store, "Ida", new FakeMailer());
    const req = () => new Request("http://app.test/api/events", { method: "POST", headers: { "idempotency-key": "cle-idempotence-2" } });
    await expect(idempotent(ctx, req(), "s", async () => Promise.reject(new Error("panne")))).rejects.toThrow("panne");
    expect(await store.count("idempotency_keys", [["key", "eq", "cle-idempotence-2"]])).toBe(0);
    expect(await idempotent(ctx, req(), "s", async () => ({ ok: true }))).toEqual({ ok: true });
  });

  it("identifiant d'URL mal formé : 404 avant tout accès aux données", async () => {
    let called = false;
    const handler = api(
      async () => {
        called = true;
        return { ok: true };
      },
      { auth: false },
    );
    const res = await handler(new NextRequest("http://app.test/api/events/abc"), { params: Promise.resolve({ id: "abc' or 1=1" }) });
    expect(res.status).toBe(404);
    expect(called).toBe(false);
    const ok = await handler(new NextRequest("http://app.test/api/events/x"), { params: Promise.resolve({ id: randomUUID(), token: "pas-un-uuid" }) });
    expect(ok.status).toBe(200);
  });

  it("IP : X-Forwarded-For falsifié par le client ignoré", () => {
    const req = (h: Record<string, string>) => new Request("http://app.test/", { headers: h });
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }), 2)).toBe("203.0.113.9");
    expect(clientIp(req({}), 1)).toBe("anon");
  });

  it("IP : X-Real-IP ignoré sauf derrière un proxy de confiance (TRUST_REAL_IP=1 ou Vercel)", () => {
    const req = (h: Record<string, string>) => new Request("http://app.test/", { headers: h });
    const r = req({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" });
    vi.stubEnv("TRUST_REAL_IP", "");
    vi.stubEnv("VERCEL", "");
    expect(clientIp(r, 1)).toBe("6.6.6.6");
    vi.stubEnv("TRUST_REAL_IP", "1");
    expect(clientIp(r, 1)).toBe("198.51.100.7");
    vi.stubEnv("TRUST_REAL_IP", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATA_BACKEND", "local");
    expect(clientIp(r, 1)).toBe("198.51.100.7");
  });

  it("limitation de débit : fenêtre configurable", () => {
    const k = `w-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(checkRateLimit(k, 5, 1000, 15 * 60000)).toBe(true);
    expect(checkRateLimit(k, 5, 10 * 60000, 15 * 60000)).toBe(false);
    expect(checkRateLimit(k, 5, 16 * 60000 + 1000, 15 * 60000)).toBe(true);
  });

  it("envoi de captures sans Content-Length : 411 au format { error: { code, message } }", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    const store = memoryStore();
    __setStoreForTests(store);
    const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    const id = randomUUID();
    await store.insert("local_users", { id, email: "u@exemple.ch", password_hash: "x" });
    await bootstrapAccount(store, { id, email: "u@exemple.ch", name: "U" });
    jar.set(SESSION_COOKIE, signSession({ uid: id, email: "u@exemple.ch", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const { POST } = await import("@/app/api/uploads/route");
    const res = await POST(new NextRequest("http://app.test/api/uploads", { method: "POST", headers: { host: "app.test", origin: "http://app.test" } }), { params: Promise.resolve({}) });
    expect(res.status).toBe(411);
    const json = await res.json();
    expect(json.error).toMatchObject({ code: "length_required", message: expect.stringContaining("Rechargez la page") });
    expect(await store.count("extraction_jobs", [["user_id", "eq", id]])).toBe(0);
  });

  it("webhook e-mail : corps lu avec une borne, erreurs au format { error: { code, message } }", async () => {
    vi.stubEnv("INBOUND_EMAIL_DOMAIN", "in.example.ch");
    vi.stubEnv("INBOUND_EMAIL_SECRET", "s".repeat(32));
    vi.stubEnv("INBOUND_EMAIL_WEBHOOK_TOKEN", "t".repeat(32));
    const { POST } = await import("@/app/api/inbound/email/route");
    const url = `http://app.test/api/inbound/email?token=${"t".repeat(32)}`;
    const tooBig = await POST(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", "content-length": String(31 * 1024 * 1024) }, body: "{}" }));
    expect(tooBig.status).toBe(413);
    expect((await tooBig.json()).error).toMatchObject({ code: "too_large", message: expect.any(String) });
    const bad = await POST(new NextRequest(`http://app.test/api/inbound/email?token=mauvais`, { method: "POST" }));
    expect(bad.status).toBe(401);
    expect((await bad.json()).error.code).toBe("unauthorized");
  });
});

describe("Store : socle", () => {
  it("updateWhere renvoie les lignes modifiées ; count compte", async () => {
    const store = memoryStore();
    const ctx = await makeUser(store, "Sam", new FakeMailer());
    for (const t of ["A", "B", "C"]) await createEvent(ctx, { title: t, date: "2027-02-01", startTime: "10:00", endTime: "11:00", timezone: tz });
    expect(await store.count("events", [["organization_id", "eq", ctx.orgId]])).toBe(3);
    const changed = await store.updateWhere("events", [["organization_id", "eq", ctx.orgId], ["title", "in", ["A", "B"]]], { location: "Salle 2" });
    expect(changed.map((e) => e.title).sort()).toEqual(["A", "B"]);
    expect(await store.count("events", [["location", "eq", "Salle 2"]])).toBe(2);
    expect(await store.count("events", [["location", "not_is", null]])).toBe(2);
    expect(await store.updateWhere("events", [["title", "eq", "Z"]], { location: "x" })).toEqual([]);
    await expect(store.updateWhere("events", [], { location: "x" })).rejects.toThrow();
  });

  it("unicité de reminders.dedupe_key limitée aux rappels programmés", async () => {
    const store = memoryStore();
    const ctx = await makeUser(store, "Rita", new FakeMailer());
    const e = await createEvent(ctx, { title: "R", date: "2027-02-01", startTime: "10:00", endTime: "11:00", timezone: tz });
    const base = { event_id: e.id, organization_id: ctx.orgId, user_id: ctx.userId, offset_minutes: 30, occurrence_start: e.starts_at, remind_at: e.starts_at, dedupe_key: "k-unique", sent_at: null };
    await store.insert("reminders", { ...base, status: "sent" });
    await store.insert("reminders", { ...base, status: "scheduled" });
    await expect(store.insert("reminders", { ...base, status: "scheduled" })).rejects.toThrow(/unicité/);
  });
});

describe("Compte : effacement", () => {
  it("après effacement, aucune table ne garde le user_id", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    const leaving = await makeUser(store, "Part", mailer);
    const inShared = await joinOrg(admin, leaving, "member");
    const g = await createGroup(admin, { name: "Cellule", color: "#1d4ed8" });
    await addGroupMember(admin, g.id, leaving.userId);
    await createEvent(leaving, { title: "Perso", date: "2027-02-01", startTime: "10:00", endTime: "11:00", timezone: tz });
    const shared = await createEvent(inShared, { title: "Partagé", date: "2027-02-02", startTime: "10:00", endTime: "11:00", timezone: tz });
    await store.insert("idempotency_keys", { user_id: leaving.userId, scope: "s", key: "k12345678", response: null });

    const r = await deleteAccountData(store, leaving.userId);
    expect(r.deletedOrganizations).toEqual([leaving.orgId]);
    const tables: TableName[] = [
      "organization_members", "group_members", "uploads", "extraction_jobs", "extracted_events", "event_participants", "calendar_connections",
      "calendar_conflicts", "conflict_resolutions", "reminders", "notifications", "notification_deliveries", "agent_tasks", "idempotency_keys",
      "push_subscriptions", "messaging_links",
    ];
    for (const t of tables) expect(await store.count(t, [["user_id" as never, "eq", leaving.userId]]), t).toBe(0);
    expect(await store.get("profiles", leaving.userId)).toBeNull();
    expect(await store.get("organizations", leaving.orgId)).toBeNull();
    // L'événement collectif reste dans l'église, transmis à un administrateur.
    expect((await store.get("events", shared.id))?.created_by).toBe(admin.userId);
    expect(await store.count("events", [["created_by", "eq", leaving.userId]])).toBe(0);
    expect(await store.count("event_changes", [["changed_by", "eq", leaving.userId]])).toBe(0);
  });

  it("refuse l'effacement du seul administrateur d'une église qui a d'autres membres", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    await joinOrg(admin, await makeUser(store, "Membre", mailer), "member");
    await expect(deleteAccountData(store, admin.userId)).rejects.toMatchObject({ status: 400, message: "Désignez d'abord un autre administrateur de l'église." });
    expect(await store.get("profiles", admin.userId)).not.toBeNull();
  });

  it("bootstrapAccount : « Mon église » par défaut, rien pour une personne invitée", async () => {
    const store = memoryStore();
    const id = randomUUID();
    await bootstrapAccount(store, { id, email: "a@exemple.ch", name: "A" });
    const [m] = await store.select("organization_members", { where: [["user_id", "eq", id]] });
    expect((await store.get("organizations", m.organization_id))?.name).toBe("Mon église");
    const invited = randomUUID();
    await bootstrapAccount(store, { id: invited, email: "b@exemple.ch", name: "B" }, { invited: true });
    expect(await store.count("organization_members", [["user_id", "eq", invited]])).toBe(0);
  });
});

describe("Session locale", () => {
  it("le cookie d'un compte supprimé donne 401", async () => {
    vi.stubEnv("DATA_BACKEND", "local");
    const store = memoryStore();
    __setStoreForTests(store);
    const { requireCtx, signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    const id = randomUUID();
    await store.insert("local_users", { id, email: "c@exemple.ch", password_hash: "x" });
    await bootstrapAccount(store, { id, email: "c@exemple.ch", name: "C" });
    jar.set(SESSION_COOKIE, signSession({ uid: id, email: "c@exemple.ch", exp: Math.floor(Date.now() / 1000) + 3600 }));
    expect((await requireCtx()).userId).toBe(id);
    await deleteAccountData(store, id);
    await store.delete("local_users", id);
    await expect(requireCtx()).rejects.toMatchObject({ status: 401 });
    // Aucun compte fantôme recréé.
    expect(await store.get("profiles", id)).toBeNull();
  });
});

describe("Migration RLS (PostgreSQL réel via PGlite)", () => {
  const A = "00000000-0000-0000-0000-00000000000a";
  const B = "00000000-0000-0000-0000-00000000000b";
  const ORG_A = "10000000-0000-0000-0000-00000000000a";
  const ORG_B = "10000000-0000-0000-0000-00000000000b";
  const EV_A = "20000000-0000-0000-0000-00000000000a";
  let db: PGlite;

  async function asUser(uid: string, sql: string) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec("reset role;");
    }
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls;
      grant usage on schema public to authenticated;
    `);
    const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
    for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
    await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
    await db.exec(`
      insert into auth.users values ('${A}', 'a@x.ch'), ('${B}', 'b@x.ch');
      insert into profiles (id, email, display_name) values ('${A}', 'a@x.ch', 'Alice'), ('${B}', 'b@x.ch', 'Bob');
      insert into organizations (id, name, slug, created_by) values ('${ORG_A}', 'Org A', 'a', '${A}'), ('${ORG_B}', 'Org B', 'b', '${B}');
      insert into organization_members (organization_id, user_id, role) values ('${ORG_A}', '${A}', 'org_admin'), ('${ORG_B}', '${B}', 'org_admin'), ('${ORG_A}', '${B}', 'member');
      insert into events (id, organization_id, created_by, title, starts_at, ends_at) values ('${EV_A}', '${ORG_A}', '${A}', 'Réunion A', '2027-01-20T20:00Z', '2027-01-20T21:00Z');
      insert into event_participants (event_id, organization_id, user_id, role, status) values ('${EV_A}', '${ORG_A}', '${B}', 'participant', 'invited');
    `);
  });

  it("aucune politique d'écriture sur invitations : un administrateur ne peut pas en insérer directement", async () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261119000000_securite_rls.sql"), "utf8");
    expect(sql).not.toMatch(/create policy \w+ on public\.invitations for (insert|update|all)/i);
    await expect(
      asUser(A, `insert into invitations (event_id, organization_id, invited_by, invitee_email, status, token_hash, org_role) values (null, '${ORG_B}', '${A}', 'x@x.ch', 'pending', 'h', 'org_admin')`),
    ).rejects.toThrow();
    const p = await db.query<{ policyname: string; cmd: string }>(`select policyname, cmd from pg_policies where tablename = 'invitations'`);
    expect(p.rows.every((r) => r.cmd === "SELECT")).toBe(true);
  });

  it("participants : la réponse est modifiable, pas le rôle ni l'événement", async () => {
    const ok = await asUser(B, `update event_participants set status = 'accepted' where user_id = '${B}' returning status`);
    expect(ok.rows).toEqual([{ status: "accepted" }]);
    await expect(asUser(B, `update event_participants set role = 'organizer' where user_id = '${B}'`)).rejects.toThrow(/non autorisée/);
  });

  it("captures et analyses : pas d'insertion directe", async () => {
    await expect(
      asUser(A, `insert into uploads (organization_id, user_id, kind, mime_type, size_bytes, sha256) values ('${ORG_A}', '${A}', 'text', 'text/plain', 1, 'x')`),
    ).rejects.toThrow();
    const pol = await db.query<{ tablename: string; cmd: string }>(`select tablename, cmd from pg_policies where tablename in ('uploads', 'extraction_jobs', 'extracted_events')`);
    expect(pol.rows.every((r) => r.cmd === "SELECT" || (r.tablename === "uploads" && r.cmd === "DELETE"))).toBe(true);
  });

  it("rappels : clé de déduplication unique seulement parmi les rappels programmés", async () => {
    const ins = (status: string) =>
      db.exec(`insert into reminders (event_id, organization_id, user_id, offset_minutes, occurrence_start, remind_at, status, dedupe_key) values ('${EV_A}', '${ORG_A}', '${A}', 30, '2027-01-20T20:00Z', '2027-01-20T19:30Z', '${status}', 'k1')`);
    await ins("sent");
    await ins("scheduled");
    await expect(ins("scheduled")).rejects.toThrow();
  });
});
