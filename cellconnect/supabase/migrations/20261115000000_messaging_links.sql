-- Messageries liées à un compte (bot Telegram) pour transférer des messages à analyser.
-- Une seule conversation par utilisateur et par messagerie ; une conversation n'est liée qu'à un compte.
create table public.messaging_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('telegram')),
  external_id text not null check (length(external_id) between 1 and 64),
  label text check (label is null or length(label) <= 100),
  last_update_id bigint,
  created_at timestamptz not null default now(),
  unique (channel, external_id),
  unique (user_id, channel)
);

alter table public.messaging_links enable row level security;
-- Lecture et suppression par le propriétaire ; la liaison elle-même est faite côté serveur (clé de service, webhook signé).
create policy messaging_links_select_own on public.messaging_links for select using (user_id = auth.uid());
create policy messaging_links_delete_own on public.messaging_links for delete using (user_id = auth.uid());
