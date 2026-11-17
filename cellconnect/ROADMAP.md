# Feuille de route

## Réalisé
- MVP complet (phases 1 à 6 du cahier des charges).
- Validation en conditions réelles du mode Supabase (Auth, PostgreSQL, Storage, RLS, SMTP).
- Exceptions de récurrence ; invitations par e-mail ; notifications push ; partage vers l'application.
- Outlook (Graph), Zoom, Google Meet, webhooks des calendriers.
- Limitation de débit partagée ; purge selon la politique de conservation.

## Mise en service (actions de votre côté)
1. Projet Supabase en région européenne → appliquer `supabase/migrations` (docs/SUPABASE.md).
2. Clé OpenAI → tester l'extraction sur un échantillon de vraies captures (docs/OPENAI.md).
3. SMTP (Infomaniak, Brevo, Postmark…) → `SMTP_*`.
4. Clés VAPID (`npm run vapid`) pour les notifications push.
5. Si souhaité : Google, Microsoft, Zoom (docs/GOOGLE_CALENDAR.md, docs/OUTLOOK_ZOOM.md).
6. Déploiement Vercel + worker ou cron (docs/DEPLOIEMENT.md).

## Évolutions possibles
- Traduction de l'interface (allemand, anglais, italien…) après extraction des textes dans `src/i18n`.
- Désistement d'une seule date d'une série (aujourd'hui : désistement de toute la série ou annulation d'une date par l'organisateur).
- Application mobile native (la PWA couvre déjà l'installation, le push et le partage).
- WhatsApp Business Cloud API (canal officiel) si l'organisation y a accès.
- Tableau de bord d'exploitation (erreurs, livraisons, synchronisations).
