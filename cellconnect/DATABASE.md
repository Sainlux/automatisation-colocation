# Base de données

Schéma : `supabase/migrations/*.sql` (PostgreSQL ≥ 13, Supabase). Les types TypeScript correspondants sont dans `src/lib/types.ts`.

**Appliquer le schéma** : `npx supabase link --project-ref <ref>` puis `npx supabase db push`. À défaut, exécutez les fichiers dans le SQL Editor **dans l'ordre de leur nom, une seule fois chacun**. Réglages Auth (SMTP, limite d'envoi, Site URL / Redirect URLs = `APP_URL/**`) : voir [docs/SUPABASE.md](docs/SUPABASE.md).

| Fichier | Contenu |
|---|---|
| `20261110000000_initial_schema.sql` | Schéma initial, RLS, fonctions d'aide, bucket privé `captures` |
| `20261111000000_email_invitations.sql` | Invitations par e-mail (jeton haché, 30 jours) |
| `20261112000000_push_subscriptions.sql` | Abonnements aux notifications push |
| `20261113000000_integrations.sql` | Connexions Outlook et Zoom, canaux webhook des calendriers |
| `20261114000000_rate_limits.sql` | Limitation de débit partagée (`rate_limit_hit`) |
| `20261115000000_messaging_links.sql` | Comptes Telegram liés |
| `20261119000000_securite_rls.sql` | Durcissement RLS (écritures sensibles par le serveur) |
| `20261120000000_extraction_source.sql` | Canal d'arrivée d'une analyse (e-mail, Telegram) |
| `20261121000000_perf_index.sql` | Index de performance |
| `20261122000000_rls_durcissement.sql` | Durcissement RLS complémentaire : profils et adhésions lisibles par soi-même et les administrateurs, colonnes du profil modifiables limitées, écritures directes fermées ; clés de limitation purgées après un jour |

Toute évolution du schéma passe par une **nouvelle** migration.

Les migrations sont **appliquées réellement** dans PostgreSQL (PGlite) par `tests/unit/migrations.test.ts`, et dans un Supabase complet par `npm run test:supabase` (RLS vérifiée avec de vrais jetons utilisateurs).

## Tables

| Domaine | Tables |
|---|---|
| Identité, organisations | `profiles` (1-1 avec `auth.users`), `organizations`, `organization_members` (rôle : super_admin, org_admin, group_leader, member, guest) |
| Groupes | `groups`, `group_members` (leader, member, guest) |
| Import | `uploads` (fichier privé, supprimable ; `storage_path` nul après suppression), `extraction_jobs` (statut + étape), `extracted_events` (brut + brouillon) |
| Événements | `events` (instants UTC + fuseau + RRULE), `event_occurrences` (dates annulées / déplacées d'une série), `event_participants`, `invitations` (internes, par e-mail avec jeton haché, ou d'organisation), `event_changes` |
| Connexions externes | `calendar_connections` (Google, Outlook, Zoom ; jetons **chiffrés** ; canal webhook), `calendar_sync_records` (identifiants externes, anti-doublon) |
| Conflits | `calendar_conflicts` (par utilisateur, paire ordonnée A<B, unicité par occurrence), `conflict_resolutions` |
| Rappels, notifications | `reminders` (`dedupe_key` unique), `notifications` (`dedupe_key` unique), `notification_deliveries` (un statut par canal) |
| Technique | `agent_tasks` (file persistante, `idempotency_key`), `idempotency_keys`, `audit_logs`, `rate_limits` (+ fonction atomique `rate_limit_hit`) |
| Push | `push_subscriptions` (un abonnement par appareil) |

Toutes les clés sont des UUID ; clés étrangères avec `on delete cascade` pour la suppression des données ; index sur les accès fréquents (agenda par organisation et date, participations par utilisateur, rappels et livraisons dus).

## Contraintes notables

- `events.ends_at > starts_at` ; `meeting_url` doit commencer par `https://`.
- `calendar_conflicts.event_a_id < event_b_id` + unicité `(user, A, B, occurrence A, occurrence B)`.
- Unicités anti-doublon : rappels, notifications, livraisons par canal, tâches de synchronisation.

## Row Level Security

RLS est activée sur **toutes** les tables. Fonctions d'aide `SECURITY DEFINER` : `is_org_member`, `is_org_admin`, `is_group_member`, `is_group_leader`, `is_event_participant`, `can_view_event`, `can_edit_event`.

- Données personnelles (captures, analyses, conflits, rappels, notifications, connexions) : propriétaire uniquement.
- Profils et adhésions : lisibles par la personne elle-même et par les administrateurs de son église (`20261122000000_rls_durcissement.sql`) ; écritures directes fermées sur les tables métier (événements, groupes, membres, organisations) : tout passe par le serveur.
- Événements : visibles par créateur, participants, membres du groupe (visibilité `group`), membres de l'organisation (visibilité `organization`), administrateurs ; modifiables par créateur, responsable du groupe, administrateur.
- Un participant ne peut modifier que **sa** participation.
- Journal d'audit : lecture par l'acteur et les administrateurs ; écriture serveur uniquement.
- Bucket `captures` privé ; lecture/suppression limitées au propriétaire (chemin `org/user/upload`).

Le serveur utilise la clé `service_role` (qui contourne RLS) et applique les mêmes règles dans `src/lib/auth/permissions.ts` ; RLS protège tout accès direct avec la clé anonyme.

## Mode local

`LocalStore` reproduit les contraintes d'unicité (`UNIQUE_CONSTRAINTS` dans `src/lib/db/store.ts`). Il ne gère pas les clés étrangères ni la concurrence multi-processus : réservé à la démonstration.
