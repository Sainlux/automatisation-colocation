# Banc de mesure de la synchro automatique

Mesure à quel point « Automatique (écoute la voix) » place les lignes au bon moment.

- `gen_songs.py` : 5 chansons de **réglage** (voix française espeak-ng + MBROLA, musique numpy, départs de lignes exacts).
- `gen_valid.py` : 4 chansons de **contrôle**, jamais utilisées pour régler.
- `run_bench.cjs` : passe par la vraie interface (Playwright) et compare au chronométrage réel (`-v` détail par ligne, `--only s3`).
- `tune_syl.cjs`, `tune_line.cjs` : grilles de réglage des deux méthodes (`--valid` pour les chansons de contrôle).
- `ens.cjs` : compare les façons de combiner les deux méthodes ; `detail.cjs <dossier> <id>…` : détail par ligne.

Prérequis : `apt-get install -y espeak-ng mbrola mbrola-fr1 mbrola-fr4`, Python 3 + numpy, ffmpeg, et l'appli lancée (`npm start`).

```bash
python3 tests/banc-synchro/gen_songs.py && python3 tests/banc-synchro/gen_valid.py
node tests/banc-synchro/run_bench.cjs
```

Résultats au 18/11/2026 (part des lignes placées à moins de 0,25 s / 0,5 s, erreur moyenne) :
| | 0,25 s | 0,5 s | erreur moy. |
|---|---|---|---|
| Ancienne répartition par nombre de mots | 5 % | 21 % | 1,33 s |
| Première écoute de la voix | 35 % | 47 % | 0,97 s |
| Méthode actuelle (syllabes + lignes, combinées), 5 chansons de réglage via l'interface | 75 % | 82 % | 0,26 s |
| Méthode actuelle, 9 chansons (réglage + contrôle) | 74 % | 79 % | 0,34 s |

Point faible connu : voix **parlée** rapide (s4, v3) ; les chansons chantées vont de 63 % à 100 %.
