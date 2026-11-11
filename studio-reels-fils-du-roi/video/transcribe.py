#!/usr/bin/env python3
"""Paroles mot à mot quand la chanson n'a pas d'identifiant Suno (Whisper local, gratuit).

Usage : transcribe.py chanson.mp3 words.json [--max-end 105] [--model medium]
--max-end : ignore tout ce qui commence après N secondes (Whisper invente parfois du texte
            dans l'outro instrumental, ex. « Sous-titres réalisés par… »).
Installe : pip install faster-whisper   (et ffmpeg)
Relis toujours le texte : corrige les mots mal entendus directement dans words.json.
"""
import argparse, json, subprocess
import numpy as np
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument('mp3'); ap.add_argument('out')
ap.add_argument('--max-end', type=float, default=1e9)
ap.add_argument('--model', default='medium')
ap.add_argument('--lang', default='fr')
a = ap.parse_args()

raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', a.mp3, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(raw, dtype=np.float32)
model = WhisperModel(a.model, device='cpu', compute_type='int8')
segs, _ = model.transcribe(audio, language=a.lang, word_timestamps=True)

ws = []
for s in segs:
    print(f'[{s.start:6.1f}] {s.text}')
    for w in s.words:
        if w.start < a.max_end and w.word.strip():
            ws.append([w.word.strip(), w.start, w.end, 0])

# recolle les mots coupés à l'apostrophe ou au trait d'union (« l » + « 'ombre »)
out = []
for x in ws:
    if out and (x[0][:1] in "'’-" or out[-1][0][-1:] in "'’-"):
        out[-1][0] += x[0]; out[-1][2] = x[2]
    else:
        out.append(x)
json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{len(out)} mots -> {a.out}')
