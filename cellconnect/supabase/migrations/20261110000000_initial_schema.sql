-- =============================================================================
-- CellConnect AI — schéma initial (PostgreSQL / Supabase)
-- Multi-organisations, isolation par Row Level Security.
-- =============================================================================

-- gen_random_uuid() est natif depuis PostgreSQL 13 (aucune extension requise).

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('super_admin', 'org_admin', 'group_leader', 'member', 'guest');
create type public.group_role as enum ('leader', 'member', 'guest');
create type public.event_status as enum ('confirmed', 'tentative', 'cancelled');
create type public.event_visibility as enum ('private', 'group', 'organization');
create type public.event_source as enum ('manual', 'capture', 'ics', 'google', 'outlook');
create type public.participant_status as enum ('invited', 'accepted', 'tentative', 'declined', 'withdrawn');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'tentative', 'cancelled');
create type public.conflict_kind as enum ('full', 'partial', 'travel_buffer');
create type public.conflict_status as enum ('open', 'resolved', 'postponed', 'dismissed');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');
create type public.delivery_channel as enum ('in_app', 'email', 'push');

-- ---------------------------------------------------------------------------
-- Profils et organisations
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 120),
  timezone text not null default 'Europe/Zurich',
  locale text not null default 'fr',
  reminder_offsets integer[] not null default '{1440,120,30}',
  travel_buffer_minutes integer not null default 0 check (travel_buffer_minutes between 0 and 240),
  notify_email boolean not null default true,
  delete_captures_after_analysis boolean not null default true,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  color text not null default '#1d4ed8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_org_idx on public.groups (organization_id);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Captures et extraction
-- ---------------------------------------------------------------------------
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'pdf', 'text', 'ics')),
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  sha256 text not null,
  storage_path text,               -- null après suppression du fichier
  original_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index uploads_user_idx on public.uploads (user_id, created_at desc);

create table public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  upload_ids uuid[] not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'needs_review', 'completed', 'failed')),
  step text not null default 'received' check (step in ('received', 'analyzing', 'extracted', 'review', 'ready')),
  provider text,
  error text,
  warnings text[] not null default '{}',
  context_notes text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index extraction_jobs_user_idx on public.extraction_jobs (user_id, created_at desc);
create index extraction_jobs_pending_idx on public.extraction_jobs (status, updated_at) where status in ('pending', 'processing');

create table public.extracted_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position integer not null,
  raw jsonb not null,
  draft jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'created', 'rejected')),
  event_id uuid,
  created_at timestamptz not null default now()
);
create index extracted_events_job_idx on public.extracted_events (job_id, position);

-- ---------------------------------------------------------------------------
-- Événements
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  location text,
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Zurich',
  all_day boolean not null default false,
  recurrence_rule text,
  recurrence_until timestamptz,
  status public.event_status not null default 'confirmed',
  visibility public.event_visibility not null default 'private',
  source public.event_source not null default 'manual',
  source_job_id uuid references public.extraction_jobs (id) on delete set null,
  external_uid text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at)
);
create index events_org_time_idx on public.events (organization_id, starts_at);
create index events_group_idx on public.events (group_id) where group_id is not null;
create index events_creator_idx on public.events (created_by);

-- Occurrences matérialisées / exceptions d'événements récurrents (réservé :
-- le MVP calcule les occurrences à la volée à partir de recurrence_rule).
create table public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.event_status not null default 'confirmed',
  overrides jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (event_id, starts_at),
  check (ends_at > starts_at)
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'participant' check (role in ('organizer', 'participant')),
  status public.participant_status not null default 'invited',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_participants_user_idx on public.event_participants (user_id, status);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invited_by uuid not null references public.profiles (id),
  invitee_user_id uuid references public.profiles (id) on delete cascade,
  invitee_email text,
  group_id uuid references public.groups (id) on delete set null,
  status public.invitation_status not null default 'pending',
  token_hash text not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (invitee_user_id is not null or invitee_email is not null)
);
create index invitations_invitee_idx on public.invitations (invitee_user_id, status);
create index invitations_event_idx on public.invitations (event_id);

-- ---------------------------------------------------------------------------
-- Calendriers externes
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  account_email text,
  access_token_enc text,           -- chiffré AES-256-GCM côté serveur
  refresh_token_enc text,          -- chiffré AES-256-GCM côté serveur
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  calendar_id text not null default 'primary',
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index calendar_connections_user_idx on public.calendar_connections (user_id);

create table public.calendar_sync_records (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  external_id text not null,
  direction text not null check (direction in ('push', 'pull')),
  external_updated_at text,
  status text not null default 'synced' check (status in ('synced', 'error', 'deleted')),
  error text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (connection_id, event_id),
  unique (connection_id, external_id)
);

-- ---------------------------------------------------------------------------
-- Conflits
-- ---------------------------------------------------------------------------
create table public.calendar_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_a_id uuid not null references public.events (id) on delete cascade,
  event_b_id uuid not null references public.events (id) on delete cascade,
  occurrence_a_start timestamptz not null,
  occurrence_a_end timestamptz not null,
  occurrence_b_start timestamptz not null,
  occurrence_b_end timestamptz not null,
  overlap_minutes integer not null check (overlap_minutes >= 0),
  kind public.conflict_kind not null,
  status public.conflict_status not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (event_a_id < event_b_id),
  unique (user_id, event_a_id, event_b_id, occurrence_a_start, occurrence_b_start)
);
create index calendar_conflicts_user_idx on public.calendar_conflicts (user_id, status);

create table public.conflict_resolutions (
  id uuid primary key default gen_random_uuid(),
  conflict_id uuid not null references public.calendar_conflicts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('keep_a', 'keep_b', 'withdraw_a', 'withdraw_b', 'propose_slot', 'request_change', 'postpone', 'keep_both')),
  withdrawn_event_id uuid references public.events (id) on delete set null,
  message text,
  notify_organizer boolean not null default false,
  proposed_start timestamptz,
  proposed_end timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  changed_by uuid not null references public.profiles (id),
  change_type text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index event_changes_event_idx on public.event_changes (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rappels et notifications
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  offset_minutes integer not null check (offset_minutes between 1 and 40320),
  occurrence_start timestamptz not null,
  remind_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  dedupe_key text not null unique,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (remind_at) where status = 'scheduled';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_pending_idx on public.notification_deliveries (next_attempt_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Tâches d'agents, idempotence et audit
-- ---------------------------------------------------------------------------
create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  agent text not null,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'awaiting_approval')),
  input jsonb not null default '{}',
  output jsonb,
  error text,
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_tasks_due_idx on public.agent_tasks (run_after) where status = 'pending';

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null,
  key text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, scope, key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger extraction_jobs_touch before update on public.extraction_jobs for each row execute function public.touch_updated_at();
create trigger agent_tasks_touch before update on public.agent_tasks for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row Level Security
-- Le serveur applicatif utilise la clé service_role (qui contourne RLS) et
-- applique lui-même les autorisations. Ces politiques protègent tout accès
-- DIRECT avec la clé anonyme/utilisateur (navigateur, outils tiers).
-- =============================================================================

-- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS).
create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members m where m.organization_id = org and m.user_id = auth.uid());
$$;

create or replace function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members m where m.organization_id = org and m.user_id = auth.uid() and m.role in ('org_admin', 'super_admin'));
$$;

create or replace function public.is_group_member(grp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = grp and m.user_id = auth.uid());
$$;

create or replace function public.is_group_leader(grp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = grp and m.user_id = auth.uid() and m.role = 'leader');
$$;

create or replace function public.is_event_participant(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_participants p where p.event_id = ev and p.user_id = auth.uid());
$$;

create or replace function public.can_view_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = ev
      and public.is_org_member(e.organization_id)
      and (
        e.created_by = auth.uid()
        or public.is_org_admin(e.organization_id)
        or public.is_event_participant(e.id)
        or e.visibility = 'organization'
        or (e.visibility = 'group' and e.group_id is not null and public.is_group_member(e.group_id))
      )
  );
$$;

create or replace function public.can_edit_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = ev
      and public.is_org_member(e.organization_id)
      and (e.created_by = auth.uid() or public.is_org_admin(e.organization_id) or (e.group_id is not null and public.is_group_leader(e.group_id)))
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.uploads enable row level security;
alter table public.extraction_jobs enable row level security;
alter table public.extracted_events enable row level security;
alter table public.events enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.event_participants enable row level security;
alter table public.invitations enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_sync_records enable row level security;
alter table public.calendar_conflicts enable row level security;
alter table public.conflict_resolutions enable row level security;
alter table public.event_changes enable row level security;
alter table public.reminders enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_logs enable row level security;

-- Profils : chacun voit le sien et ceux des membres de ses organisations.
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from organization_members a join organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Organisations
create policy organizations_select on public.organizations for select using (public.is_org_member(id));
create policy organizations_update on public.organizations for update using (public.is_org_admin(id));

create policy org_members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy org_members_admin on public.organization_members for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- Groupes
create policy groups_select on public.groups for select using (public.is_org_admin(organization_id) or public.is_group_member(id));
create policy groups_write on public.groups for all using (public.is_org_admin(organization_id) or public.is_group_leader(id)) with check (public.is_org_member(organization_id));

create policy group_members_select on public.group_members for select using (public.is_org_admin(organization_id) or public.is_group_member(group_id));
create policy group_members_write on public.group_members for all using (public.is_org_admin(organization_id) or public.is_group_leader(group_id)) with check (public.is_org_admin(organization_id) or public.is_group_leader(group_id));
create policy group_members_leave on public.group_members for delete using (user_id = auth.uid());

-- Données strictement personnelles : propriétaire uniquement.
create policy uploads_own on public.uploads for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy extraction_jobs_own on public.extraction_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy extracted_events_own on public.extracted_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_connections_own on public.calendar_connections for select using (user_id = auth.uid());
create policy calendar_sync_own on public.calendar_sync_records for select using (
  exists (select 1 from calendar_connections c where c.id = connection_id and c.user_id = auth.uid())
);
create policy conflicts_own on public.calendar_conflicts for select using (user_id = auth.uid());
create policy conflicts_own_update on public.calendar_conflicts for update using (user_id = auth.uid());
create policy resolutions_own on public.conflict_resolutions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own on public.reminders for select using (user_id = auth.uid());
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_read on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy deliveries_own on public.notification_deliveries for select using (user_id = auth.uid());
create policy idempotency_own on public.idempotency_keys for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy agent_tasks_own on public.agent_tasks for select using (user_id = auth.uid());

-- Événements
create policy events_select on public.events for select using (public.can_view_event(id));
create policy events_insert on public.events for insert with check (created_by = auth.uid() and public.is_org_member(organization_id));
create policy events_update on public.events for update using (public.can_edit_event(id)) with check (public.is_org_member(organization_id));
create policy events_delete on public.events for delete using (public.can_edit_event(id));

create policy occurrences_select on public.event_occurrences for select using (public.can_view_event(event_id));
create policy occurrences_write on public.event_occurrences for all using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

create policy participants_select on public.event_participants for select using (public.can_view_event(event_id));
create policy participants_manage on public.event_participants for all using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));
-- Un participant ne peut modifier que SA participation (désistement, réponse).
create policy participants_self_update on public.event_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy invitations_select on public.invitations for select using (invitee_user_id = auth.uid() or invited_by = auth.uid() or public.can_edit_event(event_id));
create policy invitations_write on public.invitations for insert with check (invited_by = auth.uid() and public.can_edit_event(event_id));
create policy invitations_respond on public.invitations for update using (invitee_user_id = auth.uid()) with check (invitee_user_id = auth.uid());

create policy event_changes_select on public.event_changes for select using (public.can_view_event(event_id));

-- Audit : l'acteur voit ses actions, l'administrateur celles de l'organisation. Écriture serveur uniquement.
create policy audit_select on public.audit_logs for select using (actor_id = auth.uid() or (organization_id is not null and public.is_org_admin(organization_id)));

-- ---------------------------------------------------------------------------
-- Stockage : bucket PRIVÉ pour les captures (aucune lecture publique).
-- Chemin : <organization_id>/<user_id>/<upload_id>
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('captures', 'captures', false) on conflict (id) do nothing;
    execute $p$create policy captures_owner_read on storage.objects for select using (bucket_id = 'captures' and (storage.foldername(name))[2] = auth.uid()::text)$p$;
    execute $p$create policy captures_owner_delete on storage.objects for delete using (bucket_id = 'captures' and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  end if;
end $$;
