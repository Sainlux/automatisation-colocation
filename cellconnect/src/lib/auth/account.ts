import { CALENDAR_SYNC_TABLE, ORG_SCOPED_TABLES, USER_SCOPED_TABLES, type Store } from "@/lib/db/store";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { DEFAULT_REMINDER_OFFSETS } from "@/lib/agents/reminder-agent";
import { hasOrgRole } from "@/lib/auth/permissions";
import type { Profile } from "@/lib/types";

export const DEFAULT_ORGANIZATION_NAME = "Mon église";

/** Crée l'organisation personnelle d'un utilisateur (il en est administrateur). */
export async function createPersonalOrganization(store: Store, userId: string, name?: string | null) {
  const orgName = (name?.trim() || DEFAULT_ORGANIZATION_NAME).slice(0, 120);
  const slugBase = orgName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const org = await store.insert("organizations", {
    name: orgName,
    slug: `${slugBase || "org"}-${userId.slice(0, 8)}`,
    created_by: userId,
  });
  await store.insert("organization_members", { organization_id: org.id, user_id: userId, role: "org_admin" });
  return org;
}

/**
 * Création du profil au premier accès, et de l'organisation personnelle.
 * Avec `invited`, la personne arrive par un lien d'invitation : elle rejoindra
 * l'organisation qui l'invite, on ne lui crée donc pas d'espace personnel.
 */
export async function bootstrapAccount(
  store: Store,
  user: { id: string; email: string; name: string; organizationName?: string | null; timezone?: string },
  options: { invited?: boolean } = {},
) {
  const existing = await store.get("profiles", user.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const profile = await store.insert("profiles", {
    id: user.id,
    email: user.email.toLowerCase(),
    display_name: user.name.trim().slice(0, 120) || user.email.split("@")[0],
    timezone: user.timezone ?? "Europe/Zurich",
    locale: "fr",
    reminder_offsets: DEFAULT_REMINDER_OFFSETS,
    travel_buffer_minutes: 0,
    notify_email: true,
    delete_captures_after_analysis: true,
    theme: "system",
    updated_at: now,
  } satisfies Omit<Profile, "created_at"> as never);
  if (options.invited) {
    await audit(store, { orgId: null, actorId: user.id, action: "account.created", entityType: "profile", entityId: user.id, metadata: { invited: true } });
    return profile;
  }
  const org = await createPersonalOrganization(store, user.id, user.organizationName);
  await audit(store, { orgId: org.id, actorId: user.id, action: "account.created", entityType: "profile", entityId: user.id });
  return profile;
}

/**
 * Suppression des données personnelles (droit à l'effacement, nLPD / RGPD).
 *
 * - Refusée si l'utilisateur est le seul administrateur d'une organisation qui
 *   compte d'autres membres (l'église ne doit pas rester sans responsable).
 * - Les organisations dont il est l'unique membre sont entièrement effacées.
 * - Dans les organisations partagées, ses lignes personnelles sont effacées ;
 *   les événements collectifs qu'il a créés restent (ils appartiennent au groupe).
 *
 * Renvoie les identifiants des organisations effacées (pour supprimer leurs fichiers).
 */
export async function deleteAccountData(store: Store, userId: string): Promise<{ deletedOrganizations: string[] }> {
  const memberships = await store.select("organization_members", { where: [["user_id", "eq", userId]] });
  const solo: string[] = [];
  for (const m of memberships) {
    const members = await store.select("organization_members", { where: [["organization_id", "eq", m.organization_id]], order: [{ column: "created_at" }] });
    if (members.length === 1) {
      solo.push(m.organization_id);
      continue;
    }
    const others = members.filter((x) => x.user_id !== userId);
    const otherAdmins = others.filter((x) => hasOrgRole(x.role, "org_admin"));
    if (hasOrgRole(m.role, "org_admin") && otherAdmins.length === 0) {
      throw badRequest("Désignez d'abord un autre administrateur de l'église.");
    }
  }

  for (const orgId of solo) {
    const eventIds = (await store.select("events", { where: [["organization_id", "eq", orgId]] })).map((e) => e.id);
    if (eventIds.length) await store.deleteWhere(CALENDAR_SYNC_TABLE, [["event_id", "in", eventIds]]);
    for (const t of ORG_SCOPED_TABLES) await store.deleteWhere(t, [["organization_id", "eq", orgId]]);
    await store.deleteWhere("organization_members", [["organization_id", "eq", orgId]]);
    await store.delete("organizations", orgId);
  }

  // Ce qu'il a créé pour le collectif (rencontres, groupes, l'église elle-même),
  // y compris dans une église qu'il a déjà quittée, est transmis à un
  // administrateur restant (sinon la clé étrangère created_by empêcherait
  // l'effacement du profil en Supabase) ; le reste est effacé.
  const heirOf = async (orgId: string) => {
    const members = (await store.select("organization_members", { where: [["organization_id", "eq", orgId]], order: [{ column: "created_at" }] })).filter((x) => x.user_id !== userId);
    return (members.find((x) => hasOrgRole(x.role, "org_admin")) ?? members[0])?.user_id ?? null;
  };
  const leftovers = new Set<string>([
    ...(await store.select("events", { where: [["created_by", "eq", userId]] })).map((e) => e.organization_id),
    ...(await store.select("groups", { where: [["created_by", "eq", userId]] })).map((g) => g.organization_id),
    ...(await store.select("organizations", { where: [["created_by", "eq", userId]] })).map((o) => o.id),
  ]);
  for (const orgId of leftovers) {
    const heir = await heirOf(orgId);
    if (!heir) continue;
    await store.updateWhere("events", [["organization_id", "eq", orgId], ["created_by", "eq", userId]], { created_by: heir });
    await store.updateWhere("groups", [["organization_id", "eq", orgId], ["created_by", "eq", userId]], { created_by: heir });
    await store.updateWhere("organizations", [["id", "eq", orgId], ["created_by", "eq", userId]], { created_by: heir });
  }
  const connectionIds = (await store.select("calendar_connections", { where: [["user_id", "eq", userId]] })).map((c) => c.id);
  if (connectionIds.length) await store.deleteWhere(CALENDAR_SYNC_TABLE, [["connection_id", "in", connectionIds]]);
  await store.deleteWhere("invitations", [["invitee_user_id", "eq", userId]]);
  await store.deleteWhere("invitations", [["invited_by", "eq", userId]]);
  await store.deleteWhere("event_changes", [["changed_by", "eq", userId]]);
  for (const t of USER_SCOPED_TABLES) await store.deleteWhere(t, [["user_id", "eq", userId]]);
  await store.delete("profiles", userId);
  return { deletedOrganizations: solo };
}

/** Tables exclues de l'export : purement techniques ou traitées à part (secrets masqués). */
const EXPORT_SPECIAL = new Set<string>(["calendar_connections", "push_subscriptions", "idempotency_keys"]);

/** Export des données personnelles (portabilité). */
export async function exportAccountData(store: Store, userId: string) {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), profile: await store.get("profiles", userId) };
  for (const t of USER_SCOPED_TABLES) {
    if (EXPORT_SPECIAL.has(t)) continue;
    out[t] = await store.select(t, { where: [["user_id", "eq", userId]] });
  }
  out.events_created = await store.select("events", { where: [["created_by", "eq", userId]] });
  out.calendar_connections = (await store.select("calendar_connections", { where: [["user_id", "eq", userId]] })).map((c) => ({
    ...c,
    access_token_enc: c.access_token_enc ? "[chiffré — non exporté]" : null,
    refresh_token_enc: c.refresh_token_enc ? "[chiffré — non exporté]" : null,
  }));
  out.push_subscriptions = (await store.select("push_subscriptions", { where: [["user_id", "eq", userId]] })).map((p) => ({
    id: p.id,
    user_agent: p.user_agent,
    disabled_at: p.disabled_at,
    created_at: p.created_at,
  }));
  return out;
}
