-- =============================================================================
-- Durcissement RLS et minimisation des données personnelles (lot 2).
--
-- Toutes les écritures métier passent par le serveur (clé service_role, qui
-- contourne la RLS) après contrôle des permissions dans les agents. Les accès
-- DIRECTS avec la clé anonyme ou un jeton utilisateur sont donc réduits au
-- strict nécessaire : lecture de ses propres données, quelques réponses
-- personnelles (participation, départ d'un groupe, lecture des notifications).
-- Migration rejouable : drop policy if exists / create or replace.
-- =============================================================================

-- 1. Lecture des profils et des adhésions --------------------------------------
-- Un membre ne lit plus l'e-mail de tous les membres de son église : seulement
-- son propre profil ; les administrateurs voient les profils des membres de
-- l'organisation qu'ils administrent.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.organization_members b
    where b.user_id = profiles.id and public.is_org_admin(b.organization_id)
  )
);

drop policy if exists org_members_select on public.organization_members;
create policy org_members_select on public.organization_members for select using (
  user_id = auth.uid() or public.is_org_admin(organization_id)
);

-- 2. Mise à jour du profil : colonnes modifiables uniquement --------------------
-- Ni id ni email (l'adresse vient du fournisseur d'authentification), ni les
-- horodatages (updated_at est posé par le déclencheur).
revoke update on public.profiles from authenticated, anon;
grant update (
  display_name,
  timezone,
  locale,
  reminder_offsets,
  travel_buffer_minutes,
  notify_email,
  delete_captures_after_analysis,
  theme
) on public.profiles to authenticated;

-- 3. Plus d'écriture directe sur les données partagées -------------------------
-- Événements, occurrences, participants, groupes et adhésions sont modifiés
-- uniquement par le serveur (contrôles d'autorisation, journal d'audit,
-- notifications). Restent : la réponse d'un participant (participants_self_update,
-- protégée par le déclencheur event_participants_guard) et le départ d'un groupe
-- (group_members_leave).
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
drop policy if exists occurrences_write on public.event_occurrences;
drop policy if exists participants_manage on public.event_participants;
drop policy if exists groups_write on public.groups;
drop policy if exists group_members_write on public.group_members;
drop policy if exists org_members_admin on public.organization_members;
drop policy if exists organizations_update on public.organizations;

-- 4. Limitation de débit : purge des compteurs anciens -------------------------
-- Les clés sont des empreintes SHA-256 (jamais l'IP en clair) ; les lignes de
-- plus d'un jour sont supprimées de temps en temps (≈ 1 appel sur 100).
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;
  insert into rate_limits (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end,
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end
  returning hits into n;
  return n <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
