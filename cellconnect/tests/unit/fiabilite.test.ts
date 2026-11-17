import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { FakeMailer, makeUser, memoryStore, NOW } from "./helpers";
import { cancelEvent, createEvent, listCalendar } from "@/lib/agents/calendar-agent";
import { extendRecurringConflicts } from "@/lib/agents/conflict-agent";
import { commitDrafts, getJob, runExtractionJob, startExtraction } from "@/lib/agents/orchestrator";
import { parseFrenchText } from "@/lib/agents/text-parser";
import type { ExtractionProvider } from "@/lib/agents/vision-agent";
import { tick } from "@/lib/worker";
import { __setStoreForTests } from "@/lib/db";
import { bootstrapAccount } from "@/lib/auth/account";
import type { ExtractionResult } from "@/lib/schemas/extraction";

/** Lot « fiabilité du moteur » : analyses, validation concurrente, séries et budget du worker. */

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

const tz = "Europe/Zurich";
const dataDir = mkdtempSync(path.join(tmpdir(), "cc-fiabilite-"));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));
beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "local");
  vi.stubEnv("DATA_DIR", dataDir);
});
afterEach(() => {
  vi.unstubAllEnvs();
  jar.clear();
  __setStoreForTests(null as never);
});

const TEXT = "Formation 20 janvier 2027 20h30-22h";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)]);
const ONE_EVENT: ExtractionResult = { events: parseFrenchText(TEXT).events, contextNotes: null, warnings: [] };

describe("Analyse IA : délai et relances", () => {
  it("le client OpenAI expire à 40 s sans relance interne (les relances sont celles du job)", () => {
    const src = readFileSync(path.resolve(__dirname, "../../src/lib/agents/vision-agent.ts"), "utf8");
    expect(src).toContain("timeout: 40_000, maxRetries: 0");
  });
});

describe("Worker : budget des analyses", () => {
  it("budget presque épuisé : aucune analyse lancée, elle reste en attente pour le passage suivant", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    const job = await startExtraction(u, [{ type: "text", text: TEXT }]);
    const later = new Date(Date.now() + 60000);

    // Horloge : 20 s déjà écoulées dès la première étape (il reste 40 s < 45 s nécessaires).
    let calls = 0;
    const report = await tick(store, mailer, later, { clock: () => (calls++ === 0 ? 0 : 20000) });
    expect(report.extractions).toBe(0);
    expect((await store.get("extraction_jobs", job.id))?.status).toBe("pending");

    // Budget intact : l'analyse est lancée.
    const next = await tick(store, mailer, later, { clock: () => 0 });
    expect(next.extractions).toBe(1);
    expect((await store.get("extraction_jobs", job.id))?.status).toBe("needs_review");
  });

  it("étape quotidienne extend_conflicts : exécutée une fois par jour", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    await tick(store, mailer, NOW);
    await tick(store, mailer, new Date(NOW.getTime() + 3600000));
    expect(await store.count("audit_logs", [["action", "eq", "conflicts.extended"]])).toBe(1);
    await tick(store, mailer, new Date(NOW.getTime() + 24 * 3600000));
    expect(await store.count("audit_logs", [["action", "eq", "conflicts.extended"]])).toBe(2);
  });
});

describe("Conflits des séries : l'horizon avance", () => {
  it("deux séries hebdomadaires qui ne se chevauchent qu'après 100 jours : conflit enregistré quand l'horizon avance", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    // Mercredis 20h dès le 11 novembre 2026 ; seconde série, mêmes horaires, dès le 24 février 2027 (106 jours plus tard).
    await createEvent(u, { title: "Cellule", date: "2026-11-11", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    await createEvent(u, { title: "Chorale", date: "2027-02-24", startTime: "20:00", endTime: "21:00", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    expect(await store.count("calendar_conflicts")).toBe(0);

    // Même jour : toujours rien (horizon de 90 jours).
    expect(await extendRecurringConflicts(store, mailer, NOW)).toBe(0);

    const later = new Date(NOW.getTime() + 30 * 86400000);
    const created = await extendRecurringConflicts(store, mailer, later);
    expect(created).toBeGreaterThan(0);
    const conflicts = await store.select("calendar_conflicts", {});
    expect(conflicts.length).toBe(created);
    expect(conflicts.every((c) => c.user_id === u.userId && c.status === "open")).toBe(true);
    expect(conflicts.map((c) => c.occurrence_a_start.slice(0, 10))).toContain("2027-02-24");
    // Sans notification : le conflit apparaît dans l'agenda.
    expect(await store.count("notifications", [["type", "eq", "conflict_detected"]])).toBe(0);
    // Idempotent : un second passage n'ajoute rien.
    expect(await extendRecurringConflicts(store, mailer, later)).toBe(0);
  });

  it("une série annulée ou terminée n'est pas prolongée", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    const a = await createEvent(u, { title: "Cellule", date: "2026-11-11", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    await createEvent(u, { title: "Chorale", date: "2027-02-24", startTime: "20:00", endTime: "21:00", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    await cancelEvent(u, a.id, { confirm: true });
    expect(await extendRecurringConflicts(store, mailer, new Date(NOW.getTime() + 30 * 86400000))).toBe(0);
  });
});

describe("Validation : réservation atomique des brouillons", () => {
  it("deux validations simultanées du même import ne créent qu'un événement", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const job = await startExtraction(u, [{ type: "text", text: TEXT }]);
    await runExtractionJob(store, job.id, { now: () => NOW });
    const { drafts } = await getJob(u, job.id);
    const ready = drafts.map((d) => ({ ...d, confirmed: true }));
    // Deux requêtes (clés d'idempotence différentes) traitées en parallèle.
    const [a, b] = await Promise.all([commitDrafts(u, { jobId: job.id, drafts: ready, decisions: [] }), commitDrafts(u, { jobId: job.id, drafts: ready, decisions: [] })]);
    expect(await store.count("events")).toBe(1);
    expect(a.created.length + b.created.length).toBe(1);
    expect(a.skipped.length + b.skipped.length).toBe(1);
    const [row] = await store.select("extracted_events", { where: [["job_id", "eq", job.id]] });
    expect(row.status).toBe("created");
    expect(row.event_id).toBe([...a.created, ...b.created][0].eventId);
    // L'analyse est clôturée par la validation qui a créé l'événement.
    expect((await store.get("extraction_jobs", job.id))?.status).toBe("completed");
  });

  it("échec de création : la ligne redevient disponible", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const job = await startExtraction(u, [{ type: "text", text: TEXT }]);
    await runExtractionJob(store, job.id, { now: () => NOW });
    const { drafts } = await getJob(u, job.id);
    // Groupe inexistant : createEvent échoue.
    const ready = drafts.map((d) => ({ ...d, confirmed: true, groupId: randomUUID() }));
    const r = await commitDrafts(u, { jobId: job.id, drafts: ready, decisions: [] });
    expect(r.failures).toHaveLength(1);
    const [row] = await store.select("extracted_events", { where: [["job_id", "eq", job.id]] });
    expect(row).toMatchObject({ status: "pending", event_id: null });
    expect((await store.get("extraction_jobs", job.id))?.status).toBe("needs_review");
  });

  it("analyse remise en attente pendant le traitement : le passage à la relecture n'écrase rien", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const job = await startExtraction(u, [{ type: "file", data: JPEG, name: null }]);
    // Le worker juge l'analyse bloquée et la remet en attente pendant l'appel au modèle.
    const slow: ExtractionProvider = {
      name: "fake-ai",
      supports: () => true,
      async extract() {
        await store.update("extraction_jobs", job.id, { status: "pending" });
        return ONE_EVENT;
      },
    };
    const r = await runExtractionJob(store, job.id, { providers: [slow], now: () => NOW });
    expect(r?.status).toBe("pending");
    // La reprise suivante aboutit normalement.
    const again = await runExtractionJob(store, job.id, { providers: [{ ...slow, extract: async () => ONE_EVENT }], now: () => NOW });
    expect(again?.status).toBe("needs_review");
  });
});

describe("Agenda : série annulée", () => {
  it("une série annulée apparaît, au statut annulé, sur une période qui ne contient pas sa première date", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const e = await createEvent(u, { title: "Cellule", date: "2027-01-06", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY;COUNT=10" });
    await cancelEvent(u, e.id, { confirm: true });
    const from = "2027-01-18T00:00:00Z";
    const to = "2027-02-01T00:00:00Z";
    const items = await listCalendar(u, from, to, "org", true);
    const mine = items.filter((i) => i.eventId === e.id);
    expect(mine.map((i) => i.start)).toEqual(["2027-01-20T19:00:00.000Z", "2027-01-27T19:00:00.000Z"]);
    expect(mine.every((i) => i.status === "cancelled")).toBe(true);
    // Sans includeCancelled : masquée.
    expect((await listCalendar(u, from, to, "org", false)).filter((i) => i.eventId === e.id)).toHaveLength(0);
  });
});

describe("GET /api/extract-events", () => {
  it("?limit=5 renvoie au plus 5 analyses ; valeur invalide : 20 par défaut", async () => {
    const store = memoryStore();
    __setStoreForTests(store);
    const { signSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    const { GET } = await import("@/app/api/extract-events/route");
    const id = randomUUID();
    await store.insert("local_users", { id, email: "d@exemple.ch", password_hash: "x" });
    await bootstrapAccount(store, { id, email: "d@exemple.ch", name: "D" });
    const [m] = await store.select("organization_members", { where: [["user_id", "eq", id]] });
    const ctx = { store, userId: id, email: "d@exemple.ch", orgId: m.organization_id, orgRole: m.role, timezone: tz, now: () => NOW, mailer: new FakeMailer() };
    for (let i = 0; i < 7; i++) await startExtraction(ctx, [{ type: "text", text: `${TEXT} ${i}` }]);
    jar.set(SESSION_COOKIE, signSession({ uid: id, email: "d@exemple.ch", exp: Math.floor(Date.now() / 1000) + 3600 }));

    const call = async (query: string) => {
      const res = (await GET(new NextRequest(`http://localhost/api/extract-events${query}`), { params: Promise.resolve({}) })) as Response;
      expect(res.status).toBe(200);
      return ((await res.json()) as { jobs: unknown[] }).jobs.length;
    };
    expect(await call("?limit=5")).toBe(5);
    expect(await call("?limit=0")).toBe(7);
    expect(await call("?limit=abc")).toBe(7);
    expect(await call("")).toBe(7);
  });
});
