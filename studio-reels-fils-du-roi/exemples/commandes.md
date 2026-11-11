# Commandes prêtes (depuis le dossier du pack)

## Psaume 40 — chanson complète (3 min 05, 4 images)
```bash
INTRO="le Fils du Roi" OUTRO1="Fils du Roi" OUTRO2="Psaume 40" OUTRO_SEC=4 MARQUEE=10 \
BGTIMES=20.0,25.4,31.0,42.0,60.2,78.9,96.0,113.4,130.6,148.4 \
python video/render.py exemples/psaume40_words.json psaume40.mp3 0 184.9 Psaume40_FilsDuRoi.mp4 \
  img/1_route.png img/2_puits.png img/3_rocher.png img/4_aube.png
```
Les 4 images reviennent en boucle : chaque valeur de `BGTIMES` passe à l'image suivante.

## Psaume 91 — chanson complète (2 min 20, 7 images)
```bash
INTRO="le Fils du Roi" OUTRO1="Fils du Roi" OUTRO2="Psaume 91" OUTRO_SEC=4 MARQUEE=10 \
BGTIMES=16.3,32.0,42.4,57.6,74.5,87.2 \
python video/render.py exemples/psaume91_words.json psaume91.mp3 0 139.9 Psaume91_FilsDuRoi.mp4 \
  img/1_arbre.png img/2_forteresse.png img/3_poule.png img/4_bouclier.png img/5_maison.png img/6_chemin.png img/7_aube.png
```

## Reel court (35 s) dans un autre style
```bash
STYLE='{"look":"dore","font":"montserrat","anim":"slide","color":"#FFFFFF","accent":"#F2B33D","glitch":0,"wear":0,"grain":0.6}' \
MARQUEE=6 BGTIMES=20.0,25.4,31.0 \
python video/render.py exemples/psaume40_words.json psaume40.mp3 7.3 42.3 Reel_dore.mp4 img/1_route.png img/2_puits.png img/3_rocher.png img/4_aube.png
```

## Images de contrôle avant le rendu
```bash
PREVIEW=3,12,45,120 python video/render.py exemples/psaume91_words.json psaume91.mp3 0 139.9 controle img/*.png
```
