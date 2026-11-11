-- Abonnements aux notifications push web (un par appareil / navigateur).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  disabled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
