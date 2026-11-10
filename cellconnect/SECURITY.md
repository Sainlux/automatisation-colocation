# Sécurité et protection des données

## Authentification et sessions
- Mode Supabase : Supabase Auth ; l'identité est revalidée à chaque requête (`auth.getUser()`).
- Mode local : mots de passe hachés **scrypt** (sel aléatoire, comparaison à temps constant) ; cookie de session **HttpOnly, SameSite=Lax, Secure en production**, signé HMAC-SHA256, 14 jours. `SESSION_SECRET` obligatoire en production.
- Vérification de mot de passe exécutée même pour un e-mail inconnu (limite l'énumération par mesure de temps).

## Autorisation
- Contexte construit uniquement à partir de la session côté serveur (jamais d'identifiant d'organisation fourni par le client sans vérification d'appartenance).
- Règles centralisées (`src/lib/auth/permissions.ts`) + RLS PostgreSQL (`DATABASE.md`).
- Un événement d'une autre organisation renvoie **404** (pas de révélation d'existence).
- Annulation/modification collective réservée aux personnes autorisées, avec confirmation explicite.

## Protection des requêtes
- **CSRF** : toute requête d'écriture dont l'en-tête `Origin` ne correspond pas à l'hôte est refusée ; cookies SameSite=Lax.
- **Validation** Zod sur toutes les entrées ; requêtes paramétrées (supabase-js) ; aucune concaténation SQL.
- **Limitation de débit** par utilisateur et par route (mémoire du processus : protection de base ; utiliser une solution partagée — p. ex. Upstash ou le pare-feu Vercel — en multi-instances).
- **Idempotence** (`Idempotency-Key`) sur la création en lot, la création d'événement et la résolution de conflits.
- En-têtes : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
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
- **Export** des données (`/api/account/export`) et **suppression du compte** (`DELETE /api/account`).
- **Confidentialité inter-groupes** : un message de désistement ou de demande de changement ne mentionne jamais l'autre événement. Les e-mails des membres ne sont visibles que des administrateurs.
- Sous-traitants à documenter dans votre politique de confidentialité : hébergeur (Vercel), base (Supabase — choisir la région UE/Suisse), OpenAI (images/PDF ; vérifiez vos réglages de rétention), fournisseur SMTP, Google (si connecté).
- Conservation : à définir par l'organisation (recommandation : journaux d'audit 12 mois, analyses 30 jours). Une purge automatique est prévue dans la ROADMAP.

## Secrets
- Uniquement par variables d'environnement ; `.env*` ignorés par git (sauf `.env.example`).
- La clé `SUPABASE_SERVICE_ROLE_KEY` n'est utilisée que côté serveur (`import "server-only"`).
- Jetons OAuth chiffrés **AES-256-GCM** (`TOKEN_ENCRYPTION_KEY`), jamais exportés ni renvoyés au navigateur ; état OAuth signé et lié à l'utilisateur (15 min).
- `/api/cron/tick` protégé par `CRON_SECRET` (comparaison à temps constant).

## Signaler une vulnérabilité
Contactez le responsable du dépôt en privé ; ne publiez pas de détails dans un ticket public.
