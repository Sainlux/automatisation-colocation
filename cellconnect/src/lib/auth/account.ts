import type { Store } from "@/lib/db/store";
import { audit } from "@/lib/audit";
import { DEFAULT_REMINDER_OFFSETS } from "@/lib/agents/reminder-agent";
import type { Profile } from "@/lib/types";

/** Création du profil et de l'organisation personnelle au premier accès. */
export async function bootstrapAccount(store: Store, user: { id: string; email: string; name: string; organizationName?: string | null; timezone?: string }) {
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
  const orgName = user.organizationName?.trim() || `Espace de ${profile.display_name}`;
  const slugBase = orgName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const org = await store.insert("organizations", {
    name: orgName.slice(0, 120),
    slug: `${slugBase || "org"}-${user.id.slice(0, 8)}`,
    created_by: user.id,
  });
  await store.insert("organization_members", { organization_id: org.id, user_id: user.id, role: "org_admin" });
  await audit(store, { orgId: org.id, actorId: user.id, action: "account.created", entityType: "profile", entityId: user.id });
  return profile;
}

/** Suppression des données personnelles (droit à l'effacement). */
export async function deleteAccountData(store: Store, userId: string) {
  const memberships = await store.select("organization_members", { where: [["user_id", "eq", userId]] });
  // Événements dont l'utilisateur est seul membre de l'organisation personnelle : supprimés.
  for (const m of memberships) {
    const members = await store.select("organization_members", { where: [["organization_id", "eq", m.organization_id]] });
    if (members.length === 1) {
      for (const t of ["events", "groups", "group_members", "uploads", "extraction_jobs", "extracted_events", "invitations", "calendar_conflicts", "reminders", "event_participants", "event_changes"] as const) {
        await store.deleteWhere(t, [["organization_id", "eq", m.organization_id]] as never);
      }
      await store.deleteWhere("audit_logs", [["organization_id", "eq", m.organization_id]]);
      await store.delete("organization_members", m.id);
      await store.delete("organizations", m.organization_id);
    }
  }
  // Données personnelles restantes dans les organisations partagées.
  for (const t of ["event_participants", "group_members", "organization_members", "reminders", "calendar_conflicts", "notifications", "notification_deliveries", "calendar_connections", "uploads", "extraction_jobs", "extracted_events", "idempotency_keys", "push_subscriptions", "messaging_links"] as const) {
    await store.deleteWhere(t, [["user_id", "eq", userId]] as never);
  }
  await store.delete("profiles", userId);
}

/** Export des données personnelles (portabilité). */
export async function exportAccountData(store: Store, userId: string) {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), profile: await store.get("profiles", userId) };
  for (const t of ["organization_members", "group_members", "event_participants", "reminders", "notifications", "calendar_conflicts", "conflict_resolutions", "extraction_jobs", "uploads"] as const) {
    out[t] = await store.select(t, { where: [["user_id", "eq", userId]] as never });
  }
  out.events_created = await store.select("events", { where: [["created_by", "eq", userId]] });
  out.calendar_connections = (await store.select("calendar_connections", { where: [["user_id", "eq", userId]] })).map((c) => ({
    ...c,
    access_token_enc: c.access_token_enc ? "[chiffré — non exporté]" : null,
    refresh_token_enc: c.refresh_token_enc ? "[chiffré — non exporté]" : null,
  }));
  return out;
}
