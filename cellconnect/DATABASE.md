# Base de données

Schéma : `supabase/migrations/20261110000000_initial_schema.sql` (PostgreSQL ≥ 13, Supabase). Les types TypeScript correspondants sont dans `src/lib/types.ts`.

Les migrations sont **appliquées réellement** dans PostgreSQL (PGlite) par `tests/unit/migrations.test.ts`, qui vérifie aussi l'isolation RLS entre organisations.

## Tables

| Domaine | Tables |
|---|---|
| Identité, organisations | `profiles` (1-1 avec `auth.users`), `organizations`, `organization_members` (rôle : super_admin, org_admin, group_leader, member, guest) |
| Groupes | `groups`, `group_members` (leader, member, guest) |
| Import | `uploads` (fichier privé, supprimable ; `storage_path` nul après suppression), `extraction_jobs` (statut + étape), `extracted_events` (brut + brouillon) |
| Événements | `events` (instants UTC + fuseau + RRULE), `event_occurrences` (réservé aux exceptions de récurrence), `event_participants`, `invitations`, `event_changes` |
| Calendriers externes | `calendar_connections` (jetons **chiffrés**), `calendar_sync_records` (identifiants externes, anti-doublon) |
| Conflits | `calendar_conflicts` (par utilisateur, paire ordonnée A<B, unicité par occurrence), `conflict_resolutions` |
| Rappels, notifications | `reminders` (`dedupe_key` unique), `notifications` (`dedupe_key` unique), `notification_deliveries` (un statut par canal) |
| Technique | `agent_tasks` (file persistante, `idempotency_key`), `idempotency_keys`, `audit_logs` |

Toutes les clés sont des UUID ; clés étrangères avec `on delete cascade` pour la suppression des données ; index sur les accès fréquents (agenda par organisation et date, participations par utilisateur, rappels et livraisons dus).

## Contraintes notables

- `events.ends_at > starts_at` ; `meeting_url` doit commencer par `https://`.
- `calendar_conflicts.event_a_id < event_b_id` + unicité `(user, A, B, occurrence A, occurrence B)`.
- Unicités anti-doublon : rappels, notifications, livraisons par canal, tâches de synchronisation.

## Row Level Security

RLS est activée sur **toutes** les tables. Fonctions d'aide `SECURITY DEFINER` : `is_org_member`, `is_org_admin`, `is_group_member`, `is_group_leader`, `is_event_participant`, `can_view_event`, `can_edit_event`.

- Données personnelles (captures, analyses, conflits, rappels, notifications, connexions) : propriétaire uniquement.
- Événements : visibles par créateur, participants, membres du groupe (visibilité `group`), membres de l'organisation (visibilité `organization`), administrateurs ; modifiables par créateur, responsable du groupe, administrateur.
- Un participant ne peut modifier que **sa** participation.
- Journal d'audit : lecture par l'acteur et les administrateurs ; écriture serveur uniquement.
- Bucket `captures` privé ; lecture/suppression limitées au propriétaire (chemin `org/user/upload`).

Le serveur utilise la clé `service_role` (qui contourne RLS) et applique les mêmes règles dans `src/lib/auth/permissions.ts` ; RLS protège tout accès direct avec la clé anonyme.

## Mode local

`LocalStore` reproduit les contraintes d'unicité (`UNIQUE_CONSTRAINTS` dans `src/lib/db/store.ts`). Il ne gère pas les clés étrangères ni la concurrence multi-processus : réservé à la démonstration.
