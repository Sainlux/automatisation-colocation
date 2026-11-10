# Déploiement

## Vercel (application) + Supabase (données)

1. Configurez Supabase (docs/SUPABASE.md).
2. Sur Vercel : *New Project* → importez le dépôt → **Root Directory : `cellconnect`** (le dépôt contient une autre application à la racine).
3. Variables d'environnement (Production) : celles de `.env.example`, au minimum `APP_URL` (en https : active les webhooks), `SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ; puis selon les besoins `OPENAI_API_KEY`, `SMTP_*`, `VAPID_*`, `GOOGLE_*`, `MS_*`, `ZOOM_*`, `TOKEN_ENCRYPTION_KEY`.
4. Déployez. Vérifiez `https://<domaine>/api/health`.

⚠️ Ne déployez pas en mode local (`DATA_BACKEND=local`) sur Vercel : le système de fichiers n'y est pas persistant.

## Tâches de fond

Deux options (l'état est en base, les deux sont compatibles) :
- **Vercel Cron** (`vercel.json`) : `/api/cron/tick?pull=1` toutes les 5 minutes — nécessite un plan payant ; sur le plan gratuit, réglez une fréquence quotidienne et utilisez l'option suivante pour des rappels précis.
- **Worker séparé** (Railway, Fly.io, Render, VM) : même dépôt, dossier `cellconnect`, commande `npm ci && npm run worker`, mêmes variables d'environnement.

Un appel manuel est possible : `curl -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/tick`.

## Auto-hébergement (une seule instance, démonstration)

```bash
cd cellconnect && npm ci && npm run build
SESSION_SECRET=... DATA_BACKEND=local DATA_DIR=/var/lib/cellconnect npm start   # application
SESSION_SECRET=... DATA_BACKEND=local DATA_DIR=/var/lib/cellconnect npm run worker  # rappels
```
Placez un proxy HTTPS (Caddy, nginx) devant le port 3000.
