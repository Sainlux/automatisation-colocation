# CellConnect AI

Transformez une capture d'écran (WhatsApp, Telegram, e-mail…), un PDF ou un texte collé en **événements organisés** : extraction des dates, vérification par l'utilisateur, détection des conflits d'agenda, rappels, invitations et notifications.

Conçu d'abord pour les églises, cellules maison et responsables de groupes ; architecture multi-organisations prête pour les associations, écoles et entreprises. Interface entièrement en français, mobile-first, fuseau par défaut **Europe/Zurich**.

> Ce dossier est un projet autonome. L'application de gestion locative située à la racine du dépôt n'est pas concernée.

## Démarrage rapide (mode local, sans aucun service externe)

```bash
cd cellconnect
npm install
cp .env.example .env.local      # facultatif en développement
npm run dev                     # http://localhost:3000
```

Créez un compte, ouvrez **Nouvelle capture → Texte collé**, collez par exemple :

```
Formation Cellules « Zoom »
1. Lundi 16 novembre 20h30 - 22h
2. Lundi 14 décembre 20h30 - 22h
3. Mercredi 20 janvier 20h30 - 22h
```

L'année absente est **proposée et justifiée** (« le 20 janvier tombe un mercredi en 2027 »), puis doit être confirmée.

En mode local, les données sont stockées dans `.data/` (fichier JSON privé + captures), ce qui convient à la démonstration et au développement sur une seule instance.

| Fonction | Sans configuration | Avec configuration |
|---|---|---|
| Texte collé, fichiers .ics | ✅ analyse locale, sans IA | — |
| Captures d'écran, photos, PDF | ❌ message explicite | `OPENAI_API_KEY` |
| E-mails | statut « Non envoyé » affiché | `SMTP_*` |
| Google Calendar | bouton désactivé + explication | `GOOGLE_*`, `TOKEN_ENCRYPTION_KEY` |
| Base PostgreSQL multi-instances | stockage local | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` |

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement / build / production |
| `npm run worker` | Tâches de fond (rappels, e-mails, reprises, synchronisation) — `-- --once` pour un passage |
| `npm test` | Tests unitaires et d'intégration (Vitest, dont migrations SQL dans PostgreSQL/PGlite) |
| `npm run test:e2e` | Parcours complet dans Chromium (mobile + ordinateur) — nécessite `npm run build` |
| `npm run check` | Types + lint + tests |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — agents, flux, choix techniques
- [DATABASE.md](DATABASE.md) — modèle de données, RLS
- [SECURITY.md](SECURITY.md) — sécurité et protection des données (nLPD / RGPD)
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — ce qui est fait, testé, en attente
- [ROADMAP.md](ROADMAP.md) — suite du développement
- Guides : [Supabase](docs/SUPABASE.md) · [OpenAI](docs/OPENAI.md) · [Google Calendar](docs/GOOGLE_CALENDAR.md) · [Déploiement](docs/DEPLOIEMENT.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · composants au style shadcn/ui · Lucide · FullCalendar 6 · Zod · Luxon · rrule · Supabase (PostgreSQL, Auth, Storage, RLS) · OpenAI (vision, sorties JSON strictes) · Vitest · Playwright.
