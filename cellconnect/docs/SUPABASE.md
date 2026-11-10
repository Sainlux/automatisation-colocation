# Configuration Supabase

1. Créez un projet sur supabase.com — choisissez une région européenne (ex. Zurich `eu-central-2` si disponible, sinon Francfort).
2. **SQL Editor** → collez et exécutez `supabase/migrations/20261110000000_initial_schema.sql` (ou `supabase db push` avec la CLI). La migration crée aussi le bucket privé `captures`.
3. **Authentication → Providers → Email** : activez e-mail + mot de passe. Activez la confirmation d'e-mail si souhaité (l'interface l'indique alors après l'inscription). Dans *URL Configuration*, mettez `APP_URL` comme Site URL.
4. **Project Settings → API** : copiez dans vos variables d'environnement
   - `NEXT_PUBLIC_SUPABASE_URL` (URL du projet)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé anon / publishable)
   - `SUPABASE_SERVICE_ROLE_KEY` (clé service_role / secret — **serveur uniquement**)
5. Redémarrez l'application : `/api/health` doit indiquer `"backend":"supabase"`.

## Développement local (sans compte Supabase)

Avec Docker installé :

```bash
npx supabase start          # base, Auth, API, Storage, Mailpit (SMTP de test) ; applique les migrations
npx supabase status         # affiche l'URL et les clés locales (clés de démonstration publiques)
```

Renseignez ces valeurs dans `.env.local` (`DATA_BACKEND=supabase`), et pour les e-mails `SMTP_HOST`/`SMTP_PORT` vers Mailpit (interface web : http://127.0.0.1:54324). Les tests d'intégration se lancent avec `SUPABASE_IT=1 npm run test:supabase`.

Vérifications conseillées : créer deux comptes, vérifier qu'aucun ne voit les événements de l'autre ; dans le SQL Editor, `select * from events` avec le rôle `authenticated` ne doit rien renvoyer sans JWT.
