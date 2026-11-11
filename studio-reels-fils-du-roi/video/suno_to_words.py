#!/usr/bin/env python3
"""Convertit l'alignement des paroles Suno (outil Suno « audio-lyrics-alignment »)
en words.json : [[mot, début_s, fin_s, 0], ...]

Usage : suno_to_words.py alignement_suno.json words.json
Le fichier d'entrée peut être la réponse brute de l'outil (liste avec {"type":"text","text":"{...}"})
ou directement l'objet {"words":[{"word":..,"start_s":..,"end_s":..}, ...]}.
"""
import json, sys

src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
if isinstance(d, list) and d and isinstance(d[0], dict) and 'text' in d[0]:
    d = json.loads(d[0]['text'])
toks = d['words']

ws = []
for w in toks:
    s = w['word'].replace('\n', ' ')
    # Suno découpe en sous-mots : un jeton qui commence par une espace ouvre un nouveau mot
    if ' ' in s.strip() or s.startswith(' ') or not ws:
        pre, _, rest = s.rpartition(' ')
        if ws and pre.strip():
            ws[-1][0] += pre.strip()
        ws.append([rest.strip(), w['start_s'], w['end_s'], 0])
    else:
        ws[-1][0] += s.strip()
        ws[-1][2] = w['end_s']

out = [w for w in ws if w[0].strip('«»‭‬ ')]
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{len(out)} mots -> {dst}')
