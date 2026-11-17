-- Limitation de débit partagée entre toutes les instances de l'application (fenêtre fixe, atomique).
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security; -- aucune politique : accès serveur uniquement

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into rate_limits (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end,
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end
  returning hits into n;
  return n <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
