#!/usr/bin/env python3
"""Prépare la Bible Louis Segond 1910 (domaine public) pour le Studio.

Source : jeu de données « bible-data » (midvash), version lsg, fichier lsg.json
  https://raw.githubusercontent.com/midvash/bible-data/main/versions/fr/lsg/lsg.json
Usage : python scripts/preparer_bible.py lsg.json
Écrit bible/index.json (livres, noms français, versets par chapitre) et bible/lsg/NN.json
(un fichier par livre : liste des chapitres, chaque chapitre = liste des versets).
Corrige les apostrophes doublées de la source (« l''Eternel » -> « l'Eternel »).
"""
import json, os, sys

NOMS = ["Genèse","Exode","Lévitique","Nombres","Deutéronome","Josué","Juges","Ruth","1 Samuel","2 Samuel",
 "1 Rois","2 Rois","1 Chroniques","2 Chroniques","Esdras","Néhémie","Esther","Job","Psaumes","Proverbes",
 "Ecclésiaste","Cantique des cantiques","Ésaïe","Jérémie","Lamentations","Ézéchiel","Daniel","Osée","Joël","Amos",
 "Abdias","Jonas","Michée","Nahum","Habacuc","Sophonie","Aggée","Zacharie","Malachie",
 "Matthieu","Marc","Luc","Jean","Actes","Romains","1 Corinthiens","2 Corinthiens","Galates","Éphésiens",
 "Philippiens","Colossiens","1 Thessaloniciens","2 Thessaloniciens","1 Timothée","2 Timothée","Tite","Philémon",
 "Hébreux","Jacques","1 Pierre","2 Pierre","1 Jean","2 Jean","3 Jean","Jude","Apocalypse"]

def propre(t):
    return t.replace("''", "'").replace(" ", " ").strip()

src = json.load(open(sys.argv[1], encoding="utf-8"))
livres = src["books"]
assert len(livres) == 66, "66 livres attendus"
racine = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bible")
os.makedirs(os.path.join(racine, "lsg"), exist_ok=True)
index = {"version": "Louis Segond 1910", "licence": "domaine public", "livres": []}
for i, (b, nom) in enumerate(zip(livres, NOMS), 1):
    chap = [[propre(v["text"]) for v in c["verses"]] for c in b["chapters"]]
    f = f"{i:02d}"
    json.dump(chap, open(os.path.join(racine, "lsg", f + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    index["livres"].append({"n": nom, "o": b["book"], "t": "AT" if i <= 39 else "NT", "f": f, "v": [len(c) for c in chap]})
json.dump(index, open(os.path.join(racine, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
nv = sum(sum(l["v"]) for l in index["livres"])
print(f"Bible prête : 66 livres, {sum(len(l['v']) for l in index['livres'])} chapitres, {nv} versets -> {racine}")
