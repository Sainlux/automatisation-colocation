# Configuration Outlook (Microsoft 365) et Zoom

## Outlook / Microsoft 365 (Microsoft Graph)

1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
   - Comptes pris en charge : « Comptes dans un annuaire organisationnel et comptes Microsoft personnels » (ou votre seul annuaire).
   - URI de redirection (Web) : `${APP_URL}/api/calendar/outlook/callback`.
2. **Certificates & secrets** → nouveau secret client.
3. **API permissions** → Microsoft Graph, *Delegated* : `offline_access`, `openid`, `email`, `User.Read`, `Calendars.ReadWrite`.
4. Variables : `MS_CLIENT_ID` (Application ID), `MS_CLIENT_SECRET`, `MS_TENANT` (`common` par défaut, ou l'ID de votre annuaire), `TOKEN_ENCRYPTION_KEY`.
5. Paramètres → Connexions → *Connecter Microsoft Outlook*.

Fonctionnement : envoi des événements (récurrences converties, dates annulées supprimées, dates déplacées modifiées), import des rendez-vous « occupé » des 60 prochains jours pour la détection de conflits, abonnement Graph aux changements (renouvelé par le worker avant expiration ; nécessite `APP_URL` en https), synchronisation périodique en secours.

## Zoom

1. marketplace.zoom.us → **Develop → Build App → General App** (OAuth, gestion par l'utilisateur).
2. URL de redirection OAuth : `${APP_URL}/api/calendar/zoom/callback` (ajoutez-la aussi à la liste d'autorisation).
3. Portées : `meeting:write:meeting` (création), `meeting:update:meeting`, `meeting:delete:meeting` (ou l'ancienne portée `meeting:write`).
4. Variables : `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`.
5. Paramètres → Connexions → *Connecter Zoom*, puis sur un événement : *Créer une réunion Zoom*.

Le lien de réunion provient exclusivement de la réponse de Zoom ; un déplacement ou une annulation de l'événement est répercuté sur la réunion.

## Google Meet

Aucune configuration supplémentaire : avec Google Calendar connecté, le bouton *Créer un Google Meet* demande à Google de créer la visioconférence (conferenceData) et enregistre le lien renvoyé.

## Webhooks (mises à jour en temps réel)

Activés automatiquement lorsque `APP_URL` commence par `https://` : canal `events.watch` (Google) et abonnement Graph (Outlook), authentifiés par un jeton secret propre à chaque connexion, renouvelés par le worker 24 h avant expiration. Sans https (développement), la synchronisation périodique (worker, toutes les 15 min) prend le relais.

⚠️ Testé contre des API simulées qui vérifient les requêtes exactes (voir `tests/unit/integrations.test.ts`) ; non testé contre les services réels de Microsoft, Zoom et Google, inaccessibles depuis l'environnement de développement.
