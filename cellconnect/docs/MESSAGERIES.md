# Recevoir des messages par e-mail et Telegram

Un responsable transfère un message qui contient des dates ; CellConnect le lit et propose les dates **à vérifier**. Rien n'est ajouté à l'agenda sans validation dans l'app. Le texte est d'abord lu sans IA ; l'IA (si configurée) n'intervient que pour les images et PDF.

Chaque utilisateur trouve ses réglages dans **Plus › Paramètres › Recevoir des messages**.

## 1. E-mail

Chaque compte a une adresse personnelle, signée (impossible à deviner) :

```
agenda+<identifiant><signature>@<INBOUND_EMAIL_DOMAIN>
```

### Mise en place
1. Choisir un fournisseur d'e-mails entrants : **Postmark** (Inbound), **Mailgun** (Routes) ou **SendGrid** (Inbound Parse). Tous sont acceptés.
2. Réserver un sous-domaine, par exemple `in.votre-domaine.ch`, et créer l'enregistrement **MX** indiqué par le fournisseur.
3. Générer deux secrets : `openssl rand -hex 24` (deux fois).
4. Variables d'environnement :
   ```
   INBOUND_EMAIL_DOMAIN=in.votre-domaine.ch
   INBOUND_EMAIL_SECRET=<secret 1>
   INBOUND_EMAIL_WEBHOOK_TOKEN=<secret 2>
   ```
5. Chez le fournisseur, faire suivre les e-mails reçus vers :
   ```
   https://<APP_URL>/api/inbound/email?token=<secret 2>
   ```
   - Postmark : *Inbound webhook URL* (format JSON).
   - Mailgun : route `match_recipient(".*@in.votre-domaine.ch")` → `forward("<URL>")`.
   - SendGrid : *Inbound Parse*, sans cocher « POST the raw, full MIME message ».

### Comportement
- Texte de l'e-mail (objet + corps), pièces jointes **.ics**, **images** (PNG, JPEG, WebP) et **PDF** sont analysés ; les petites images (logos de signature) sont ignorées.
- Le résultat est envoyé **à l'adresse du compte** (notification dans l'app + e-mail si SMTP est configuré), jamais à l'expéditeur (qui pourrait être usurpé).
- Adresse inconnue ou contenu vide : ignoré (réponse 200 pour éviter les renvois en boucle). Mauvais jeton : 401.
- 20 messages par minute et par compte au maximum.
- Changer `INBOUND_EMAIL_SECRET` invalide toutes les adresses personnelles.

## 2. Telegram

### Mise en place
1. Dans Telegram, écrire à **@BotFather** : `/newbot`, choisir un nom (ex. « CellConnect ») et un identifiant (ex. `CellConnectEgliseBot`). Il fournit le **jeton** du bot.
2. Variables d'environnement :
   ```
   TELEGRAM_BOT_TOKEN=<jeton fourni par BotFather>
   TELEGRAM_BOT_USERNAME=CellConnectEgliseBot
   TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>
   ```
3. Une fois l'application en ligne (APP_URL en https) : `npm run telegram:webhook`.

### Comportement
- L'utilisateur touche **Connecter Telegram** dans les Paramètres : Telegram s'ouvre sur le bot avec un code signé, valable 15 minutes. « Démarrer » relie la conversation au compte.
- Ensuite, il **transfère** au bot un message, une capture d'écran, un PDF ou un fichier .ics. Le bot répond « Reçu », puis « 5 dates trouvées » avec un bouton **Vérifier les dates**.
- `/stop` délie le compte ; `/aide` rappelle le fonctionnement.
- Conversations privées uniquement : le bot ignore les groupes.
- Chaque mise à jour n'est traitée qu'une fois (Telegram renvoie celles qui n'ont pas été acquittées).
- Plusieurs photos envoyées ensemble (album) arrivent en plusieurs messages : chacune donne une analyse distincte.

## 3. WhatsApp et Messenger

- **WhatsApp** n'autorise pas la lecture automatique de vos conversations ou groupes. Aujourd'hui : copier ou partager le message vers CellConnect. Plus tard : un numéro dédié via l'**API WhatsApp Business (Cloud API)** de Meta, auquel on transfère les messages (compte Meta Business, numéro de téléphone, conversations potentiellement payantes).
- **Messenger** : seulement pour une **page Facebook** (Messenger Platform), pas pour un compte personnel.

## Sécurité et données
- Les contenus reçus sont stockés comme les imports manuels (stockage privé, purge selon la politique de conservation).
- Les secrets ne sont jamais renvoyés au navigateur ; les comparaisons sont à temps constant.
- La suppression du compte supprime aussi la liaison Telegram.
