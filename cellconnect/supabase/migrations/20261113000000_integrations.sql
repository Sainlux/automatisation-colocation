-- Connexions externes : Outlook, Zoom ; canaux de notification (webhooks) des calendriers.
alter table public.calendar_connections drop constraint if exists calendar_connections_provider_check;
alter table public.calendar_connections add constraint calendar_connections_provider_check check (provider in ('google', 'outlook', 'zoom'));
alter table public.calendar_connections add column watch_channel_id text;
alter table public.calendar_connections add column watch_resource_id text;
alter table public.calendar_connections add column watch_expires_at timestamptz;
create unique index calendar_connections_watch_idx on public.calendar_connections (watch_channel_id) where watch_channel_id is not null;
