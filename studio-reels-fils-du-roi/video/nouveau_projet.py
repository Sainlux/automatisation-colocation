#!/usr/bin/env python3
"""Prépare un « projet prêt » pour l'app (src/app.html) dans le dossier projets/.

Produit :
  projets/<slug>/projet.json   (slug, titre, audio, images, paroles, words, duree, cree)
  projets/<slug>/chanson.mp3
  projets/<slug>/1.jpg, 2.jpg, ...
  projets/index.json           (liste des projets, le plus récent en premier)

Usage :
  python video/nouveau_projet.py --titre "Psaume 23" --mp3 chanson.mp3 --images a.png b.png ...
      [--alignement suno_alignment.json | --words words.json]
      [--paroles paroles.txt] [--slug psaume-23] [--dossier projets]

Dépendances : Python 3, Pillow, ffmpeg/ffprobe.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    print("Erreur : Pillow n'est pas installé (pip install Pillow).", file=sys.stderr)
    sys.exit(1)

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LARGEUR_MAX, HAUTEUR_MAX = 1080, 1920
RATIO_CIBLE = 9 / 16
TOLERANCE_RATIO = 0.02  # au-delà de 2 % d'écart, on recadre au centre
SEUIL_PAUSE = 0.7       # secondes de silence qui séparent deux lignes


class ErreurEntree(Exception):
    """Entrée invalide : message clair pour l'utilisateur."""


# ---------------------------------------------------------------- utilitaires

def slugifier(texte):
    """Slug ASCII : sans accents, minuscules, tirets."""
    t = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode('ascii')
    t = re.sub(r'[^a-zA-Z0-9]+', '-', t).strip('-').lower()
    return t


def lire_json(chemin, quoi):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        raise ErreurEntree(f"fichier {quoi} introuvable : {chemin}")
    except json.JSONDecodeError as e:
        raise ErreurEntree(f"fichier {quoi} n'est pas un JSON valide ({chemin}) : {e}")


def verifier_outil(nom):
    if not shutil.which(nom):
        raise ErreurEntree(f"{nom} est introuvable dans le PATH (installez ffmpeg).")


# ---------------------------------------------------------------- alignement Suno

def alignement_vers_mots(donnees):
    """Même logique que video/suno_to_words.py, avec en plus le repérage des
    retours à la ligne. Renvoie (mots, debuts_de_ligne) où mots = [[mot, debut, fin], ...]
    et debuts_de_ligne = ensemble des indices de mots qui ouvrent une nouvelle ligne
    (vide si le texte Suno ne contient aucun « \\n »)."""
    d = donnees
    if isinstance(d, list) and d and isinstance(d[0], dict) and 'text' in d[0]:
        try:
            d = json.loads(d[0]['text'])
        except (json.JSONDecodeError, TypeError) as e:
            raise ErreurEntree(f"le champ « text » de l'alignement n'est pas un JSON valide : {e}")
    if not isinstance(d, dict) or not isinstance(d.get('words'), list):
        raise ErreurEntree("alignement Suno invalide : clé « words » absente "
                           "(attendu : [{\"type\":\"text\",\"text\":\"{...}\"}] ou {\"words\":[...]}).")
    toks = d['words']

    ws = []              # [mot, debut, fin, 0, saut_avant]
    saut_en_attente = False
    a_des_sauts = False
    for w in toks:
        try:
            brut, debut, fin = w['word'], float(w['start_s']), float(w['end_s'])
        except (KeyError, TypeError, ValueError):
            raise ErreurEntree(f"jeton d'alignement invalide : {w!r}")
        # rstrip : un « \n » final (« berger\n ») ne doit pas ouvrir un mot vide ni coller
        # ce mot au précédent (défaut de suno_to_words.py corrigé ici)
        s = brut.replace('\n', ' ').rstrip()
        pos_nl = brut.rfind('\n')
        if pos_nl >= 0:
            a_des_sauts = True
        # Suno découpe en sous-mots : un jeton qui commence par une espace ouvre un nouveau mot
        # (un retour à la ligne en attente ouvre aussi un nouveau mot)
        if ' ' in s.strip() or s.startswith(' ') or not ws or (saut_en_attente and s.strip()):
            pre, _, rest = s.rpartition(' ')
            if ws and pre.strip():
                ws[-1][0] += pre.strip()
            debut_rest = len(pre) + 1 if _ else 0
            saut = saut_en_attente
            saut_en_attente = False
            if pos_nl >= 0:
                if pos_nl < debut_rest or not rest.strip():
                    # « \n » placé avant le nouveau mot (ou jeton sans mot après)
                    if rest.strip():
                        saut = True
                    else:
                        saut_en_attente = True
                else:
                    saut_en_attente = True  # « \n » en fin de jeton : coupe après ce mot
            ws.append([rest.strip(), debut, fin, 0, saut])
        else:
            ws[-1][0] += s.strip()
            ws[-1][2] = fin
            if pos_nl >= 0:
                saut_en_attente = True  # « mot\n » : la ligne se termine après ce mot

    # Filtre identique à suno_to_words.py ; un saut porté par un mot supprimé passe au suivant
    mots, debuts = [], set()
    report = False
    for w in ws:
        if w[0].strip('«»‭‬ '):
            if (w[4] or report) and mots:
                debuts.add(len(mots))
            report = False
            mots.append([w[0], round(w[1], 3), round(w[2], 3)])
        elif w[4]:
            report = True
    if not a_des_sauts:
        debuts = set()
    return mots, debuts


def mots_depuis_fichier_words(donnees):
    if not isinstance(donnees, list):
        raise ErreurEntree("words.json invalide : une liste [[mot, debut, fin, (0)], ...] est attendue.")
    mots = []
    for w in donnees:
        if not isinstance(w, (list, tuple)) or len(w) < 3:
            raise ErreurEntree(f"entrée de words.json invalide : {w!r}")
        try:
            mots.append([str(w[0]), round(float(w[1]), 3), round(float(w[2]), 3)])
        except (TypeError, ValueError):
            raise ErreurEntree(f"entrée de words.json invalide : {w!r}")
    return mots


def lignes_par_pauses(mots):
    """Regroupe les mots en lignes dès qu'un silence dépasse SEUIL_PAUSE."""
    debuts = set()
    for i in range(1, len(mots)):
        if mots[i][1] - mots[i - 1][2] > SEUIL_PAUSE:
            debuts.add(i)
    return debuts


def construire_paroles(mots, debuts):
    lignes, courante = [], []
    for i, m in enumerate(mots):
        if i in debuts and courante:
            lignes.append(' '.join(courante))
            courante = []
        courante.append(m[0])
    if courante:
        lignes.append(' '.join(courante))
    return '\n'.join(lignes)


# ---------------------------------------------------------------- audio

def preparer_audio(src, dst):
    if not os.path.isfile(src):
        raise ErreurEntree(f"fichier audio introuvable : {src}")
    verifier_outil('ffprobe')
    if src.lower().endswith('.mp3'):
        shutil.copyfile(src, dst)
    else:
        verifier_outil('ffmpeg')
        r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-vn',
                            '-codec:a', 'libmp3lame', '-b:a', '192k', dst],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise ErreurEntree(f"conversion en MP3 impossible pour {src} :\n{r.stderr.strip()}")
    return duree_audio(dst)


def duree_audio(chemin):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1', chemin],
                       capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 3)
    except ValueError:
        raise ErreurEntree(f"impossible de lire la durée de l'audio ({chemin}) : "
                           f"{r.stderr.strip() or 'fichier audio illisible'}")


# ---------------------------------------------------------------- images

def preparer_image(src, dst):
    if not os.path.isfile(src):
        raise ErreurEntree(f"image introuvable : {src}")
    try:
        im = Image.open(src)
        im = ImageOps.exif_transpose(im)
    except Exception as e:
        raise ErreurEntree(f"image illisible : {src} ({e})")
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        fond = Image.new('RGB', im.size, (0, 0, 0))
        fond.paste(im, mask=im.split()[-1])
        im = fond
    else:
        im = im.convert('RGB')

    l, h = im.size
    ratio = l / h
    if abs(ratio - RATIO_CIBLE) / RATIO_CIBLE > TOLERANCE_RATIO:
        # Recadrage centré en 9:16
        if ratio > RATIO_CIBLE:          # trop large
            nl = round(h * RATIO_CIBLE)
            x = (l - nl) // 2
            im = im.crop((x, 0, x + nl, h))
        else:                            # trop haute
            nh = round(l / RATIO_CIBLE)
            y = (h - nh) // 2
            im = im.crop((0, y, l, y + nh))
    l, h = im.size
    echelle = min(LARGEUR_MAX / l, HAUTEUR_MAX / h, 1.0)
    if echelle < 1.0:
        im = im.resize((max(1, round(l * echelle)), max(1, round(h * echelle))), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=85, optimize=True)
    return im.size


# ---------------------------------------------------------------- index

def maj_index(dossier, entree):
    chemin = os.path.join(dossier, 'index.json')
    index = []
    if os.path.isfile(chemin):
        try:
            with open(chemin, encoding='utf-8') as f:
                index = json.load(f)
            if not isinstance(index, list):
                index = []
        except json.JSONDecodeError:
            print(f"Attention : {chemin} illisible, il est recréé.", file=sys.stderr)
            index = []
    index = [p for p in index if isinstance(p, dict) and p.get('slug') != entree['slug']]
    index.insert(0, entree)
    index.sort(key=lambda p: p.get('cree', ''), reverse=True)  # tri stable : le nouveau reste devant à date égale
    with open(chemin, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    return index


# ---------------------------------------------------------------- principal

def main(argv=None):
    p = argparse.ArgumentParser(description="Crée un projet prêt (audio + images + paroles synchronisées) pour l'app.")
    p.add_argument('--titre', required=True, help='titre du projet')
    p.add_argument('--mp3', required=True, help='fichier audio (.mp3, ou .m4a/.wav/... converti en MP3 192k)')
    p.add_argument('--images', nargs='+', required=True, help='images dans l\'ordre (recadrées 9:16, max 1080x1920)')
    g = p.add_mutually_exclusive_group()
    g.add_argument('--alignement', help='sortie brute de l\'outil Suno « audio-lyrics-alignment »')
    g.add_argument('--words', help='words.json existant [[mot, debut, fin, (0)], ...]')
    p.add_argument('--paroles', help='fichier texte des paroles (une ligne par ligne chantée)')
    p.add_argument('--slug', help='identifiant du dossier (par défaut : dérivé du titre)')
    p.add_argument('--dossier', default=os.path.join(RACINE, 'projets'),
                   help='dossier des projets (par défaut : projets/ à la racine)')
    a = p.parse_args(argv)

    titre = a.titre.strip()
    if not titre:
        raise ErreurEntree("le titre est vide.")
    slug = slugifier(a.slug) if a.slug else slugifier(titre)
    if not slug:
        raise ErreurEntree("impossible de dériver un slug du titre : précisez --slug.")

    # Vérifications avant toute écriture
    if not os.path.isfile(a.mp3):
        raise ErreurEntree(f"fichier audio introuvable : {a.mp3}")
    for im in a.images:
        if not os.path.isfile(im):
            raise ErreurEntree(f"image introuvable : {im}")
    if a.paroles and not os.path.isfile(a.paroles):
        raise ErreurEntree(f"fichier de paroles introuvable : {a.paroles}")

    # Mots synchronisés
    debuts = set()
    if a.alignement:
        mots, debuts = alignement_vers_mots(lire_json(a.alignement, "d'alignement"))
    elif a.words:
        mots = mots_depuis_fichier_words(lire_json(a.words, 'words'))
    else:
        mots = []

    # Paroles
    if a.paroles:
        with open(a.paroles, encoding='utf-8') as f:
            paroles = f.read().replace('\r\n', '\n').replace('\r', '\n').strip()
    elif mots:
        if not debuts:
            debuts = lignes_par_pauses(mots)
        paroles = construire_paroles(mots, debuts)
    else:
        paroles = ''
    if not paroles and not mots:
        print("Attention : ni paroles ni alignement fournis, le projet n'aura pas de texte.", file=sys.stderr)

    # Dossier du projet (on retire les fichiers d'une version précédente)
    dossier = os.path.abspath(a.dossier)
    dproj = os.path.join(dossier, slug)
    os.makedirs(dproj, exist_ok=True)
    for nom in os.listdir(dproj):
        if re.fullmatch(r'\d+\.jpg', nom) or nom in ('chanson.mp3', 'projet.json'):
            os.remove(os.path.join(dproj, nom))

    duree = preparer_audio(a.mp3, os.path.join(dproj, 'chanson.mp3'))

    images = []
    for i, src in enumerate(a.images, 1):
        nom = f'{i}.jpg'
        preparer_image(src, os.path.join(dproj, nom))
        images.append(nom)

    cree = datetime.date.today().isoformat()
    projet = {
        'slug': slug,
        'titre': titre,
        'audio': 'chanson.mp3',
        'images': images,
        'paroles': paroles,
        'words': mots,
        'duree': duree,
        'cree': cree,
    }
    with open(os.path.join(dproj, 'projet.json'), 'w', encoding='utf-8') as f:
        json.dump(projet, f, ensure_ascii=False, indent=1)

    maj_index(dossier, {'slug': slug, 'titre': titre, 'cree': cree, 'duree': duree,
                        'couverture': f'{slug}/1.jpg'})

    taille = sum(os.path.getsize(os.path.join(dproj, n)) for n in os.listdir(dproj))
    print(f"Projet « {titre} » prêt")
    print(f"  dossier : {dproj}")
    print(f"  images  : {len(images)}")
    print(f"  mots    : {len(mots)}" + ("" if mots else " (synchro automatique dans l'app)"))
    print(f"  lignes  : {len(paroles.splitlines()) if paroles else 0}")
    print(f"  durée   : {duree:.1f} s")
    print(f"  taille  : {taille / 1e6:.2f} Mo")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ErreurEntree as e:
        print(f"Erreur : {e}", file=sys.stderr)
        sys.exit(1)
