-- =============================================================================
-- Durcissement des politiques RLS (lot L1 — sécurité backend).
--
-- Principe : le navigateur ne parle jamais directement à la base avec la clé
-- anonyme pour ÉCRIRE des données sensibles. Toutes les écritures passent par
-- les Route Handlers (clé service role), qui appliquent les règles métier
-- (src/lib/auth/permissions.ts). Les politiques ci-dessous ne laissent aux
-- utilisateurs authentifiés que la lecture de leurs propres données, plus
-- quelques mises à jour sans risque.
-- =============================================================================

-- (a) Invitations : aucune écriture directe (création ou réponse).
--     Une invitation forgée pourrait sinon faire entrer quelqu'un dans une
--     autre église, avec un rôle d'administrateur.
drop policy if exists invitations_write on public.invitations;
drop policy if exists invitations_respond on public.invitations;

-- (b) Participants : la personne peut toujours mettre à jour SA réponse
--     (statut, date de réponse), mais jamais l'événement, l'église, la personne
--     ni le rôle de la ligne. Le contrôle est fait par un déclencheur, car une
--     politique RLS ne peut pas comparer l'ancienne et la nouvelle valeur.
drop policy if exists participants_self_update on public.event_participants;
create policy participants_self_update on public.event_participants
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.event_participants_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Seuls les rôles exposés à l'API publique sont contrôlés : le serveur
  -- (service_role) et les connexions d'administration ne sont pas concernés.
  if current_user in ('authenticated', 'anon')
     and (new.event_id is distinct from old.event_id
       or new.organization_id is distinct from old.organization_id
       or new.user_id is distinct from old.user_id
       or new.role is distinct from old.role) then
    raise exception 'Modification non autorisée de la participation (événement, église, personne ou rôle).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists event_participants_guard on public.event_participants;
create trigger event_participants_guard
  before update on public.event_participants
  for each row execute function public.event_participants_guard();

-- (c) Captures et analyses : lecture seule pour la personne concernée.
--     La création passe par le serveur (contrôle du type réel des fichiers,
--     des tailles, de l'appartenance à l'église).
drop policy if exists uploads_own on public.uploads;
create policy uploads_own_select on public.uploads for select using (user_id = auth.uid());
create policy uploads_own_delete on public.uploads for delete using (user_id = auth.uid());

drop policy if exists extraction_jobs_own on public.extraction_jobs;
create policy extraction_jobs_own_select on public.extraction_jobs for select using (user_id = auth.uid());

-- Les dates extraites sont des PROPOSITIONS : seul le serveur les écrit, et
-- rien n'est ajouté à l'agenda sans validation explicite.
drop policy if exists extracted_events_own on public.extracted_events;
create policy extracted_events_own_select on public.extracted_events for select using (user_id = auth.uid());

-- (d) Rappels : la clé de déduplication n'est unique que parmi les rappels
--     programmés. Un rappel envoyé ou annulé libère sa clé (préparation du lot L3).
alter table public.reminders drop constraint if exists reminders_dedupe_key_key;
create unique index if not exists reminders_dedupe_scheduled on public.reminders (dedupe_key) where status = 'scheduled';
