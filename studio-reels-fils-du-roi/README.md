# Studio Reels · Fils du Roi

Appli pour transformer une chanson en **vidéo de paroles verticale (Reel 9:16)**. On y met sa musique, ses paroles et ses images, puis on choisit un style. La vidéo est créée directement dans le navigateur.

Ce dossier contient tout :
- l'**interface** (même appli que l'artifact claude.ai, en version autonome) ;
- le **moteur de montage haute qualité** en Python (`video/`) ;
- les **exemples** des Psaumes 40 et 91.

## 1. Lancer l'interface sur ton ordinateur

Il faut Node.js 18 ou plus récent ([nodejs.org](https://nodejs.org)).

```bash
cp .env.example .env      # puis colle ta clé API Claude dans .env (facultatif)
npm start                 # construit public/index.html et lance le serveur
```

Ouvre ensuite **http://localhost:8787** dans Chrome ou Safari.

- **Sans clé API**, tout marche, sauf « Décris ton style » et « Écrire les prompts ». Les 18 styles prêts, la synchro et l'export vidéo restent disponibles.
- **Avec la clé**, Claude crée le style à partir de ta description et écrit les prompts ChatGPT à partir de tes paroles. La clé se crée sur console.anthropic.com et reste sur ton ordinateur, dans `.env`. Chaque demande est facturée sur ton compte API.

## 2. Mettre en ligne sur Netlify (quand tu le décides)

1. Dépose le dossier sur GitHub, puis « Add new site » dans Netlify. La configuration (`netlify.toml`) est déjà prête.
2. Netlify > Site settings > Environment variables : ajoute `ANTHROPIC_API_KEY`.
3. Attention : un site public avec ta clé veut dire que tout visiteur consomme tes crédits. Protège le site par mot de passe (Netlify > Visitor access) ou ne mets pas la clé.

## 3. Le montage haute qualité (Python)

Voir `exemples/commandes.md`. Résumé :

```bash
pip install pillow numpy             # + ffmpeg installé
python video/suno_to_words.py alignement_suno.json words.json     # paroles calées (Suno)
python video/transcribe.py chanson.mp3 words.json --max-end 105   # ou Whisper si pas Suno
PREVIEW=3,12,45 python video/render.py words.json chanson.mp3 0 140 controle img/*.png
INTRO="le Fils du Roi" OUTRO1="Fils du Roi" OUTRO2="Psaume 91" OUTRO_SEC=4 BGTIMES=16.3,32 \
  python video/render.py words.json chanson.mp3 0 139.9 sortie.mp4 img/*.png
```

## Bon à savoir
- La vidéo s'enregistre **en temps réel** : 3 min de chanson = 3 min d'attente. Garde l'onglet visible et l'écran allumé.
- Chrome et Safari récents produisent un MP4. Si Facebook refuse le fichier, convertis-le :
  `ffmpeg -i video.mp4 -c:v libx264 -crf 20 -c:a aac video_fb.mp4`
- La synchro au toucher est bonne. La synchro mot à mot de `video/` (Suno ou Whisper) est plus précise : tu peux la coller dans l'appli avec « Code de Claude » (contenu de `words.json`).
