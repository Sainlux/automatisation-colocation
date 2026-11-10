# Architecture

## Vue d'ensemble

```
Navigateur (pages client React, mobile-first)
   │  fetch JSON (cookies HttpOnly, même origine)
   ▼
Route Handlers /api/*  ── enveloppe api() : session, CSRF, débit, erreurs, idempotence
   ▼
Agents (src/lib/agents)  ── logique métier + autorisations (src/lib/auth/permissions.ts)
   ▼
Store (interface)  ──►  LocalStore (JSON privé)   |   SupabaseStore (PostgreSQL + RLS)
                         Stockage fichiers : .data/uploads   |   bucket Supabase privé
Worker (npm run worker ou /api/cron/tick) ── rappels, e-mails, reprises, synchronisation
```

Les pages sont des composants client qui consomment l'API : aucune donnée personnelle n'est pré-rendue. L'option Cache Components de Next.js 16 n'est donc pas activée.

## Agents

Les agents sont des **modules spécialisés** coordonnés par un orchestrateur. Un seul appel au modèle IA est fait par analyse ; tout le reste est déterministe. Les agents IA **proposent**, le backend **exécute** après validation explicite de l'utilisateur.

| Agent | Fichier | Rôle | IA ? |
|---|---|---|---|
| AIOrchestrator | `orchestrator.ts` | Réception, pipeline d'extraction, création en lot | non |
| VisionAgent | `vision-agent.ts` | Images/PDF → JSON strict (OpenAI) ; texte → analyseur local | oui (images/PDF) |
| (analyseur local) | `text-parser.ts` | Dates françaises, horaires, listes numérotées, notes | non |
| ValidationAgent | `validation-agent.ts` | Champs manquants, année proposée et justifiée, liens sûrs | non |
| ConflictManagerAgent | `conflict-engine.ts`, `conflict-agent.ts`, `conflict-resolution.ts` | Chevauchements, récurrences, temps de déplacement, résolution | non |
| CalendarAgent | `calendar-agent.ts` | Création, modification, annulation collective, désistement | non |
| InvitationAgent | `invitation-agent.ts` | Invitations personnes / groupes, réponses | non |
| NotificationAgent | `notification-agent.ts` | Interne + e-mail, anti-doublon, nouvelles tentatives | non |
| ReminderAgent | `reminder-agent.ts` | Rappels 24 h / 2 h / 30 min / personnalisés | non |
| GroupAgent | `group-agent.ts` | Groupes, membres, rôles d'organisation | non |
| MeetingAgent | — | Liens Zoom/Meet conservés et affichés ; création via API prévue (ROADMAP) | — |

### Choix du fournisseur d'extraction

1. Fichier `.ics` → lecteur iCalendar.
2. Texte seul → analyseur local d'abord (rien n'est envoyé à l'IA) ; si aucun événement complet n'est reconnu et qu'une clé est configurée → IA.
3. Images / PDF → OpenAI (`OPENAI_MODEL`). Sans clé : erreur explicite, jamais de résultat simulé.

L'interface `ExtractionProvider` permet d'ajouter d'autres fournisseurs (Anthropic, Mistral, modèle local).

## Parcours capture → agenda

1. `POST /api/uploads` : vérification du type réel (signature binaire), stockage privé, création de `extraction_jobs` (étape *Fichier reçu*).
2. `POST /api/extract-events` : l'analyse s'exécute après la réponse (`after()`), le client suit la progression (`GET /api/extract-events/:id`). Le worker reprend les analyses interrompues.
3. ValidationAgent produit des brouillons (`extracted_events`) avec problèmes signalés. L'utilisateur corrige ; les avertissements exigent une confirmation explicite.
4. `POST /api/conflicts/check` : comparaison avec l'agenda **avant** toute création.
5. Choix par conflit : garder les deux, ne pas ajouter, ou se désister de l'événement existant (avec message facultatif à l'organisateur).
6. Récapitulatif → `POST /api/events/batch` (clé d'idempotence) : création, désistements, rappels, conflits restants enregistrés, notifications, synchronisation externe mise en file.

## Détection des conflits

- Règle : `startA < endB && startB < endA`, sur des instants UTC (ms). Consécutifs = pas de conflit.
- Un conflit est **toujours personnel** : il faut un même utilisateur avec une participation active (invité, accepté, peut-être) aux deux événements. Deux groupes sans membre commun ne sont jamais en conflit.
- Récurrences (RRULE) développées en **heure murale** du fuseau de l'événement (20h30 reste 20h30 après le changement d'heure).
- Temps de déplacement optionnel par utilisateur → conflit de type `travel_buffer`.
- Déclencheurs : création, modification/déplacement, acceptation d'invitation, invitation reçue, synchronisation Google (pull). Les conflits devenus obsolètes sont clos automatiquement.

## Désistement ≠ annulation

| Action | Qui | Effet |
|---|---|---|
| Désistement (`/withdraw`) | tout participant | sa participation → `withdrawn`, ses rappels supprimés ; l'événement est **maintenu** pour les autres. Événement purement personnel (aucun autre participant) : retiré. |
| Refus d'invitation | invité | participation → `declined` |
| Annulation collective (`DELETE ?confirm=true`) | organisateur, responsable du groupe, admin | événement `cancelled`, rappels supprimés, participants notifiés |
| Déplacement (`PATCH`) | idem | nouvelle vérification des conflits, rappels reprogrammés, participants notifiés |
| Proposition de créneau / demande de changement | participant | notification à l'organisateur, sans modifier l'événement |

## Tâches persistantes

Pas de Redis : l'état est en base (`extraction_jobs`, `reminders`, `notification_deliveries`, `agent_tasks`). `tick()` est idempotent et peut être lancé par le worker (boucle de 30 s) ou par le cron Vercel. BullMQ/Redis restent possibles si le volume l'exige (ROADMAP).

## Internationalisation

Libellés dans `src/i18n/fr.ts` (type `Messages`). Ajouter une langue = un nouveau fichier de même structure + enregistrement dans `src/i18n/index.ts`. Certains textes de pages sont encore écrits directement en français (voir ROADMAP).
