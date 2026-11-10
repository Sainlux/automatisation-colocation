# État d'implémentation

Dernière vérification : 10 novembre 2026 — `npm run check` (types, lint, **56 tests Vitest**), `npm run build`, `npm run test:e2e` (**4 tests Playwright**, mobile + ordinateur) : tout passe.

## ✅ Implémenté et testé

| Fonction | Preuve |
|---|---|
| Inscription, connexion, déconnexion (mode local), redirection des visiteurs non connectés, 401 sur l'API | E2E, `core.test.ts` (sessions signées) |
| Import de texte collé + analyse locale française (listes numérotées, « 20h30 - 22h », jour de semaine, notes « ⚠️ vacances », liens) | `text-parser.test.ts`, E2E (capture WhatsApp à 5 formations) |
| Proposition d'année justifiée par le jour de semaine, confirmation obligatoire | `core.test.ts`, E2E |
| Correction des brouillons, blocage tant que les champs incertains ne sont pas confirmés | E2E |
| Vérification de l'agenda **avant** création ; choix par conflit ; récapitulatif ; création idempotente en lot | `agents.test.ts`, E2E |
| Calendrier interne (jour / semaine / mois / liste), fuseau Europe/Zurich, heure d'été/hiver | `core.test.ts`, E2E, captures d'écran vérifiées |
| Détection : chevauchement partiel/complet, consécutifs exclus, temps de déplacement, récurrences après changement d'heure, isolation entre personnes | `agents.test.ts`, `core.test.ts` |
| Résolution : maintenir A/B (désistement), garder les deux, reporter, proposer un créneau, demander un changement | `agents.test.ts`, E2E (maintenir A) |
| **Désistement personnel ne supprime pas l'événement collectif** ; message à l'organisateur sans mention de l'autre événement | `agents.test.ts` |
| Annulation collective : interdite à un participant, confirmation exigée, participants notifiés, rappels supprimés | `agents.test.ts` |
| Déplacement : rappels reprogrammés, participants notifiés | `agents.test.ts` |
| Groupes, rôles, invitations de groupe, réponses Oui/Non/Peut-être | `agents.test.ts` |
| Notifications internes ; anti-doublon ; e-mail : envoi, échec, nouvelle tentative, échec définitif, état « non configuré » | `agents.test.ts` (canal e-mail simulé dans les tests) |
| Rappels : un seul envoi, aucun pour un participant désisté, seul le plus récent si le worker a du retard | `agents.test.ts` |
| Isolation entre organisations (service + RLS PostgreSQL) | `agents.test.ts`, `migrations.test.ts` |
| Migrations SQL appliquées dans PostgreSQL, contraintes, RLS | `migrations.test.ts` (PGlite) |
| VisionAgent : JSON valide/invalide/non conforme, image illisible, erreur 429, contenu encadré comme donnée, aucun outil | `core.test.ts` (client OpenAI simulé) |
| Export / import iCalendar | `core.test.ts`, E2E |
| Sécurité : type réel des fichiers, HEIC, taille, CSRF, limitation de débit, scrypt, AES-GCM | `core.test.ts`, test manuel (`curl` : 401 et origine refusée) |
| Worker (`npm run worker -- --once`) | exécuté manuellement |

## 🟡 Implémenté mais non testé automatiquement

- Pages : fiche événement (modifier, inviter, rappels personnalisés, annulation, WhatsApp), groupes et membres, invitations, notifications, historique, paramètres, administration, connexions calendriers — compilées et vérifiées par le build ; seules certaines ont été ouvertes manuellement.
- Import d'images/PDF dans l'interface (préparation côté navigateur, conversion HEIC Safari) : nécessite une clé OpenAI.
- Export des données personnelles et suppression de compte.
- Changement d'organisation, création d'organisation.
- Partage de texte vers l'app (Web Share Target du manifeste PWA).

## ⏳ En attente de configuration externe (code prêt, jamais exécuté contre le service réel)

| Service | Variables | Remarque |
|---|---|---|
| **Supabase** (PostgreSQL, Auth, Storage) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Le schéma est testé dans PostgreSQL ; `SupabaseStore` et l'auth Supabase ne sont pas testés contre un projet réel. Voir docs/SUPABASE.md. |
| **OpenAI** (captures, PDF) | `OPENAI_API_KEY` | Testé avec un client simulé uniquement. Qualité d'extraction réelle à évaluer sur vos captures. |
| **SMTP** | `SMTP_*` | Logique testée avec un canal simulé. |
| **Google Calendar** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | OAuth, push, pull, chiffrement : non testés contre Google. |
| **Vercel Cron** | `CRON_SECRET` | Toutes les 5 min dans `vercel.json` : nécessite un plan Vercel payant (sinon quotidien, ou worker séparé). |

## 🔜 Prévu pour une version ultérieure

Outlook (Microsoft Graph), création de réunions Zoom / Google Meet, notifications push web, webhooks Google (notifications push de changements), exceptions de récurrence (`event_occurrences`), invitations par e-mail à des personnes sans compte, limitation de débit partagée, purge automatique selon la politique de conservation, traduction complète des libellés, application mobile native. Détails dans ROADMAP.md.
