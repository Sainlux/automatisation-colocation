import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { FakeMailer, makeUser, memoryStore, NOW } from "./helpers";
import { createEvent, listCalendar } from "@/lib/agents/calendar-agent";
import { acceptInvitationToken, inviteByEmail, previewInvitation } from "@/lib/agents/invitation-agent";
import { bootstrapAccount } from "@/lib/auth/account";

const tz = "Europe/Zurich";
const linkOf = (text: string) => /\/invitation\/([A-Za-z0-9_-]+)/.exec(text)![1];

async function newcomer(store: ReturnType<typeof memoryStore>, mailer: FakeMailer, email: string) {
  const id = randomUUID();
  await bootstrapAccount(store, { id, email, name: "Nouvelle" });
  return { store, userId: id, email, mailer, now: () => NOW, timezone: tz };
}

describe("Invitations par e-mail (sans compte)", () => {
  it("lien envoyé, inscription, acceptation : rejoint l'organisation (invité) et l'événement", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const leader = await makeUser(store, "Mathieu", mailer);
    const e = await createEvent(leader, { title: "Formation", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });
    const [r] = await inviteByEmail(leader, { emails: ["Nouvelle@Exemple.ch"], eventId: e.id }, "https://app.test");
    expect(r.status).toBe("email_sent");
    expect(mailer.sent[0].to).toBe("nouvelle@exemple.ch");
    const token = linkOf(mailer.sent[0].text);

    // Le jeton n'est jamais stocké en clair.
    const [inv] = await store.select("invitations", { where: [["invitee_email", "eq", "nouvelle@exemple.ch"]] });
    expect(inv.token_hash).not.toContain(token);

    const preview = await previewInvitation(store, token, NOW);
    expect(preview).toMatchObject({ status: "pending", organization: expect.any(String), event: { title: "Formation" } });
    expect(preview.emailHint).toBe("n…@exemple.ch");

    const u = await newcomer(store, mailer, "nouvelle@exemple.ch");
    const res = await acceptInvitationToken(u, token, "accepted");
    expect(res.eventId).toBe(e.id);
    const [m] = await store.select("organization_members", { where: [["organization_id", "eq", leader.orgId], ["user_id", "eq", u.userId]] });
    expect(m.role).toBe("guest");
    const items = await listCalendar({ ...u, orgId: leader.orgId, orgRole: "guest" }, "2027-01-19T00:00:00Z", "2027-01-22T00:00:00Z");
    expect(items.map((i) => i.eventId)).toEqual([e.id]);
    const n = await store.select("notifications", { where: [["user_id", "eq", leader.userId], ["type", "eq", "invitation_response"]] });
    expect(n).toHaveLength(1);

    // Usage unique.
    await expect(acceptInvitationToken(u, token, "accepted")).rejects.toMatchObject({ status: 400 });
  });

  it("invitation à rejoindre l'organisation avec un rôle", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const admin = await makeUser(store, "Admin", mailer);
    await inviteByEmail(admin, { emails: ["resp@exemple.ch"], orgRole: "group_leader" }, "https://app.test");
    const u = await newcomer(store, mailer, "resp@exemple.ch");
    await acceptInvitationToken(u, linkOf(mailer.sent[0].text), "accepted");
    const [m] = await store.select("organization_members", { where: [["organization_id", "eq", admin.orgId], ["user_id", "eq", u.userId]] });
    expect(m.role).toBe("group_leader");
  });

  it("expiration, jeton invalide, SMTP absent (lien renvoyé à l'expéditeur), droits", async () => {
    const store = memoryStore();
    const off = new FakeMailer(false);
    const leader = await makeUser(store, "Mathieu", off);
    const e = await createEvent(leader, { title: "X", date: "2027-01-20", startTime: "20:00", endTime: "21:00", timezone: tz });
    const [r] = await inviteByEmail(leader, { emails: ["a@exemple.ch"], eventId: e.id }, "https://app.test");
    expect(r.status).toBe("email_skipped");
    expect(r.link).toMatch(/^https:\/\/app\.test\/invitation\//);
    const token = r.link!.split("/").pop()!;
    const later = new Date(NOW.getTime() + 31 * 86400000);
    expect((await previewInvitation(store, token, later)).status).toBe("expired");
    const u = await newcomer(store, off, "a@exemple.ch");
    await expect(acceptInvitationToken({ ...u, now: () => later }, token, "accepted")).rejects.toMatchObject({ status: 400 });
    await expect(previewInvitation(store, "x".repeat(40), NOW)).rejects.toMatchObject({ status: 404 });
    // Un membre simple ne peut pas inviter dans l'organisation.
    const other = await makeUser(store, "Autre", off);
    await expect(inviteByEmail({ ...other, orgId: leader.orgId, orgRole: "member" }, { emails: ["z@exemple.ch"] }, "https://app.test")).rejects.toMatchObject({ status: 403 });
  });

  it("refus : ne rejoint pas l'organisation", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const leader = await makeUser(store, "Mathieu", mailer);
    const e = await createEvent(leader, { title: "X", date: "2027-01-20", startTime: "20:00", endTime: "21:00", timezone: tz });
    await inviteByEmail(leader, { emails: ["n@exemple.ch"], eventId: e.id }, "https://app.test");
    const u = await newcomer(store, mailer, "n@exemple.ch");
    await acceptInvitationToken(u, linkOf(mailer.sent[0].text), "declined");
    expect(await store.select("organization_members", { where: [["organization_id", "eq", leader.orgId], ["user_id", "eq", u.userId]] })).toHaveLength(0);
  });
});
