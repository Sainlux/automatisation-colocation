#!/usr/bin/env bash
# Analyse le style d'un Reel modèle (Facebook, Instagram, TikTok…) pour s'en inspirer.
# Usage : analyse_reel.sh "URL_DU_REEL" dossier_sortie
# Produit : reel.mp4, une planche contact (1 image/s), la liste des changements de plan.
# Sert uniquement à étudier le style : ne republie jamais le contenu d'un autre créateur.
set -euo pipefail
URL="$1"; OUT="${2:-reel_analyse}"
mkdir -p "$OUT"
pip install -q yt-dlp 2>/dev/null || true
yt-dlp -o "$OUT/reel.%(ext)s" --merge-output-format mp4 "$URL"
yt-dlp --skip-download --print "%(title)s | %(uploader)s | %(description)s" "$URL" > "$OUT/infos.txt" || true
ffprobe -hide_banner "$OUT/reel.mp4" 2>&1 | grep -E "Duration|Stream" > "$OUT/format.txt"
ffmpeg -loglevel error -y -i "$OUT/reel.mp4" -vf "fps=1,scale=200:-1,tile=11x3" "$OUT/planche.jpg"
ffmpeg -i "$OUT/reel.mp4" -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 \
  | grep -o "pts_time:[0-9.]*" > "$OUT/changements_de_plan.txt" || true
echo "Regarde $OUT/planche.jpg : fond, typo, couleurs, rythme du texte, effets."
