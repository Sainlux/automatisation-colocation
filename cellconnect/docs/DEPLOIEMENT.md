# Déploiement

Architecture de production : **Vercel** (application Next.js) + **Supabase** (PostgreSQL, Auth, Storage), région européenne.
Avant toute mise en ligne, la vérification complète doit passer en local :

```bash
cd cellconnect && npm ci && npm run verify   # types + lint + tests unitaires + build + 16 tests de bout en bout
```

La même vérification tourne automatiquement à chaque push sur `main` et à chaque pull request (`.github/workflows/ci.yml`, job **verify**).

## Mise en ligne, étape par étape (propriétaire)

Suivez les étapes dans l'ordre ; chacune ne demande que des comptes gratuits.

1. **Vérifier le code** : `npm run verify` en local, et le job *verify* de GitHub Actions au vert sur le commit à déployer.
2. **Créer le projet Supabase** (région européenne, ex. Zurich `eu-central-2` si disponible, sinon Francfort), puis appliquer le schéma : `npx supabase link --project-ref <ref>` puis `npx supabase db push` (détails et alternative sans CLI : [SUPABASE.md](SUPABASE.md)).
3. **Configurer Supabase Auth** : e-mail + mot de passe ; *Auth → SMTP Settings* avec votre fournisseur d'e-mails (le SMTP intégré de Supabase est limité à quelques messages par heure) ; relever la limite d'envoi ; *URL Configuration* : **Site URL = `APP_URL`**, **Redirect URLs = `APP_URL/**`**.
4. **Générer les secrets** (sur votre poste, jamais dans un fichier commité) :
   - `SESSION_SECRET`, `CRON_SECRET` : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (une valeur différente pour chacun) ;
   - `TOKEN_ENCRYPTION_KEY` (si Google / Outlook / Zoom) : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` ;
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` : `npm run vapid`.
5. **Créer le projet Vercel** : *New Project* → importez le dépôt → **Root Directory : `cellconnect`** (le dépôt contient une autre application à la racine). Node.js 22 (*Settings → Build and Deployment → Node.js Version* ; même version que `.nvmrc` et la CI).
6. **Renseigner les variables d'environnement** (Production, et Preview si vous l'utilisez) d'après le tableau ci-dessous. `DATA_BACKEND=supabase` est **obligatoire**.
7. **Déployer**, puis vérifier `https://<domaine>/api/health` : `{"ok":true}` attendu. Avec `Authorization: Bearer <CRON_SECRET>`, la réponse indique aussi `"backend":"supabase"` et les intégrations actives. Un **503** signifie que la base est injoignable (URL ou clé Supabase erronée, projet en pause).
8. **Planifier les rappels** : choisir une des trois options de la section « Tâches de fond » ci-dessous.
9. **Brancher les messageries** (facultatif) : bot Telegram → `npm run telegram:webhook` (une fois, depuis votre poste, avec les variables `TELEGRAM_*` et `APP_URL` de production) ; e-mails entrants → webhook du fournisseur vers `https://<domaine>/api/inbound/email?token=<INBOUND_EMAIL_WEBHOOK_TOKEN>` (voir [MESSAGERIES.md](MESSAGERIES.md)).
10. **Contrôler en conditions réelles** : créer deux comptes, coller un message avec des dates, vérifier qu'aucun compte ne voit les événements de l'autre, recevoir un e-mail d'invitation.
11. **En cas de problème** : retour arrière immédiat avec **Instant Rollback** (Vercel → *Deployments* → déploiement précédent → *Instant Rollback*). Le schéma de base n'est jamais modifié par un déploiement : seules de nouvelles migrations, appliquées explicitement à l'étape 2, le changent.

⚠️ Ne déployez pas en mode local (`DATA_BACKEND=local`) sur Vercel : le système de fichiers n'y est pas persistant (sans `DATA_BACKEND` explicite, l'application refuse de démarrer sur Vercel si Supabase n'est pas configuré).

## Variables d'environnement

Modèle complet : [`.env.example`](../.env.example). Lecture centralisée : `src/lib/env.ts`.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATA_BACKEND` | **oui** (`supabase`) | `supabase` en production ; `local` réservé à la démonstration sur une seule machine |
| `APP_URL` | **oui** | Adresse publique en `https://` (liens des e-mails, OAuth, webhooks) |
| `SESSION_SECRET` | **oui** | 32 caractères minimum ; signe les sessions et l'état OAuth |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **oui** | Projet Supabase (publiques par conception) |
| `SUPABASE_SERVICE_ROLE_KEY` | **oui** | Clé serveur — jamais exposée au navigateur |
| `SUPABASE_CAPTURES_BUCKET` | non | Ne pas modifier : `captures`, nom fixé par la migration |
| `CRON_SECRET` | **oui** | Protège `/api/cron/tick` et le détail de `/api/health` |
| `DEFAULT_TIMEZONE` | non | Fuseau par défaut (`Europe/Zurich`) |
| `DATA_DIR` | non | Dossier du stockage JSON (mode local uniquement) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | non | Analyse des captures et PDF (sans clé : texte collé et `.ics` seulement) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | recommandé | E-mails de l'application (sans SMTP : « Non envoyé » affiché) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | non | Notifications push — **mêmes valeurs partout** (Vercel, worker, préproduction partageant la base) : changer de clés invalide tous les abonnements existants |
| `TOKEN_ENCRYPTION_KEY` | si agendas | Chiffre les jetons OAuth (32 octets en base64) ; ne plus la changer ensuite |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | non | Google Calendar + Meet ([GOOGLE_CALENDAR.md](GOOGLE_CALENDAR.md)) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT` | non | Outlook / Microsoft 365 ([OUTLOOK_ZOOM.md](OUTLOOK_ZOOM.md)) |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | non | Réunions Zoom |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET`, `INBOUND_EMAIL_WEBHOOK_TOKEN` | non | Réception d'e-mails transférés ([MESSAGERIES.md](MESSAGERIES.md)) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | non | Bot Telegram ; puis `npm run telegram:webhook` |
| `RETENTION_EXTRACTION_DAYS`, `RETENTION_NOTIFICATION_DAYS`, `RETENTION_AUDIT_DAYS`, `RETENTION_CONFLICT_DAYS`, `RETENTION_REMINDER_DAYS`, `RETENTION_TASK_DAYS`, `RETENTION_IDEMPOTENCY_DAYS` | non | Durées de conservation (jours) ; valeurs par défaut dans `.env.example` |
| `MAX_IMAGE_BYTES`, `MAX_PDF_BYTES`, `MAX_TEXT_CHARS`, `MAX_FILES_PER_ANALYSIS` | non | Limites d'import |
| `WORKER_INTERVAL_MS` | non | Intervalle de `npm run worker` (30 s par défaut) |
| `TRUST_PROXY_HOPS` | non | Nombre de proxys de confiance devant l'application pour lire `X-Forwarded-For` (1 par défaut) ; inutile sur Vercel |
| `TRUST_REAL_IP` | non | `1` uniquement derrière un proxy qui **réécrit** `X-Real-IP` (nginx, Caddy…) ; inutile sur Vercel, où l'en-tête est déjà fiable |
| `VERCEL` | — | Posée automatiquement par Vercel ; ne pas la définir vous-même |
| `TEST_NOW` | — | Tests de bout en bout uniquement (ignorée en production avec Supabase) ; ne pas la définir |

## Tâches de fond (rappels, e-mails, synchronisations, purge)

Toutes les options appellent le même traitement ; l'état est en base, elles peuvent donc coexister.

- **Vercel Cron** (`vercel.json`) : `/api/cron/tick?pull=1` **une fois par jour** (`7 4 * * *`, 04:07 UTC), compatible avec le plan gratuit. Suffit pour la purge et les synchronisations, pas pour des rappels précis.

Pour des rappels **toutes les 5 minutes**, choisissez une des trois façons suivantes :

1. **Appel externe gratuit** : un planificateur (cron-job.org, GitHub Actions planifié, Uptime Kuma…) appelle toutes les 5 minutes
   `GET https://<domaine>/api/cron/tick` avec l'en-tête **`Authorization: Bearer <CRON_SECRET>`** (jamais le secret dans l'URL) :
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/tick
   ```
   Réponse 200 avec le bilan du passage ; 401 si le secret est absent ou faux.
2. **Plan Vercel Pro** : remettez `"schedule": "*/5 * * * *"` dans `vercel.json`.
3. **Worker séparé** (Railway, Fly.io, Render, VM) : même dépôt, dossier `cellconnect`, commande `npm ci && npm run worker`, **mêmes variables d'environnement** que Vercel (dont `VAPID_*` identiques).

## Auto-hébergement (une seule instance, démonstration)

```bash
cd cellconnect && npm ci && npm run build
SESSION_SECRET=... DATA_BACKEND=local DATA_DIR=/var/lib/cellconnect npm start   # application
SESSION_SECRET=... DATA_BACKEND=local DATA_DIR=/var/lib/cellconnect npm run worker  # rappels
```
Placez un proxy HTTPS (Caddy, nginx) devant le port 3000 ; s'il réécrit `X-Real-IP`, ajoutez `TRUST_REAL_IP=1`.
