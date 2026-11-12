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
projets/<slug>/       ← chansons créées par Claude (projet.json, chanson.mp3, 1.jpg…) + projets/index.json ; copiés dans public/ par le build
video/nouveau_projet.py ← range une chanson + images + synchro dans projets/
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
- Suno : réutiliser les MP3 fournis. Ne jamais proposer d'acheter un téléchargement ni dépenser un crédit de téléchargement. **Exception accordée par Merhawi (12/11/2026)** : récupérer le fichier d'une chanson que Claude vient de générer pour le Studio, via l'adresse d'écoute (`audio_url` de `audio-wait` / `audio-retrieve`), jamais via `audio-download` avec `confirm: true`.
- Ne fais aucun lien avec l'emploi salarié de Merhawi : c'est un projet personnel.
- Les règles de qualité vidéo sont dans SPEC.md (§ Moteur). Ne les casse pas en modifiant le moteur.

## Générer une chanson de A à Z (demande copiée depuis l'appli)
Merhawi colle une demande « Crée une chanson pour mon Studio Reels » (titre, paroles ou idée, style, nombre d'images, lumière). Procédure :
1. **Paroles** : s'il n'a donné qu'une idée, écris les paroles (français, couplets courts, refrain fort, sans répétition de « [Verse] » dans le texte chanté) et montre-les-lui avant de générer.
2. **Musique (Suno, ~10 crédits)** : `audio-create` en mode custom (`lyrics`, `style`, `title`), une seule fois (2 versions). `audio-wait` avec les deux `ids`, `until: "complete"`. Fais-lui écouter les deux versions (`song_url`) et laisse-le choisir.
3. **Synchro** : `audio-lyrics-alignment` sur la version choisie (relancer tant que `processing`) ; enregistre la réponse brute en JSON.
4. **Fichier MP3** : télécharge l'`audio_url` de la version choisie (exception ci-dessus). Jamais `audio-download` avec `confirm: true`.
5. **Images (Higgsfield, 0,25 crédit l'image)** : découpe les paroles en N passages, une scène par passage, gabarit de SPEC.md § Étape 4 (« Crée une photo cinématographique verticale au format 9:16. » + lumière + scène + « … centre simple pour le texte. Aucune personne, aucun texte, aucune lettre. »). `generate_image_batch` (modèle `gpt_image_2_6`, `aspect_ratio: "9:16"`), puis `jobs_wait` ; télécharge les URL.
6. **Ranger** : `python video/nouveau_projet.py --titre "…" --mp3 chanson.mp3 --images 1.png 2.png … --alignement alignement.json --paroles paroles.txt`
7. **Publier dans le Studio** : `npm run build`, puis republier l'artifact Studio Reels avec la page et les fichiers `projets/…` (option `files`). La chanson apparaît dans « Chansons créées par Claude » ; il touche « Charger », choisit un style et crée la vidéo.
8. Commit + push (le dossier `projets/` est versionné). Toujours dire combien de crédits ont été dépensés.

Réseau : les étapes 4 et 5 demandent que l'environnement autorise les serveurs de fichiers de Suno et de Higgsfield. Sans cet accès, s'arrêter après l'étape 3 et le dire.
