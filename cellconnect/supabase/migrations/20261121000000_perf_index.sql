-- Index de performance (lot L3) : chemins chauds du worker et des agents.
-- Toutes les créations sont idempotentes (if not exists) pour pouvoir rejouer la migration.

-- Rappels programmés d'un événement (annulation / reprogrammation, éventuellement par participant).
create index if not exists reminders_event_user_scheduled_idx
  on public.reminders (event_id, user_id)
  where status = 'scheduled';

-- Conflits liés à un événement (côté A ou côté B) : détection, clôture, filtre ?eventId=.
create index if not exists calendar_conflicts_event_a_idx on public.calendar_conflicts (event_a_id);
create index if not exists calendar_conflicts_event_b_idx on public.calendar_conflicts (event_b_id);

-- Tâches d'agents d'un utilisateur par statut (tableau de bord : synchronisations en échec).
create index if not exists agent_tasks_user_status_idx on public.agent_tasks (user_id, status);

-- Livraisons d'un utilisateur (export / effacement nLPD-RGPD, suivi des envois).
create index if not exists notification_deliveries_user_idx on public.notification_deliveries (user_id);

-- Résolutions d'un conflit (clé étrangère non indexée jusqu'ici).
create index if not exists conflict_resolutions_conflict_idx on public.conflict_resolutions (conflict_id);

-- Participations d'un utilisateur à un événement donné (contrôle d'accès, rappels).
create index if not exists event_participants_user_event_idx on public.event_participants (user_id, event_id);
