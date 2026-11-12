#!/usr/bin/env python3
"""Convertit l'alignement des paroles Suno (outil Suno « audio-lyrics-alignment »)
en words.json : [[mot, début_s, fin_s, 0], ...]  (format lu par video/render.py)

Usage : suno_to_words.py alignement_suno.json words.json
Le fichier d'entrée peut être la réponse brute de l'outil (liste avec {"type":"text","text":"{...}"})
ou directement l'objet {"words":[{"word":..,"start_s":..,"end_s":..}, ...]}.
La logique est celle de nouveau_projet.py (sous-mots recollés, retours à la ligne gérés).
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nouveau_projet import alignement_vers_mots, lire_json

src, dst = sys.argv[1], sys.argv[2]
mots, _ = alignement_vers_mots(lire_json(src, "alignement Suno"))
out = [[m, s, e, 0] for m, s, e in mots]
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{len(out)} mots -> {dst}')
