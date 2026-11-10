# Feuille de route

## Phases réalisées (MVP)
1. **Fondations** — Next.js 16, TypeScript strict, Tailwind 4, composants style shadcn/ui, auth, navigation responsive.
2. **Capture et extraction** — import images/PDF/texte/.ics, stockage privé, VisionAgent (OpenAI) + analyse locale, progression.
3. **Validation et calendrier** — correction, confirmation, calendrier interne, fiches, export .ics.
4. **Conflits** — détection, interface côte à côte, résolution, désistement, historique des décisions.
5. **Groupes et invitations** — rôles, invitations, réponses, notifications internes et e-mail.
6. **Rappels et synchronisation** — rappels, tâches persistantes, Google Calendar (OAuth, push, pull) *à valider avec de vrais identifiants*.

## Prochaines étapes (ordre conseillé)
1. **Mise en production Supabase** : créer le projet (région UE/Suisse), appliquer la migration, tester inscription + RLS en conditions réelles.
2. **Clé OpenAI** : évaluer l'extraction sur un échantillon de vraies captures (photos floues, plusieurs messages, PDF de programme) ; ajuster le prompt.
3. **Google Calendar** : valider OAuth et synchronisation ; ajouter les canaux de notification Google (webhooks `events.watch` + renouvellement) avec la synchronisation périodique en secours.
4. **Exceptions de récurrence** : annuler/déplacer une seule occurrence (`event_occurrences`).
5. **Invitations par e-mail** à des personnes sans compte (lien signé + inscription).
6. **Notifications push web** (service worker + VAPID) et partage d'images vers l'app (Web Share Target POST).
7. **Outlook** (Microsoft Graph) via la même interface que Google.
8. **Zoom / Google Meet** : création de réunions via les API officielles (MeetingAgent), après connexion du compte.
9. **Exploitation** : limitation de débit partagée, purge automatique (conservation), tableau de bord d'erreurs, BullMQ/Redis si le volume l'exige.
10. **Internationalisation complète** des pages, puis autres langues.
11. **Intégrations de communication** officielles supplémentaires (WhatsApp Business Cloud API si l'organisation y a accès ; jamais de méthode non officielle).
