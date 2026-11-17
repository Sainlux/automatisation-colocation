-- Invitations par e-mail (personnes sans compte) et invitations à rejoindre une organisation.
alter table public.invitations alter column event_id drop not null;
alter table public.invitations add column org_role public.org_role;
alter table public.invitations add column email_status text check (email_status in ('sent', 'failed', 'skipped'));
alter table public.invitations add column email_error text;
alter table public.invitations add column expires_at timestamptz;
alter table public.invitations add constraint invitations_target check (event_id is not null or org_role is not null);
create unique index invitations_token_idx on public.invitations (token_hash);
create index invitations_email_idx on public.invitations (lower(invitee_email)) where invitee_email is not null;

-- Les invitations d'organisation sont visibles par les administrateurs.
create policy invitations_org_admin on public.invitations for select using (event_id is null and public.is_org_admin(organization_id));
