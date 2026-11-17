# Configuration Supabase

1. Créez un projet sur supabase.com — choisissez une région européenne (ex. Zurich `eu-central-2` si disponible, sinon Francfort).
2. **Schéma** : depuis le dossier `cellconnect`, `npx supabase link --project-ref <ref>` puis `npx supabase db push` (applique toutes les migrations dans l'ordre et mémorise celles déjà passées). À défaut de CLI : **SQL Editor**, exécutez les fichiers de `supabase/migrations/` **dans l'ordre de leur nom, une seule fois chacun** (liste ci-dessous). La première migration crée aussi le bucket privé `captures`.
3. **Authentication**
   - *Providers → Email* : activez e-mail + mot de passe. Activez la confirmation d'e-mail si souhaité (l'interface l'indique alors après l'inscription).
   - *Auth → SMTP Settings* : renseignez votre fournisseur d'e-mails (le même que `SMTP_*` convient). Le SMTP intégré de Supabase n'est fait que pour les essais (quelques e-mails par heure).
   - *Rate Limits* : relevez la limite d'envoi d'e-mails (confirmations, réinitialisations) une fois le SMTP personnalisé en place.
   - *URL Configuration* : **Site URL = `APP_URL`**, **Redirect URLs = `APP_URL/**`** (ex. `https://agenda.mon-eglise.ch/**`).
4. **Project Settings → API** : copiez dans vos variables d'environnement
   - `NEXT_PUBLIC_SUPABASE_URL` (URL du projet)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé anon / publishable)
   - `SUPABASE_SERVICE_ROLE_KEY` (clé service_role / secret — **serveur uniquement**)
5. Redémarrez l'application : `/api/health` appelé avec `Authorization: Bearer <CRON_SECRET>` doit indiquer `"backend":"supabase"` (503 si la base est injoignable).

## Migrations

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

Une modification du schéma passe toujours par une **nouvelle** migration (jamais par la modification d'un fichier déjà appliqué).

## Développement local (sans compte Supabase)

Avec Docker installé :

```bash
npx supabase start          # base, Auth, API, Storage, Mailpit (SMTP de test) ; applique les migrations
npx supabase status         # affiche l'URL et les clés locales (clés de démonstration publiques)
```

Renseignez ces valeurs dans `.env.local` (`DATA_BACKEND=supabase`), et pour les e-mails `SMTP_HOST`/`SMTP_PORT` vers Mailpit (interface web : http://127.0.0.1:54324). Le serveur SMTP de test écoute sur le port **54325** (`smtp_port` dans `supabase/config.toml`). Les tests d'intégration se lancent avec `SUPABASE_IT=1 SMTP_HOST=127.0.0.1 SMTP_PORT=54325 npm run test:supabase` ; ils tournent aussi dans GitHub Actions (job *supabase* de `.github/workflows/ci.yml`, non bloquant pour l'instant).

Vérifications conseillées : créer deux comptes, vérifier qu'aucun ne voit les événements de l'autre ; dans le SQL Editor, `select * from events` avec le rôle `authenticated` ne doit rien renvoyer sans JWT.
