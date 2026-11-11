# Instructions pour Claude Code — Studio Reels · Fils du Roi

## Le projet
Outil personnel de Merhawi (artiste « Fils du Roi ») : des vidéos de paroles verticales pour ses chansons chrétiennes générées sur Suno. Utilisateur non technicien, souvent sur téléphone. Réponds en **français**, court et concret. Distingue ce qui est vérifié de ce que tu proposes.

## Architecture
```
src/app.html          ← TOUTE l'appli (HTML + CSS + JS, un seul fichier). On modifie ICI.
src/imgs.json         ← 3 images d'exemple de l'aperçu (data: URI JPEG 405×720)
scripts/build.mjs     ← src/app.html + imgs.json → public/index.html  (ne jamais éditer public/ à la main)
server.mjs            ← serveur local sans dépendance : sert public/, /api/health, /api/claude
lib/claude-core.mjs   ← appel à l'API Claude (partagé local + Netlify)
netlify/functions/api.mjs + netlify.toml ← même API en ligne
video/render.py       ← moteur de montage haute qualité (PIL + numpy + ffmpeg)
video/suno_to_words.py, video/transcribe.py ← paroles calées mot à mot
video/analyse_reel.sh ← étude du style d'un Reel modèle
exemples/             ← words.json des Psaumes 40/91, prompts ChatGPT, commandes
SPEC.md               ← cahier des charges complet de l'interface (à relire avant toute refonte)
```

`src/app.html` tourne dans **deux environnements** :
- comme artifact claude.ai, avec `window.claude.use("sample"|"downloads")` ;
- en autonome, avec `fetch("/api/claude")` et un téléchargement par `<a download>`.

Les adaptateurs sont en haut de la section « Style par description » (`IN_ARTIFACT`, `apiSampler`, `localDownloads`). Garde ces deux chemins fonctionnels.

## Commandes
- `npm start` : construit puis lance http://localhost:8787
- `npm run build` : reconstruit seulement `public/index.html`
- Test rapide sans navigateur : `node --check` sur le JS extrait, puis Playwright (capture 390×844 et 1280×900, aucune `pageerror`).

## Règles
- **Toujours tester avant de livrer** : construire, ouvrir dans Playwright (mobile 390 px), vérifier qu'il n'y a pas d'erreur console, et faire un essai d'export de 5 s avec un MP3 de test (`ffmpeg -f lavfi -i sine=d=12 test.mp3`).
- **Ne jamais publier sur Netlify sans une demande explicite** de Merhawi (ça consomme ses crédits). Préparer, tester, puis attendre son feu vert.
- Ne jamais mettre la clé API dans le code ni dans `public/`. Elle va seulement dans `.env` ou dans les variables d'environnement Netlify.
- Suno : réutiliser les MP3 fournis. Ne jamais télécharger sur Suno ni proposer d'acheter un téléchargement.
- Ne fais aucun lien avec l'emploi salarié de Merhawi : c'est un projet personnel.
- Les règles de qualité vidéo sont dans SPEC.md (§ Moteur). Ne les casse pas en modifiant le moteur.
