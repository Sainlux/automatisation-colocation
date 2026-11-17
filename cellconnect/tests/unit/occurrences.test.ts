import { describe, expect, it } from "vitest";
import { FakeMailer, joinOrg, makeUser, memoryStore } from "./helpers";
import { createEvent, listCalendar, modifyOccurrence } from "@/lib/agents/calendar-agent";
import { createGroup, addGroupMember } from "@/lib/agents/group-agent";
import { listConflicts } from "@/lib/agents/conflict-resolution";
import { withExceptions } from "@/lib/agents/conflict-agent";
import { eventsToIcs } from "@/lib/ics";

const tz = "Europe/Zurich";
const RANGE = ["2027-01-01T00:00:00Z", "2027-02-28T00:00:00Z"] as const;

async function setup() {
  const store = memoryStore();
  const mailer = new FakeMailer();
  const leader = await makeUser(store, "Mathieu", mailer);
  const member = await joinOrg(leader, await makeUser(store, "Daniel", mailer));
  const group = await createGroup(leader, { name: "Cellule", color: "#1d4ed8" });
  await addGroupMember(leader, group.id, member.userId);
  // Cellule tous les mercredis à 20h, 6 séances à partir du 6 janvier 2027.
  const series = await createEvent(leader, { title: "Cellule", date: "2027-01-06", startTime: "20:00", endTime: "21:30", timezone: tz, recurrenceRule: "FREQ=WEEKLY;COUNT=6", groupId: group.id, inviteGroup: true });
  return { store, leader, member, series };
}

describe("Exceptions de récurrence", () => {
  it("annuler une seule date : les autres restent, participants informés", async () => {
    const { leader, member, series, store } = await setup();
    const before = await listCalendar(leader, ...RANGE);
    expect(before).toHaveLength(6);
    const target = before[2]; // 20 janvier
    expect(target.occurrenceStart).toBe("2027-01-20T19:00:00.000Z");
    const r = await modifyOccurrence(leader, series.id, { occurrenceStart: target.occurrenceStart, action: "cancel", message: "Vacances" });
    expect(r.notified).toBe(1);
    const after = await listCalendar(leader, ...RANGE);
    expect(after).toHaveLength(5);
    expect(after.some((i) => i.start === target.start)).toBe(false);
    const n = await store.select("notifications", { where: [["user_id", "eq", member.userId], ["type", "eq", "event_cancelled"]] });
    expect(n[0].body).toContain("Les autres dates sont maintenues");
    expect((await store.get("events", series.id))!.status).toBe("confirmed");
  });

  it("déplacer une date : nouvel horaire, conflits recalculés, rappels reprogrammés", async () => {
    const { leader, member, series, store } = await setup();
    // Le membre a une formation le jeudi 21 janvier à 20h.
    await createEvent(member, { title: "Formation", date: "2027-01-21", startTime: "20:00", endTime: "21:00", timezone: tz });
    expect(await listConflicts(member)).toHaveLength(0);
    await modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "move", date: "2027-01-21", startTime: "20:30", endTime: "22:00" });
    const items = await listCalendar(member, ...RANGE);
    const moved = items.find((i) => i.eventId === series.id && i.moved)!;
    expect(moved.start).toBe("2027-01-21T19:30:00.000Z");
    expect(moved.occurrenceStart).toBe("2027-01-20T19:00:00.000Z");
    const c = await listConflicts(member);
    expect(c).toHaveLength(1);
    expect(c[0].overlapMinutes).toBe(30);
    const rem = await store.select("reminders", { where: [["event_id", "eq", series.id], ["user_id", "eq", member.userId], ["status", "eq", "scheduled"]] });
    expect(rem.some((r) => r.occurrence_start === "2027-01-21T19:30:00.000Z")).toBe(true);
    expect(rem.some((r) => r.occurrence_start === "2027-01-20T19:00:00.000Z")).toBe(false);
  });

  it("rétablir l'horaire d'origine", async () => {
    const { leader, series } = await setup();
    await modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "cancel" });
    await modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "restore" });
    expect(await listCalendar(leader, ...RANGE)).toHaveLength(6);
  });

  it("refusé à un simple participant et pour une date hors série", async () => {
    const { leader, member, series } = await setup();
    await expect(modifyOccurrence(member, series.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "cancel" })).rejects.toMatchObject({ status: 403 });
    await expect(modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-21T19:00:00.000Z", action: "cancel" })).rejects.toMatchObject({ status: 400 });
  });

  it("export iCalendar : EXDATE et RECURRENCE-ID", async () => {
    const { leader, series, store } = await setup();
    await modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-13T19:00:00.000Z", action: "cancel" });
    await modifyOccurrence(leader, series.id, { occurrenceStart: "2027-01-20T19:00:00.000Z", action: "move", date: "2027-01-21", startTime: "20:00", endTime: "21:30" });
    const ics = eventsToIcs(await withExceptions(store, [(await store.get("events", series.id))!]), "https://x");
    expect(ics).toContain("EXDATE;TZID=Europe/Zurich:20270113T200000");
    expect(ics).toContain("RECURRENCE-ID;TZID=Europe/Zurich:20270120T200000");
    expect(ics).toContain("DTSTART;TZID=Europe/Zurich:20270121T200000");
  });
});
