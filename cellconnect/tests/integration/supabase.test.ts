/**
 * Tests d'intégration contre un VRAI Supabase (Auth, PostgreSQL/PostgREST, Storage)
 * et un vrai serveur SMTP (Mailpit fourni par `supabase start`).
 *
 *   npx supabase start
 *   SUPABASE_IT=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SMTP_HOST=... SMTP_PORT=... MAILPIT_URL=http://127.0.0.1:54324 npm run test:supabase
 *
 * Ignorés si SUPABASE_IT n'est pas défini.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStore } from "@/lib/db/supabase-store";
import { bootstrapAccount } from "@/lib/auth/account";
import { smtpSender } from "@/lib/channels/email";
import type { Ctx } from "@/lib/context";
import { createEvent, cancelEvent, withdrawFromEvent, listCalendar } from "@/lib/agents/calendar-agent";
import { createGroup, addGroupMember } from "@/lib/agents/group-agent";
import { listInvitations, respondToInvitation } from "@/lib/agents/invitation-agent";
import { listConflicts, resolveConflict } from "@/lib/agents/conflict-resolution";
import { putObject, getObject, deleteObject } from "@/lib/storage";
import { processPendingDeliveries } from "@/lib/agents/notification-agent";

const RUN = Boolean(process.env.SUPABASE_IT);
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const tz = "Europe/Zurich";
const run = Date.now().toString(36);

let admin: SupabaseClient;
let store: SupabaseStore;

async function user(name: string): Promise<Ctx & { password: string }> {
  const email = `${name.toLowerCase()}-${run}@exemple.ch`;
  const password = "motdepasse-solide";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error;
  await bootstrapAccount(store, { id: data.user.id, email, name });
  const [m] = await store.select("organization_members", { where: [["user_id", "eq", data.user.id]] });
  return { store, userId: data.user.id, email, orgId: m.organization_id, orgRole: m.role, timezone: tz, now: () => new Date(), mailer: smtpSender, password };
}

async function mails(to: string) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const d = (await r.json()) as { messages: { Subject: string; ID: string }[] };
  return d.messages ?? [];
}

describe.skipIf(!RUN)("Supabase réel", () => {
  let leader: Awaited<ReturnType<typeof user>>;
  let member: Awaited<ReturnType<typeof user>>;
  let outsider: Awaited<ReturnType<typeof user>>;

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    store = new SupabaseStore(admin);
    leader = await user("Mathieu");
    const m = await user("Daniel");
    await store.insert("organization_members", { organization_id: leader.orgId, user_id: m.userId, role: "member" });
    member = { ...m, orgId: leader.orgId, orgRole: "member" };
    outsider = await user("Externe");
  });

  it("invitation, conflit, désistement : l'événement collectif est maintenu et l'organisateur reçoit un vrai e-mail", async () => {
    const group = await createGroup(leader, { name: `Cellule ${run}`, color: "#1d4ed8" });
    await addGroupMember(leader, group.id, member.userId);
    const cellule = await createEvent(leader, { title: "Réunion de cellule", date: "2027-01-20", startTime: "21:00", endTime: "22:30", timezone: tz, groupId: group.id, inviteGroup: true });
    const inv = (await listInvitations(member)).received.find((i) => i.event?.id === cellule.id)!;
    await respondToInvitation(member, inv.id, "accepted");
    await createEvent(member, { title: "Formation (privé)", date: "2027-01-20", startTime: "20:30", endTime: "22:00", timezone: tz });

    const [c] = await listConflicts(member);
    expect(c.overlapMinutes).toBe(60);
    await resolveConflict(member, c.id, { action: c.a!.id === cellule.id ? "keep_b" : "keep_a", notifyOrganizer: true, message: null });

    expect((await store.get("events", cellule.id))!.status).toBe("confirmed");
    const parts = await store.select("event_participants", { where: [["event_id", "eq", cellule.id]] });
    expect(parts.find((p) => p.user_id === member.userId)!.status).toBe("withdrawn");

    await processPendingDeliveries(store, smtpSender);
    const received = await mails(leader.email);
    expect(received.some((m) => m.Subject.includes("ne pourra pas participer"))).toBe(true);
    expect(received.some((m) => m.Subject.includes("Réponse à l'invitation"))).toBe(false); // réponse = notification interne seulement
  });

  it("annulation collective : e-mail réel aux participants, refus pour un participant", async () => {
    const group = await createGroup(leader, { name: `Formation ${run}`, color: "#16a34a" });
    await addGroupMember(leader, group.id, member.userId);
    const e = await createEvent(leader, { title: "Soirée louange", date: "2027-02-03", startTime: "19:30", endTime: "21:00", timezone: tz, groupId: group.id, inviteGroup: true });
    await expect(cancelEvent(member, e.id, { confirm: true })).rejects.toMatchObject({ status: 403 });
    await cancelEvent(leader, e.id, { confirm: true, message: "Salle indisponible" });
    const received = await mails(member.email);
    expect(received.some((m) => m.Subject.includes("Annulé : Soirée louange"))).toBe(true);
    expect(received.some((m) => m.Subject.includes("Invitation : Soirée louange"))).toBe(true);
  });

  it("RLS avec de vrais jetons : chacun ne voit que son organisation ; écriture interdite ailleurs", async () => {
    const own = await createEvent(outsider, { title: "Privé externe", date: "2027-03-01", startTime: "10:00", endTime: "11:00", timezone: tz });
    const asUser = async (u: { email: string; password: string }) => {
      const c = createClient(URL, ANON, { auth: { persistSession: false } });
      const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw error;
      return c;
    };
    const ext = await asUser(outsider);
    const mine = await ext.from("events").select("id,title");
    expect(mine.data!.map((r) => r.id)).toEqual([own.id]);
    const leaderClient = await asUser(leader);
    const seen = await leaderClient.from("events").select("id").eq("id", own.id);
    expect(seen.data).toEqual([]);
    const upd = await leaderClient.from("events").update({ title: "piraté" }).eq("id", own.id).select();
    expect(upd.data).toEqual([]);
    expect((await store.get("events", own.id))!.title).toBe("Privé externe");
    // Un participant ne peut pas annuler l'événement collectif en passant par l'API REST directe.
    const memberClient = await asUser(member);
    const memberEvents = await memberClient.from("events").select("id,created_by").neq("created_by", member.userId);
    for (const ev of memberEvents.data ?? []) {
      const r = await memberClient.from("events").update({ status: "cancelled" }).eq("id", ev.id).select();
      expect(r.data).toEqual([]);
    }
    // Les tokens OAuth ne sont jamais lisibles par un autre utilisateur ; notifications privées.
    const notes = await leaderClient.from("notifications").select("user_id");
    expect(new Set(notes.data!.map((n) => n.user_id))).toEqual(new Set([leader.userId]));
  });

  it("Storage privé : écriture, lecture serveur, aucun accès anonyme, suppression", async () => {
    process.env.DATA_BACKEND = "supabase";
    const path = `${leader.orgId}/${leader.userId}/it-${run}`;
    await putObject(path, Buffer.from("capture privée"), "text/plain");
    expect((await getObject(path)).toString()).toBe("capture privée");
    const anon = await fetch(`${URL}/storage/v1/object/public/captures/${path}`);
    expect(anon.ok).toBe(false);
    await deleteObject(path);
    await expect(getObject(path)).rejects.toThrow();
  });

  it("calendrier : les heures sont correctes après aller-retour PostgreSQL (timestamptz)", async () => {
    const items = await listCalendar(member, "2027-01-19T00:00:00Z", "2027-01-22T00:00:00Z");
    const formation = items.find((i) => i.title === "Formation (privé)")!;
    expect(formation.start).toBe("2027-01-20T19:30:00.000Z");
  });
});
