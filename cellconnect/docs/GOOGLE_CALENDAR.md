# Configuration Google Calendar

1. console.cloud.google.com → nouveau projet → **APIs & Services → Library** : activez *Google Calendar API*.
2. **OAuth consent screen** : type *External*, nom « CellConnect AI », portées `.../auth/calendar.events`, `openid`, `email`. Ajoutez vos comptes de test tant que l'application n'est pas validée par Google.
3. **Credentials → Create credentials → OAuth client ID** (*Web application*). URI de redirection autorisée : `${APP_URL}/api/calendar/google/callback` (ex. `https://cellconnect.example.ch/api/calendar/google/callback`, et `http://localhost:3000/api/calendar/google/callback` en développement).
4. Variables : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (32 octets base64 : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), `APP_URL`.
5. Paramètres → Connexions aux calendriers → *Connecter un compte Google*.

Comportement :
- **Envoi** : chaque création/modification/annulation d'un événement auquel vous participez est mise en file (`agent_tasks`) puis poussée par le worker vers votre calendrier principal (identifiant externe conservé : pas de doublon).
- **Import** : les événements Google des 60 prochains jours sont importés comme événements privés pour la détection de conflits (bouton *Synchroniser* ou worker toutes les 15 min / cron `?pull=1`). Les événements créés par CellConnect ne sont pas réimportés.
- Jetons chiffrés AES-256-GCM ; *Déconnecter* efface les jetons. Vous pouvez aussi révoquer l'accès sur myaccount.google.com/permissions.

⚠️ Non testé contre l'API réelle à ce jour (voir IMPLEMENTATION_STATUS.md).
