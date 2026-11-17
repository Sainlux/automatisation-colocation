import { describe, expect, it } from "vitest";
import { FakeMailer, joinOrg, makeUser, memoryStore, NOW } from "./helpers";
import type { Store } from "@/lib/db/store";
import type { LocalStore } from "@/lib/db/local-store";
import type { Ctx } from "@/lib/context";
import { createEvent } from "@/lib/agents/calendar-agent";
import { detectForUserEvent } from "@/lib/agents/conflict-agent";
import { listConflicts } from "@/lib/agents/conflict-resolution";
import { notify, processPendingDeliveries } from "@/lib/agents/notification-agent";
import { cancelReminders, rescheduleEvent, rescheduleUserReminders } from "@/lib/agents/reminder-agent";
import { tick } from "@/lib/worker";

/**
 * Lot L3 — performance du backend : nombre d'appels au Store sur les chemins
 * chauds (rappels, conflits), robustesse du worker et envois sans doublon.
 */

const tz = "Europe/Zurich";
const DAY = 86400000;

/** Enveloppe un Store et compte chaque appel (select, insert, update…). */
function counting(inner: Store) {
  const calls: string[] = [];
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}:${String(args[0])}`);
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { store, calls };
}

/** Store qui échoue sur certaines tables (panne simulée d'une étape du worker). */
function failing(inner: Store, tables: string[]): Store {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        if (prop === "select" && tables.includes(String(args[0]))) return Promise.reject(new Error(`panne simulée : ${String(args[0])}`));
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

async function addParticipants(owner: Ctx, eventId: string, count: number, store: LocalStore, mailer: FakeMailer) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = await joinOrg(owner, await makeUser(store, `Membre${i}`, mailer));
    await store.insert("event_participants", { event_id: eventId, organization_id: owner.orgId, user_id: m.userId, role: "participant", status: "accepted", responded_at: null });
    ids.push(m.userId);
  }
  return ids;
}

describe("Rappels", () => {
  it("replanifier un événement hebdomadaire de 16 participants : moins de 100 appels au Store", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const leader = await makeUser(store, "Responsable", mailer);
    const e = await createEvent(leader, { title: "Cellule", date: "2026-11-18", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    await addParticipants(leader, e.id, 15, store, mailer);

    const { store: s, calls } = counting(store);
    await rescheduleEvent(s, e, NOW);
    expect(calls.length).toBeLessThan(100);

    const scheduled = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"]] });
    const perUser = scheduled.filter((r) => r.user_id === leader.userId).length;
    expect(perUser).toBeGreaterThan(30); // ~13 semaines × 3 délais
    expect(new Set(scheduled.map((r) => r.user_id)).size).toBe(16);
    expect(scheduled.length).toBe(perUser * 16);
    // Les rappels d'origine du responsable ont été annulés (clé conservée, index unique partiel).
    const cancelled = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "cancelled"]] });
    expect(cancelled.length).toBe(perUser);
    expect(new Set(scheduled.map((r) => r.dedupe_key)).size).toBe(scheduled.length);
  });

  it("cancelReminders annule en un seul appel", async () => {
    const store = memoryStore();
    const leader = await makeUser(store, "Responsable", new FakeMailer());
    const e = await createEvent(leader, { title: "Cellule", date: "2026-11-18", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    const { store: s, calls } = counting(store);
    const n = await cancelReminders(s, e.id);
    expect(n).toBeGreaterThan(0);
    expect(calls).toEqual(["updateWhere:reminders"]);
  });

  it("l'horizon de 90 jours est prolongé par le worker : après 100 jours, il reste des rappels programmés", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const leader = await makeUser(store, "Responsable", mailer);
    const e = await createEvent(leader, { title: "Prière", date: "2026-11-12", startTime: "07:00", endTime: "07:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    const later = new Date(NOW.getTime() + 100 * DAY);
    const report = await tick(store, mailer, later);
    expect(report.extended).toBeGreaterThan(0);
    const future = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"], ["remind_at", "gt", later.toISOString()]] });
    expect(future.length).toBeGreaterThan(0);
    // Une seule prolongation par jour.
    expect((await tick(store, mailer, new Date(later.getTime() + 3600000))).extended).toBe(0);
  });

  it("changement des délais personnels : anciens rappels annulés, nouveaux créés", async () => {
    const store = memoryStore();
    const leader = await makeUser(store, "Responsable", new FakeMailer());
    const e = await createEvent(leader, { title: "Formation", date: "2026-12-02", startTime: "20:00", endTime: "21:30", timezone: tz });
    const before = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"]] });
    expect(before.map((r) => r.offset_minutes).sort((a, b) => a - b)).toEqual([30, 120, 1440]);
    await store.update("profiles", leader.userId, { reminder_offsets: [60] });
    await rescheduleUserReminders(store, leader.userId, [60], NOW);
    const after = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"]] });
    expect(after.map((r) => r.offset_minutes)).toEqual([60]);
    const cancelled = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "cancelled"]] });
    expect(cancelled).toHaveLength(3);
  });
});

describe("Conflits", () => {
  it("deux séries hebdomadaires qui se chevauchent : 1 notification et moins de 80 appels au Store", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    const a = await createEvent(u, { title: "Cellule", date: "2026-11-18", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    const b = await createEvent(u, { title: "Chorale", date: "2026-11-18", startTime: "21:00", endTime: "22:00", timezone: tz, recurrenceRule: "FREQ=WEEKLY" });
    const conflictNotes = () => store.select("notifications", { where: [["user_id", "eq", u.userId], ["type", "eq", "conflict_detected"]] });
    const notes = await conflictNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/dates concernées/);
    const conflicts = await store.select("calendar_conflicts", { where: [["user_id", "eq", u.userId]] });
    // Horizon persisté de 90 jours (et non 400) : une douzaine de semaines.
    expect(conflicts.length).toBeGreaterThan(10);
    expect(conflicts.length).toBeLessThan(16);

    // Nouvelle détection complète, mesurée.
    await store.deleteWhere("calendar_conflicts", [["user_id", "eq", u.userId]]);
    await store.deleteWhere("notifications", [["user_id", "eq", u.userId]]);
    const { store: s, calls } = counting(store);
    const created = await detectForUserEvent(s, mailer, u.userId, b.id, NOW);
    expect(created.length).toBe(conflicts.length);
    expect(calls.length).toBeLessThan(80);
    expect(await conflictNotes()).toHaveLength(1);

    // Deuxième passage : rien de nouveau, aucune notification supplémentaire.
    expect(await detectForUserEvent(store, mailer, u.userId, b.id, NOW)).toHaveLength(0);
    expect(await conflictNotes()).toHaveLength(1);

    // Événement déplacé (nouveaux horaires, chevauchement toujours présent) : nouvelle notification.
    const moved = await store.get("events", b.id);
    await store.update("events", b.id, {
      starts_at: new Date(Date.parse(moved!.starts_at) + 15 * 60000).toISOString(),
      ends_at: new Date(Date.parse(moved!.ends_at) + 15 * 60000).toISOString(),
    });
    expect((await detectForUserEvent(store, mailer, u.userId, b.id, NOW)).length).toBeGreaterThan(0);
    expect(await conflictNotes()).toHaveLength(2);
    await store.update("events", b.id, { starts_at: moved!.starts_at, ends_at: moved!.ends_at });
    await detectForUserEvent(store, mailer, u.userId, b.id, NOW);

    // Liste : createdAt présent sur chaque côté, filtre par événement.
    const list = await listConflicts(u, ["open"], { eventId: a.id });
    expect(list.length).toBe(conflicts.length);
    expect(list[0].a!.createdAt).toBeTruthy();
    expect(list[0].b!.createdAt).toBeTruthy();
    expect(await listConflicts(u, ["open"], { eventId: "00000000-0000-0000-0000-000000000000" })).toHaveLength(0);
  });
});

describe("Livraisons et worker", () => {
  it("deux passages simultanés n'envoient pas deux fois le même e-mail", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    mailer.failNext = 1; // le premier envoi échoue : la livraison reste en attente
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "system", title: "Test", body: "Corps", dedupeKey: "perf:1", email: true }, mailer, NOW);
    expect(r.deliveries.find((d) => d.channel === "email")!.status).toBe("pending");
    const later = new Date(NOW.getTime() + 3600000);
    const [x, y] = await Promise.all([processPendingDeliveries(store, mailer, later), processPendingDeliveries(store, mailer, later)]);
    expect(x.length + y.length).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect((await store.select("notification_deliveries", { where: [["channel", "eq", "email"]] }))[0].status).toBe("sent");
  });

  it("deux ticks simultanés n'envoient qu'un seul rappel par e-mail", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    await createEvent(u, { title: "Formation", date: "2026-11-11", startTime: "20:00", endTime: "21:00", timezone: tz });
    const due = new Date(Date.parse("2026-11-11T19:00:00Z") - 25 * 60000); // après le rappel de 30 min
    await Promise.all([tick(store, mailer, due), tick(store, mailer, due)]);
    expect(mailer.sent.filter((m) => m.subject.includes("Rappel : Formation"))).toHaveLength(1);
  });

  it("une étape en panne n'empêche pas l'envoi d'un rappel dû", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    await createEvent(u, { title: "Formation", date: "2026-11-11", startTime: "20:00", endTime: "21:00", timezone: tz });
    const due = new Date(Date.parse("2026-11-11T19:00:00Z") - 25 * 60000);
    const report = await tick(failing(store, ["agent_tasks", "extraction_jobs", "audit_logs"]), mailer, due);
    expect(report.failedSteps).toBeGreaterThan(0);
    expect(report.reminders).toBe(1);
    expect(mailer.sent.some((m) => m.subject.includes("Rappel : Formation"))).toBe(true);
  });

  it("tâches et analyses interrompues : remises en attente ou passées en échec", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    const old = new Date(Date.now() - 20 * 60000).toISOString();
    const task = (attempts: number, key: string) =>
      store.insert("agent_tasks", {
        organization_id: u.orgId,
        user_id: u.userId,
        agent: "test",
        type: "maintenance.test",
        status: "running",
        input: {},
        output: null,
        error: null,
        attempts,
        run_after: old,
        idempotency_key: key,
        updated_at: old,
      });
    const retry = await task(1, "t1");
    const dead = await task(5, "t2");
    const job = await store.insert("extraction_jobs", {
      organization_id: u.orgId,
      user_id: u.userId,
      upload_ids: [],
      status: "processing",
      step: "analyzing",
      provider: null,
      error: null,
      warnings: [],
      context_notes: null,
      attempts: 3,
      updated_at: old,
      completed_at: null,
    });
    await tick(store, mailer, new Date());
    expect((await store.get("agent_tasks", retry.id))!.status).toBe("pending");
    expect((await store.get("agent_tasks", dead.id))!.status).toBe("failed");
    expect((await store.get("extraction_jobs", job.id))!.status).toBe("failed");
  });
});
