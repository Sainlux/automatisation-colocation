-- Canal d'arrivée d'une analyse (message transféré par e-mail ou au bot Telegram).
-- Permet de prévenir l'utilisateur du résultat même quand l'analyse est reprise
-- par le worker, en dehors de la requête d'origine.
alter table public.extraction_jobs
  add column source_channel text check (source_channel in ('telegram', 'email')),
  add column source_ref text check (source_ref is null or length(source_ref) between 1 and 64);

comment on column public.extraction_jobs.source_channel is 'telegram | email ; null pour un import fait dans l''application';
comment on column public.extraction_jobs.source_ref is 'Telegram : identifiant de la conversation ; null pour l''e-mail (réponse à l''adresse du compte)';
