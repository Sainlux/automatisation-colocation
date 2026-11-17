import { describe, expect, it } from "vitest";
import { FakeMailer, joinOrg, makeUser, memoryStore, NOW } from "./helpers";
import { createEvent, cancelEvent, listCalendar, updateEvent, withdrawFromEvent } from "@/lib/agents/calendar-agent";
import { inviteToEvent, respondToInvitation, listInvitations } from "@/lib/agents/invitation-agent";
import { listConflicts, resolveConflict } from "@/lib/agents/conflict-resolution";
import { createGroup, addGroupMember, listGroups } from "@/lib/agents/group-agent";
import { commitDrafts, checkDraftConflicts } from "@/lib/agents/orchestrator";
import { notify, processPendingDeliveries } from "@/lib/agents/notification-agent";
import { processDueReminders } from "@/lib/agents/reminder-agent";
import { loadViewableEvent } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";

const base = { timezone: "Europe/Zurich" };

async function setup() {
  const store = memoryStore();
  const mailer = new FakeMailer();
  const leader = await makeUser(store, "Mathieu", mailer);
  const memberSelf = await makeUser(store, "Daniel", mailer);
  const member = await joinOrg(leader, memberSelf, "member");
  const group = await createGroup(leader, { name: "Cellule Annemasse", color: "#1d4ed8" });
  await addGroupMember(leader, group.id, member.userId);
  return { store, mailer, leader, member, group };
}

describe("CalendarAgent & conflits", () => {
  it("détecte un chevauchement partiel de 60 minutes", async () => {
    const { member } = await setup();
    const a = await createEvent(member, { ...base, title: "Formation des leaders", date: "2027-01-20", startTime: "20:30", endTime: "22:00" });
    const b = await createEvent(member, { ...base, title: "Réunion de cellule", date: "2027-01-20", startTime: "21:00", endTime: "22:30" });
    const conflicts = await listConflicts(member);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapMinutes).toBe(60);
    expect(conflicts[0].kind).toBe("partial");
    expect([conflicts[0].a!.id, conflicts[0].b!.id].sort()).toEqual([a.id, b.id].sort());
  });

  it("ne signale pas deux événements consécutifs", async () => {
    const { member } = await setup();
    await createEvent(member, { ...base, title: "A", date: "2027-01-20", startTime: "19:30", endTime: "20:30" });
    await createEvent(member, { ...base, title: "B", date: "2027-01-20", startTime: "20:30", endTime: "22:00" });
    expect(await listConflicts(member)).toHaveLength(0);
  });

  it("signale un temps de déplacement insuffisant si configuré", async () => {
    const { member, store } = await setup();
    await store.update("profiles", member.userId, { travel_buffer_minutes: 30 });
    await createEvent(member, { ...base, title: "A", date: "2027-01-20", startTime: "19:30", endTime: "20:30" });
    await createEvent(member, { ...base, title: "B", date: "2027-01-20", startTime: "20:40", endTime: "22:00" });
    const c = await listConflicts(member);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("travel_buffer");
  });

  it("n'oppose pas les événements de deux personnes différentes", async () => {
    const { member, leader } = await setup();
    await createEvent(member, { ...base, title: "A", date: "2027-01-20", startTime: "20:00", endTime: "21:00" });
    await createEvent(leader, { ...base, title: "B", date: "2027-01-20", startTime: "20:00", endTime: "21:00" });
    expect(await listConflicts(member)).toHaveLength(0);
    expect(await listConflicts(leader)).toHaveLength(0);
  });

  it("détecte un conflit avec une occurrence d'événement récurrent (après changement d'heure)", async () => {
    const { member } = await setup();
    await createEvent(member, { ...base, title: "Cellule hebdo", date: "2027-03-01", startTime: "20:00", endTime: "21:30", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;COUNT=8" });
    // 29 mars 2027 : après le passage à l'heure d'été (28 mars).
    await createEvent(member, { ...base, title: "Formation", date: "2027-03-29", startTime: "21:00", endTime: "22:00" });
    const c = await listConflicts(member);
    expect(c).toHaveLength(1);
    expect(c[0].overlapMinutes).toBe(30);
    expect(c[0].a!.start.startsWith("2027-03-29T18:00") || c[0].b!.start.startsWith("2027-03-29T18:00")).toBe(true);
  });

  it("le désistement personnel ne supprime pas l'événement collectif", async () => {
    const { leader, member, group, mailer, store } = await setup();
    const cellule = await createEvent(leader, { ...base, title: "Réunion de cellule", date: "2027-01-20", startTime: "21:00", endTime: "22:30", groupId: group.id, inviteGroup: true });
    const inv = (await listInvitations(member)).received[0];
    await respondToInvitation(member, inv.id, "accepted");
    await createEvent(member, { ...base, title: "Formation des leaders (privé)", date: "2027-01-20", startTime: "20:30", endTime: "22:00" });
    const [conflict] = await listConflicts(member);
    expect(conflict).toBeDefined();
    const keepFormation = conflict.a!.id === cellule.id ? "keep_b" : "keep_a";
    const res = await resolveConflict(member, conflict.id, { action: keepFormation, notifyOrganizer: true, message: null });
    expect(res.outcome.withdrawnEventId).toBe(cellule.id);

    const after = await store.get("events", cellule.id);
    expect(after!.status).toBe("confirmed"); // maintenu pour les autres
    const parts = await store.select("event_participants", { where: [["event_id", "eq", cellule.id]] });
    expect(parts.find((p) => p.user_id === member.userId)!.status).toBe("withdrawn");
    expect(parts.find((p) => p.user_id === leader.userId)!.status).toBe("accepted");

    // Notification au responsable, sans divulguer l'autre événement.
    const notes = await store.select("notifications", { where: [["user_id", "eq", leader.userId], ["type", "eq", "participant_withdrawn"]] });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("Réunion de cellule");
    expect(notes[0].body).not.toContain("Formation");
    expect(mailer.sent.some((m) => m.text.includes("ne pourrai pas participer"))).toBe(true);

    // Le calendrier du responsable contient toujours la réunion ; plus celui du membre.
    const range = ["2027-01-19T00:00:00Z", "2027-01-22T00:00:00Z"] as const;
    expect((await listCalendar(leader, ...range)).map((i) => i.eventId)).toContain(cellule.id);
    expect((await listCalendar(member, ...range)).map((i) => i.eventId)).not.toContain(cellule.id);
    expect(await listConflicts(member)).toHaveLength(0);
  });

  it("refuse l'annulation collective à un simple participant", async () => {
    const { leader, member, group } = await setup();
    const e = await createEvent(leader, { ...base, title: "Réunion", date: "2027-01-20", startTime: "21:00", endTime: "22:00", groupId: group.id, inviteGroup: true });
    await expect(cancelEvent(member, e.id, { confirm: true })).rejects.toMatchObject({ status: 403 });
    await expect(updateEvent(member, e.id, { startTime: "20:00", notifyParticipants: true })).rejects.toMatchObject({ status: 403 });
  });

  it("annulation autorisée : confirmation exigée, participants notifiés, rappels supprimés", async () => {
    const { leader, member, group, store } = await setup();
    const e = await createEvent(leader, { ...base, title: "Réunion", date: "2027-01-20", startTime: "21:00", endTime: "22:00", groupId: group.id, inviteGroup: true });
    await expect(cancelEvent(leader, e.id, { confirm: false })).rejects.toBeInstanceOf(AppError);
    const r = await cancelEvent(leader, e.id, { confirm: true, message: "Malade" });
    expect(r.event.status).toBe("cancelled");
    expect(r.notified).toBe(1);
    const notes = await store.select("notifications", { where: [["user_id", "eq", member.userId], ["type", "eq", "event_cancelled"]] });
    expect(notes[0].body).toContain("Malade");
    const remaining = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"]] });
    expect(remaining).toHaveLength(0);
  });

  it("déplacement : rappels reprogrammés et participants notifiés", async () => {
    const { leader, member, group, store } = await setup();
    const e = await createEvent(leader, { ...base, title: "Réunion", date: "2027-01-20", startTime: "21:00", endTime: "22:00", groupId: group.id, inviteGroup: true });
    await updateEvent(leader, e.id, { startTime: "19:00", endTime: "20:00", notifyParticipants: true });
    const scheduled = await store.select("reminders", { where: [["event_id", "eq", e.id], ["status", "eq", "scheduled"]] });
    expect(scheduled.every((r) => r.occurrence_start === "2027-01-20T18:00:00.000Z")).toBe(true);
    expect(scheduled.length).toBe(6); // 3 rappels x 2 participants
    const notes = await store.select("notifications", { where: [["user_id", "eq", member.userId], ["type", "eq", "event_rescheduled"]] });
    expect(notes).toHaveLength(1);
  });

  it("isole les organisations (accès refusé à un événement d'une autre organisation)", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const alice = await makeUser(store, "Alice", mailer);
    const bob = await makeUser(store, "Bob", mailer);
    const e = await createEvent(alice, { ...base, title: "Privé", date: "2027-01-20", startTime: "21:00", endTime: "22:00" });
    await expect(loadViewableEvent(bob, e.id)).rejects.toMatchObject({ status: 404 });
    await expect(cancelEvent(bob, e.id, { confirm: true })).rejects.toMatchObject({ status: 404 });
    // Même en forçant l'identifiant d'organisation, bob n'est pas membre : aucun groupe visible.
    expect(await listGroups({ ...bob, orgId: alice.orgId, orgRole: "guest" })).toHaveLength(0);
  });

  it("un membre simple ne peut pas créer de groupe ni inviter un groupe", async () => {
    const { member, group } = await setup();
    await expect(createGroup(member, { name: "Nouveau", color: "#000000" })).rejects.toMatchObject({ status: 403 });
    const e = await createEvent(member, { ...base, title: "X", date: "2027-01-20", startTime: "10:00", endTime: "11:00", groupId: group.id });
    await expect(inviteToEvent(member, e.id, { groupId: group.id })).rejects.toMatchObject({ status: 403 });
  });
});

describe("Orchestrateur — validation et création en lot", () => {
  const drafts = [16, 14].map((day, i) => ({
    key: `k${i}`,
    title: "Formation Cellules « Zoom »",
    date: i === 0 ? "2026-11-16" : "2026-12-14",
    startTime: "20:30",
    endTime: "22:00",
    timezone: "Europe/Zurich",
    location: null,
    meetingUrl: null,
    description: null,
    groupId: null,
    recurrenceRule: null,
    confidence: 0.8,
    sourceExcerpt: `${day}`,
    issues: [{ field: "date", severity: "warning" as const, message: "Année absente" }],
    yearSuggestion: { year: 2026, reason: "x" },
    confirmed: false,
  }));

  it("refuse les brouillons non confirmés", async () => {
    const { member } = await setup();
    await expect(commitDrafts(member, { drafts, decisions: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("vérifie les conflits avant création puis applique les décisions", async () => {
    const { member, store } = await setup();
    const existing = await createEvent(member, { ...base, title: "Réunion de cellule", date: "2026-11-16", startTime: "21:00", endTime: "22:30" });
    const { conflicts } = await checkDraftConflicts(member, drafts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].draftKey).toBe("k0");
    expect(conflicts[0].existing!.id).toBe(existing.id);

    const confirmed = drafts.map((d) => ({ ...d, confirmed: true }));
    const summary = await commitDrafts(member, {
      drafts: confirmed,
      decisions: [{ key: "k0", action: "create", withdrawFrom: [existing.id], notifyOrganizers: false }],
    });
    expect(summary.created).toHaveLength(2);
    expect(summary.withdrawn).toHaveLength(1);
    expect(summary.conflictsRecorded).toBe(0);
    expect((await store.get("events", existing.id))!.status).toBe("cancelled"); // événement purement personnel
  });

  it("skip : n'enregistre pas le brouillon écarté", async () => {
    const { member } = await setup();
    const confirmed = drafts.map((d) => ({ ...d, confirmed: true }));
    const s = await commitDrafts(member, { drafts: confirmed, decisions: [{ key: "k1", action: "skip" }] });
    expect(s.created).toHaveLength(1);
    expect(s.skipped).toEqual(["k1"]);
  });
});

describe("NotificationAgent & ReminderAgent", () => {
  it("ne crée pas de doublon pour une même clé", async () => {
    const { member, mailer, store } = await setup();
    const input = { userId: member.userId, orgId: member.orgId, type: "system" as const, title: "T", body: "B", dedupeKey: "k1", email: true };
    const a = await notify(store, input, mailer, NOW);
    const b = await notify(store, input, mailer, NOW);
    expect(b.duplicate).toBe(true);
    expect(b.notification.id).toBe(a.notification.id);
    expect(mailer.sent).toHaveLength(1);
  });

  it("échec d'envoi : nouvelle tentative avec délai, puis succès", async () => {
    const { member, mailer, store } = await setup();
    mailer.failNext = 1;
    const r = await notify(store, { userId: member.userId, orgId: member.orgId, type: "system", title: "T", body: "B", dedupeKey: "k2", email: true }, mailer, NOW);
    const email = r.deliveries.find((d) => d.channel === "email")!;
    expect(email.status).toBe("pending");
    expect(email.attempts).toBe(1);
    expect(await processPendingDeliveries(store, mailer, NOW)).toHaveLength(0); // pas encore l'heure
    const later = new Date(NOW.getTime() + 3 * 60000);
    const [retried] = await processPendingDeliveries(store, mailer, later);
    expect(retried.status).toBe("sent");
  });

  it("échec définitif après 5 tentatives", async () => {
    const { member, mailer, store } = await setup();
    mailer.failNext = 10;
    await notify(store, { userId: member.userId, orgId: member.orgId, type: "system", title: "T", body: "B", dedupeKey: "k3", email: true }, mailer, NOW);
    let t = NOW.getTime();
    for (let i = 0; i < 6; i++) {
      t += 3600000;
      await processPendingDeliveries(store, mailer, new Date(t));
    }
    const [d] = await store.select("notification_deliveries", { where: [["channel", "eq", "email"]] });
    expect(d.status).toBe("failed");
    expect(d.attempts).toBe(5);
  });

  it("canal e-mail non configuré : état « skipped » explicite", async () => {
    const { member, store } = await setup();
    const off = new FakeMailer(false);
    const r = await notify(store, { userId: member.userId, orgId: member.orgId, type: "system", title: "T", body: "B", dedupeKey: "k4", email: true }, off, NOW);
    const email = r.deliveries.find((d) => d.channel === "email")!;
    expect(email.status).toBe("skipped");
    expect(email.last_error).toMatch(/non configuré/);
  });

  it("envoie les rappels une seule fois, pas pour un participant désisté", async () => {
    const { member, mailer, store, leader, group } = await setup();
    const e = await createEvent(leader, { ...base, title: "Réunion", date: "2026-11-12", startTime: "20:00", endTime: "21:00", groupId: group.id, inviteGroup: true });
    await withdrawFromEvent(member, e.id, { notifyOrganizer: false });
    const at = new Date("2026-11-12T18:45:00Z"); // après le rappel de 30 min (18:30 UTC)
    const sent = await processDueReminders(store, mailer, at);
    expect(sent).toBe(1); // le rappel du membre est annulé ; seul le dernier rappel dû de l'organisateur part
    expect(await processDueReminders(store, mailer, at)).toBe(0);
    const reminders = await store.select("notifications", { where: [["type", "eq", "reminder"]] });
    expect(reminders.every((n) => n.user_id === leader.userId)).toBe(true);
  });
});
