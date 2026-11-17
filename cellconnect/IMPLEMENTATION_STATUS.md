# État d'implémentation

## Ce qui a été vérifié, et où

**Dernière vérification (17 novembre 2026), dans l'environnement de développement, sans aucun service externe :**

- `npx tsc --noEmit` (types), `npx eslint` : sans erreur.
- `npx vitest run` : **21 fichiers, 242 tests unitaires**, tous passés (dont `tests/unit/import-ux.test.ts` : adresse de retour sûre après connexion, récapitulatif d'import, dates passées décochées).
- **Playwright (`tests/e2e/parcours.spec.ts`, 8 scénarios × mobile + ordinateur = 16 tests) : passe** (build de production en mode local ; 16/16 lors de la revue du commit 8270982, à reconfirmer par `npm run verify` après intégration des derniers changements). La suite tourne **à chaque push sur `main` et à chaque pull request** dans GitHub Actions (`.github/workflows/ci.yml`, job **verify** : lint, types, tests unitaires, build, Playwright ; rapport et traces conservés en cas d'échec). En local : `npm run verify` enchaîne la même vérification.
- Nouveaux tests unitaires : `tests/unit/cron.test.ts` (`/api/cron/tick` : 401 sans secret configuré, avec ou sans « Bearer  », ou avec un mauvais secret ; 200 avec le bon) et `tests/unit/proxy.test.ts` (redirection vers `/connexion` sans session, pages publiques et cookies de session laissés passer).
- **Job `supabase` de la CI** (`supabase start` + Mailpit sur le port SMTP 54325, puis `npm run test:supabase`) : **non bloquant** (`continue-on-error`) jusqu'à un premier passage vert constaté ; à rendre bloquant ensuite.
- **Rien n'a été testé contre un vrai Supabase, un vrai OpenAI ni un vrai serveur SMTP.** Les tests d'intégration `tests/integration/supabase.test.ts` (`npm run test:supabase`) existent mais n'ont pas été exécutés ici : ils demandent un Supabase et un SMTP de test (ex. `supabase start` + Mailpit) ; le job `supabase` de la CI les lance à chaque push.

Les colonnes « Preuve » ci-dessous indiquent quel test couvre chaque fonction. Celles qui citent `test:supabase` ou un service réel n'ont **pas** été revérifiées lors de cette passe : elles décrivent ce que ces tests vérifient quand on les lance.

### Scénarios de bout en bout (Playwright, mode local, horloge serveur figée par `TEST_NOW=2026-11-10T12:00:00Z`)

| Scénario | Ce qui est vérifié |
|---|---|
| Visiteur non connecté | Redirection vers `/connexion`, API en 401 |
| Parcours complet | Inscription → message collé → 5 dates → conflit → récapitulatif → ajout → résolution → export .ics |
| Invitation par e-mail (sans SMTP) | Lien renvoyé à l'organisateur ; inscription sans champ « église » ; réponse « Je participe » |
| Partage vers l'application | Web Share Target + service worker (Chromium) |
| Suppression du compte | Mot faux refusé (bouton inactif, API 400), puis `SUPPRIMER` : session fermée, connexion impossible |
| Date déplacée d'une série | La fiche de la date montre « Date déplacée » et le nouvel horaire |
| Agenda en vue liste | Tab atteint l'événement, Entrée ouvre sa fiche |
| Double appui sur « Ajouter » | Un seul jeu de 5 événements créé |

## ✅ Implémenté et couvert par des tests automatisés

| Fonction | Preuve |
|---|---|
| **Mode production Supabase** : Auth (inscription, connexion), PostgreSQL via PostgREST, Storage privé, migrations | `test:supabase` (non exécuté ici), `migrations.test.ts` (lecture statique des migrations) |
| **RLS** avec de vrais jetons utilisateurs : isolation entre organisations, écriture refusée ailleurs, participant incapable d'annuler un événement collectif via l'API REST directe | `test:supabase`, `migrations.test.ts` |
| **E-mails** (SMTP) : invitations, désistement, annulation, liens d'invitation | `test:supabase` avec Mailpit (non exécuté ici) ; envoi simulé dans les tests unitaires |
| Inscription, connexion, sessions, redirections, 401, CSRF | E2E, `core.test.ts` |
| Texte collé → 5 formations (capture WhatsApp), année justifiée et confirmée, aucun lien inventé | E2E, `text-parser.test.ts`, `core.test.ts` |
| Vérification d'agenda avant création, choix par conflit, récapitulatif, création idempotente | E2E, `agents.test.ts` |
| Calendrier jour/semaine/mois/liste, fuseau Europe/Zurich, heure d'été/hiver | E2E, `core.test.ts` |
| Conflits : partiel/complet, consécutifs exclus, temps de déplacement, récurrences, isolation entre personnes | `agents.test.ts`, `occurrences.test.ts` |
| Désistement ≠ annulation ; confidentialité du message ; annulation réservée et confirmée ; déplacement | `agents.test.ts`, `test:supabase` |
| **Exceptions de récurrence** : annuler / déplacer / rétablir une date ; conflits, rappels, .ics (EXDATE, RECURRENCE-ID) | `occurrences.test.ts` |
| **Invitations par e-mail** à des personnes sans compte (lien unique 30 j, inscription, rejoint l'organisation et l'événement) ; invitations d'organisation avec rôle | `email-invitations.test.ts`, E2E (navigateur), `test:supabase` (lien lu dans le vrai e-mail) |
| **Notifications push web** : chiffrement aes128gcm + VAPID réels, déchiffrés par un service push local ; abonnement expiré désactivé ; nouvelles tentatives | `push.test.ts` |
| **Partage vers l'application** (Web Share Target POST + service worker) | E2E (Chromium) |
| Notifications internes/e-mail : anti-doublon, échec, nouvelle tentative, échec définitif, « non configuré » | `agents.test.ts` |
| Rappels (un seul envoi, pas pour un désisté, seul le plus récent si retard) | `agents.test.ts` |
| **Limitation de débit partagée** (fonction PostgreSQL atomique ; 5 requêtes parallèles pour 3 autorisées → exactement 3) | `test:supabase`, `migrations.test.ts` |
| **Purge automatique** selon la politique de conservation (quotidienne, configurable) | `retention.test.ts`, `test:supabase` |
| Sécurité : type réel des fichiers, HEIC, tailles, scrypt, AES-GCM, état OAuth signé | `core.test.ts`, `integrations.test.ts` |
| **Réception par e-mail** : adresse personnelle signée, webhook Postmark / Mailgun / SendGrid (jeton), texte + .ics + images/PDF, notification et e-mail au compte (jamais à l'expéditeur) | `inbound.test.ts`, appel réel du webhook sur l'application compilée (5 dates proposées à la vérification) |
| Worker (`npm run worker`) : analyses en attente, rappels, e-mails, push, synchronisations, webhooks, purge | `integrations.test.ts` (tick → Outlook), exécution manuelle |

## 🟡 Implémenté, testé contre des API **simulées** (services réels inaccessibles depuis l'environnement de développement)

Les tests vérifient les requêtes exactes envoyées (URL, méthode, en-têtes, contenu) et le traitement des réponses, y compris les erreurs.

| Service | Ce qui est couvert | À faire avec de vrais identifiants |
|---|---|---|
| **OpenAI** (captures, PDF) | JSON valide/invalide/non conforme, image illisible, 429, contenu encadré comme donnée | Évaluer la qualité d'extraction sur de vraies captures |
| **Google Calendar** | OAuth (URL, état, échange, rafraîchissement, révocation), envoi, instances annulées/déplacées, import + conflits, Google Meet, canal webhook | Créer le client OAuth, tester la connexion |
| **Outlook (Microsoft Graph)** | OAuth, conversion des récurrences, envoi, instances, calendarView, validation et clientState des webhooks, envoi via la file du worker | Enregistrer l'application Entra ID |
| **Zoom** | OAuth (Basic), création, lien jamais inventé, annulation répercutée | Créer l'application Zoom |
| **Bot Telegram** | Liaison par lien signé (15 min), messages texte/photo/PDF/.ics, plus grande photo téléchargée, renvois ignorés, groupes ignorés, /stop, secret du webhook | Créer le bot (@BotFather), puis `npm run telegram:webhook` |
| **Fournisseur d'e-mails entrants** | Formats Postmark (JSON), Mailgun et SendGrid (multipart) | Relier un domaine (MX) au fournisseur choisi |

## 🟡 Implémenté, non couvert par un test automatisé
- Pages : modification d'événement, rappels personnalisés, groupes et membres, historique, administration, export de compte, changement d'organisation (y compris la bascule automatique quand on ouvre un import d'une autre église).
- Reprise de l'écran de vérification après rechargement (`?etape=conflits|recap`, choix gardés dans `sessionStorage`) : seule l'étape « recap » est contrôlée par le scénario « double appui ».
- Affichage effectif d'une notification push par un navigateur réel (nécessite l'accès aux serveurs push de Google/Mozilla/Apple).

## Limites assumées
- **WhatsApp** : aucune lecture automatique des conversations (interdit par WhatsApp). On copie/partage le message vers l'app ; une liaison officielle (WhatsApp Business Cloud API, numéro dédié) reste à faire.
- **Messenger** : possible seulement pour une page Facebook (API Messenger Platform), pas pour un compte personnel ; non implémenté.
- **Langues** : l'interface est entièrement en français, comme demandé. L'architecture prévoit d'autres langues (`src/i18n`), mais une partie des textes des pages est écrite directement en français : ajouter une langue demandera de les déplacer dans le dictionnaire.
- Les rendez-vous « journée entière » des calendriers externes ne sont pas comptés comme conflits (choix volontaire : souvent non bloquants).
