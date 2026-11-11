# Cahier des charges — Studio Reels · Fils du Roi

Ce document décrit précisément l'interface et le moteur, pour pouvoir les reconstruire ou les faire évoluer sans rien perdre.

## 1. But et public
- Entrée : une chanson MP3 (souvent Suno), ses paroles, et 3 à 7 images verticales générées dans ChatGPT.
- Sortie : une vidéo 9:16 (720×1280 ou 1080×1920) de paroles animées, avec le son, au format MP4 ou WebM.
- Utilisateur : francophone, non technicien, souvent sur iPhone. Tout doit être utilisable d'une main à 390 px de large.
- Modèle de style : un Reel viral (environ 3 M de vues). On y voit une seule image de nuit, des mots en capitales usées qui tombent un par un et s'empilent, le mot fort en très gros, un étalonnage qui alterne noir et blanc / vert / orange, du grain, des éclats de lumière orange, de petits glitchs, et une phrase qui défile à la fin.

## 2. Interface (une seule page, thème sombre « studio de nuit »)
Couleurs : fond `#111214`, panneaux `#1a1c1f`, texte `#ece9e2`, accent or `#f2c14e`. Polices : Oswald pour les titres, Montserrat pour le texte.

**Aperçu (toujours visible)** : un canvas 9:16 avec le bouton Lire/Pause, une barre de position et le temps. Sur téléphone, il reste en haut de l'écran en petit (92 px) et le bouton « Agrandir l'aperçu » le remet en grand. Sans MP3, une démo tourne en boucle.

**Étape 1 — Musique et images**
- Bouton pour choisir le MP3, et bouton pour ajouter plusieurs images.
- Vignettes numérotées, avec × pour retirer une image (zone de toucher de 32 px).
- Lien « Pas encore d'images ? Écrire les prompts ChatGPT » qui descend à l'étape 4.

**Étape 2 — Paroles et synchro**
- Zone de texte : une ligne par phrase chantée.
- Trois méthodes de synchro :
  - **Au toucher** : une barre fixe en bas de l'écran montre la prochaine ligne en grand, un gros bouton « Touche quand elle commence », et les boutons « Annuler la dernière » et « Terminer ». Les lignes non touchées sont réparties automatiquement.
  - **Automatique** : on donne le début et la fin du chant, et les lignes sont réparties selon leur nombre de mots. Elle se relance seule quand les paroles changent.
  - **Code de Claude** : on colle un `words.json` (`[[mot, début, fin], ...]`).
- Liste des lignes avec leur temps. La synchro est gardée dans `localStorage`.
- **Décaler toute la synchro** (visible dès qu'une synchro existe) : boutons −0,5 s, −0,1 s, +0,1 s, +0,5 s. Tous les mots et les débuts de ligne bougent ensemble, jamais avant 0:00. Le total du décalage est affiché ; il revient à 0 à chaque nouvelle synchro. En synchro automatique, « Début / Fin du chant » suivent le décalage (la fin ne dépasse pas la durée du MP3).

**Étape 3 — Style**
- **18 styles prêts**, chacun montré par une vraie miniature 9:16 rendue par le moteur : Nuit cinéma, Or lumineux, Rap jaune, Un mot, Néon rose, Glacier, Feu, Royal, Vert espoir, Louange douce, Karaoké, Craie, Machine à écrire, Affiche rouge, Pastel aube, Magazine, Contour seul, Minimal.
- **« Décris ton style »** : un texte libre envoyé à Claude, qui renvoie un style JSON valide, un nom et une phrase d'explication.
- **Réglages fins** :
  - police (12) ;
  - apparition (10) ;
  - disposition : mots empilés, phrase sur une ligne, ou un mot géant à la fois ;
  - position : haut, centre ou bas ;
  - majuscules ;
  - taille ;
  - couleur avec dégradé ;
  - couleur du mot fort ;
  - contour (épaisseur et couleur) ;
  - lueur (force et couleur) ;
  - image : luminosité, saturation, teinte, bords sombres, grain ;
  - interrupteurs : couleurs qui changent, glitch, éclats de lumière (avec leur couleur), lettres usées, zoom lent.

**Étape 4 — Prompts d'images ChatGPT**
- On choisit une lumière : Nuit cinéma, Lumière dorée, Ciel lumineux, Aube pastel, Matin lumineux ou Néon urbain.
- On choisit le nombre d'images.
- Claude lit les paroles, les découpe en passages et propose une scène par passage.
- Chaque prompt complet a son bouton Copier. Gabarit : « Crée une photo cinématographique verticale au format 9:16. » + texte de la lumière avec [SCÈNE] + « … centre simple pour le texte. Aucune personne, aucun texte, aucune lettre. »

**Étape 5 — Créer la vidéo**
- Champs : titre (obligatoire si les titres sont activés) et signature (par défaut « le Fils du Roi »).
- Passage début/fin, avec des boutons « ▸ ici » qui prennent le temps de l'aperçu, et un résumé « Passage : 0:42 → 1:30 (48 s) ».
- Qualité : 720 ou 1080. Case « Titre au début et à la fin ».
- Bouton « Créer la vidéo » : enregistrement en temps réel du canvas et de l'audio, avec une barre de progression et le maintien de l'écran allumé (wakeLock). Le résultat est affiché dans l'aperçu, avec le bouton « Enregistrer la vidéo ».
- En option : un message à copier pour faire monter la vidéo par Claude, avec le code du style.

## 3. Moteur de rendu (canvas, identique pour l'aperçu et l'export)
**Découpage**
- Les mots sont groupés en phrases de 4 mots au plus (6 au maximum). On coupe sur la ponctuation, sur un silence de plus de 0,7 s, ou après 4 mots, mais jamais juste après un petit mot (le, la, de, mon, et, je, il, que…).

**Mot fort**
- C'est le dernier mot s'il fait 4 lettres ou plus et n'est pas un petit mot. Sinon, c'est le plus long des mots porteurs de sens. Il est dessiné à 1,9 fois la taille et dans la couleur d'accent.

**Mise en page empilée**
- Elle est calculée sur **toute la phrase dès le départ** : les mots déjà affichés ne bougent jamais.
- L'interligne est égal à la hauteur des capitales plus 12 % de la plus petite taille.
- Le bloc est décalé pour rester entre 14 % et 78 % de la hauteur.

**Animations** (entrée en easeOutQuint, environ cubic-bezier(.23,1,.32,1))
| Animation | Réglages |
|---|---|
| pop | échelle 1,14 → 1 en 180 ms ; opacité en 90 ms ; léger tremblement fixe par mot |
| impact | échelle 1,7 → 1 en 140 ms, centrée sur le mot |
| slide | 0,3 em vers le haut en 260 ms |
| fade | 300 ms |
| blur | 10 px → 0 et 1,04 → 1 en 240 ms ; sur Safari, on simule le flou par deux copies décalées |
| bounce | 0,85 → 1,06 → 1 en 380 ms |
| tilt | −0,12 rad en 260 ms, autour du centre du mot |
| cascade | une lettre toutes les 25 ms, chacune en 220 ms, avec une chute de 0,25 em |
| type | les lettres apparaissent au rythme du mot |
| karaoké | balayage de gauche à droite pendant la durée du mot, minimum 120 ms |

**Effets**
- **Un seul effet par phrase**, tiré de façon fixe selon le numéro de la phrase : glitch (environ 35 %, durée 66 ms, barre grise dans environ 40 % des glitchs) ou éclat de lumière (environ 25 %).
- Flash blanc de 18 % pendant 120 ms, seulement sur le mot fort.
- Couleurs qui changent : une teinte par phrase, au plus un changement par 0,8 s.

**Image**
- Elle change au début d'une phrase, avec un fondu de 0,45 s (easeInOut).
- Zoom lent de 1,02 à 1,08 sur toute la chanson, avec une légère dérive.

**Lisibilité**
- Ombre portée sous le texte.
- Sur les images claires, un voile radial sombre de 35 % derrière le bloc de texte.
- Pas de « screen » blanc à plus de 0,12 (ça rend l'image laiteuse) : on éclaircit en « soft-light ».

**Grain** : une tuile de bruit de 512 px dessinée à l'échelle 1, avec un décalage aléatoire, en mode overlay à 6 %.

**Titres**
- « FAIT PAR / [signature] » pendant au plus 3 s avant le premier mot.
- « [signature sans "le"] / [titre] » sur les 4 dernières secondes, si la fin le permet.

**Performance** : le calque texte n'est redimensionné que si la taille change. Le rendu est protégé par try/catch : une erreur ne doit jamais arrêter la boucle.

## 4. Style (format JSON, partagé avec Claude)
Clés :
- `font`, `anim`, `layout` (stack, line ou one), `pos`, `case`, `size` ;
- `color`, `grad`, `color2`, `accent`, `outline`, `outlineColor`, `glow`, `glowColor` ;
- `bright`, `sat`, `tint`, `tintAmt`, `vignette`, `grain` ;
- `flicker`, `flickerColors` ;
- `glitch`, `leaks`, `leakColor`, `wear`, `zoom`.

Valeurs autorisées et bornes : voir `STYLE_SCHEMA_TXT` dans `src/app.html`. Ce texte est aussi la consigne envoyée à Claude. Toute clé inconnue renvoyée par Claude est ignorée.

## 5. Moteur Python (`video/render.py`) — version haute qualité
Il suit les mêmes règles (découpage, mot fort, mise en page stable, un effet par phrase) et accepte un sous-ensemble du style :
- polices : oswald, bebas, playfair, montserrat ;
- animations : pop, impact, slide, fade, type ;
- looks : nuit, dore, clair, nb.

Encodage : `libx264 -crf 20 -tune grain`. Pistes d'évolution : reprendre dans le moteur Python les 12 polices et les 10 animations de l'appli, et ajouter le fondu entre images.
