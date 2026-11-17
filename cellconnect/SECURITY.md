# Sécurité et protection des données

## Authentification et sessions
- Mode Supabase : Supabase Auth ; l'identité est revalidée à chaque requête (`auth.getUser()`).
- Mode local : mots de passe hachés **scrypt** (sel aléatoire, comparaison à temps constant) ; cookie de session **HttpOnly, SameSite=Lax, Secure en production**, signé HMAC-SHA256, 14 jours. Un cookie encore valide d'un compte supprimé est refusé (401) : l'utilisateur est revérifié à chaque requête.
- **`SESSION_SECRET` obligatoire en production, quel que soit le backend** (32 caractères minimum) : il sert aussi à dériver, par HKDF-SHA256, une clé distincte par usage (`oauth-state`, `watch-channel`). Seule exception tolérée : une instance de démonstration locale (`DATA_BACKEND=local` et `APP_URL` absente ou sur `localhost`), où un secret plus court est accepté (tests E2E).
- **`APP_URL` obligatoire et en `https://` en production** (même exception de démonstration locale).
- `TEST_NOW` (date figée pour les tests) est ignoré en production avec Supabase.
- Vérification de mot de passe exécutée même pour un e-mail inconnu (limite l'énumération par mesure de temps).

## Autorisation
- Contexte construit uniquement à partir de la session côté serveur (jamais d'identifiant d'organisation fourni par le client sans vérification d'appartenance).
- Règles centralisées (`src/lib/auth/permissions.ts`) + RLS PostgreSQL (`DATABASE.md`).
- **RLS durcies** (migration `20261119000000_securite_rls.sql`) : toutes les écritures sensibles passent par le serveur (clé service role, règles métier appliquées).
- **Durcissement RLS complémentaire** (migration `20261122000000_rls_durcissement.sql`) : lecture des profils réservée à la personne elle-même et aux administrateurs de son église ; écritures directes (clé anonyme + jeton utilisateur) fermées sur les tables métier, tout passe par le serveur.
  - Invitations : aucune insertion ni mise à jour directe (politiques `invitations_write` et `invitations_respond` supprimées).
  - Participations : la personne peut changer sa réponse, mais un déclencheur refuse toute modification de l'événement, de l'église, de la personne ou du rôle.
  - Captures (`uploads`), analyses (`extraction_jobs`) et dates proposées (`extracted_events`) : lecture seule (plus suppression de ses captures).
- **Acceptation d'une invitation** : avant d'ouvrir l'accès à une église, le serveur vérifie que l'événement et le groupe appartiennent à l'église de l'invitation, que l'inviteur en est membre et qu'il a le droit d'attribuer le rôle prévu (seul un administrateur peut faire entrer quelqu'un autrement qu'en invité). Le lien est réservé de façon atomique (usage unique, même en cas de double clic) et redevient utilisable si l'acceptation échoue.
- **Pas d'énumération des comptes** : « Ajouter un membre » envoie toujours une invitation (lien à usage unique) et renvoie la même réponse, que l'adresse corresponde à un compte ou non.
- Annuaire : un invité ne voit pas la liste des membres ; les e-mails d'un groupe ne sont visibles que de ses responsables et des administrateurs.
- Un événement d'une autre organisation renvoie **404** (pas de révélation d'existence).
- Annulation/modification collective réservée aux personnes autorisées, avec confirmation explicite.

## Protection des requêtes
- **CSRF** : toute requête d'écriture dont l'en-tête `Origin` ne correspond pas à l'hôte est refusée ; cookies SameSite=Lax.
- **Validation** Zod sur toutes les entrées (messages en français) ; requêtes paramétrées (supabase-js) ; aucune concaténation SQL. Un identifiant d'URL (`id`, `…Id`) qui n'est pas un UUID donne 404 avant tout accès aux données.
- **Limitation de débit** par utilisateur et par route, **partagée entre instances** en mode Supabase (fonction PostgreSQL atomique `rate_limit_hit`, exécutable uniquement par le serveur) ; en mémoire en mode local (éviction des clés les plus anciennes). Connexion : limite supplémentaire par compte visé (5 essais / 15 min). Ajout de membres et invitations par e-mail : 10 / min.
- **Adresse IP du client** : `X-Real-IP` n'est lu que sur Vercel ou si `TRUST_REAL_IP=1` (proxy qui réécrit cet en-tête) ; sinon l'entrée de `X-Forwarded-For` ajoutée par le proxy de confiance (`TRUST_PROXY_HOPS`, 1 par défaut). Les valeurs fournies par le client sont ignorées.
- **Clés de limitation de débit** : hachées avant stockage (aucune adresse IP ni e-mail en clair dans `rate_limits`) et purgées après un jour.
- **Idempotence** (`Idempotency-Key`) sur la création en lot, la création d'événement et la résolution de conflits : la clé est réservée **avant** l'exécution (deux requêtes simultanées n'exécutent l'opération qu'une fois, la seconde reçoit 409) et libérée si l'opération échoue.
- **Taille des envois** : `Content-Length` obligatoire pour l'envoi de captures (411 sinon) ; le webhook e-mail lit le corps avec une borne de 30 Mo.
- En-têtes : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` ; en production, `Strict-Transport-Security` (2 ans, sous-domaines) et **Content-Security-Policy** : `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; worker-src 'self'` (`'unsafe-inline'` reste nécessaire aux scripts d'hydratation de Next.js sans nonce).
- Liens de réunion : `https://` uniquement (contrainte SQL + validation) ; domaines inhabituels signalés.

## Fichiers importés
- Type vérifié par **signature binaire** (PNG, JPEG, WebP, PDF), pas par l'extension ; HEIC refusé côté serveur avec explication (converti côté navigateur quand c'est possible).
- Tailles limitées (configurables) ; nombre de fichiers par analyse limité.
- Stockage **privé** (hors `/public` en local, bucket privé Supabase) ; jamais d'URL publique.
- Les images sont ré-encodées dans le navigateur (≤ 2048 px) : les métadonnées EXIF (dont la position GPS) sont supprimées avant envoi.

## IA et injection de consignes
- Le contenu analysé est encadré comme **donnée** ; le message système interdit d'exécuter les consignes qu'il contient.
- Le modèle n'a **aucun outil** ; sa sortie est contrainte par un schéma JSON strict puis revalidée par Zod.
- Aucune action n'est déclenchée par l'extraction : tout passe par la validation humaine.
- Rien n'est inventé : année, heure de fin et liens absents restent vides ; une année proposée est justifiée et doit être confirmée.

## Données personnelles (nLPD suisse, RGPD)
Les captures WhatsApp peuvent contenir noms, numéros et messages privés.
- **Minimisation** : le texte collé est analysé localement ; seules les images/PDF sont transmis à OpenAI, et seulement si une clé est configurée. Le prompt demande de ne pas recopier de numéros de téléphone.
- **Suppression après analyse** activée par défaut (paramètre utilisateur) ; suppression manuelle possible à tout moment.
- **Export** des données (`/api/account/export`) et **suppression du compte** (`DELETE /api/account`). Les tables personnelles sont listées une fois (`USER_SCOPED_TABLES`, `ORG_SCOPED_TABLES` dans `src/lib/db/store.ts`, vérifiées à la compilation). L'effacement est refusé tant que la personne est le seul administrateur d'une église qui a d'autres membres ; ce qu'elle a créé pour le collectif (rencontres, groupes) est transmis à un administrateur, le reste est effacé, ainsi que le dossier de fichiers de son espace personnel.
- **Confidentialité inter-groupes** : un message de désistement ou de demande de changement ne mentionne jamais l'autre événement. Les e-mails des membres ne sont visibles que des administrateurs.
- Sous-traitants à documenter dans votre politique de confidentialité : hébergeur (Vercel), base (Supabase — choisir la région UE/Suisse), OpenAI (images/PDF ; vérifiez vos réglages de rétention), fournisseur SMTP, Google (si connecté).
- **Conservation** : purge automatique quotidienne (analyses et fichiers 30 j, notifications lues 180 j, conflits clos 180 j, rappels 90 j, journal d'audit 365 j…), durées configurables (`RETENTION_*`).

## Secrets
- Uniquement par variables d'environnement ; `.env*` ignorés par git (sauf `.env.example`).
- La clé `SUPABASE_SERVICE_ROLE_KEY` n'est utilisée que côté serveur (`import "server-only"`).
- Jetons OAuth chiffrés **AES-256-GCM** (`TOKEN_ENCRYPTION_KEY`), jamais exportés ni renvoyés au navigateur ; état OAuth signé et lié à l'utilisateur (15 min).
- `/api/cron/tick` protégé par `CRON_SECRET` (comparaison à temps constant).
- Webhooks Google / Microsoft authentifiés par un jeton secret propre à chaque connexion (HMAC avec une clé dérivée dédiée), vérifié à temps constant ; ils ne déclenchent qu'une resynchronisation, jamais une action fournie par l'appelant. Les canaux créés avant la dérivation HKDF sont refusés jusqu'à leur renouvellement (au plus tard 7 jours) ; la synchronisation de secours couvre l'intervalle.
- Invitations par e-mail : jeton aléatoire de 256 bits, seule son empreinte SHA-256 est stockée, usage unique, expiration 30 jours ; la page publique n'affiche que le strict nécessaire (adresse masquée).
- Push : contenu chiffré de bout en bout (aes128gcm) ; abonnements expirés désactivés automatiquement.

## Signaler une vulnérabilité
Contactez le responsable du dépôt en privé ; ne publiez pas de détails dans un ticket public.
