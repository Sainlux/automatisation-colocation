// Extrait la signature d'une image (capture d'écran, photo, scan)
// et produit un PNG transparent prêt à apposer sur les PDF.
//
// Usage :
//   node tools/extract-signature.js <image> [options]
//
// Options :
//   --bbox=x,y,w,h     recadrage manuel
//   --color=blue       ne garder que l'encre bleue (signature) — utile si la capture
//                      contient aussi du texte imprimé noir à exclure
//   --color=dark       garder tout pixel sombre (défaut)
//   --threshold=200    seuil de luminance (0-255)
//   --out=chemin.png   destination (défaut : public/signature.png)
//
// Exemples :
//   node tools/extract-signature.js quittance.png --color=blue
//   node tools/extract-signature.js capture.png --bbox=420,950,560,180

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) {
  console.error('Usage : node tools/extract-signature.js <image> [--bbox=x,y,w,h] [--threshold=200] [--out=public/signature.png]');
  process.exit(1);
}
const input = resolve(args[0]);
const opts = Object.fromEntries(
  args.slice(1).filter(a => a.startsWith('--')).map(a => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=')];
  })
);
const threshold = parseInt(opts.threshold || '200', 10);
const out = resolve(opts.out || 'public/signature.png');
const colorMode = opts.color || 'auto'; // 'auto' | 'blue' | 'dark'

const blueStrength = parseInt(opts['blue-strength'] || '25', 10);
function isInk(r, g, b) {
  const lum = (r + g + b) / 3;
  if (colorMode === 'blue') {
    return b > r + blueStrength && b > g + blueStrength && lum < 230;
  }
  if (colorMode === 'dark') {
    return lum < threshold;
  }
  return lum < threshold || (b > r + 40 && b > g + 20 && lum < 220);
}

async function main() {
  let img = sharp(input).removeAlpha();
  const meta = await img.metadata();

  // 1) Crop si bbox fournie
  if (opts.bbox) {
    const [x, y, w, h] = opts.bbox.split(',').map(n => parseInt(n, 10));
    img = sharp(input).extract({ left: x, top: y, width: w, height: h }).removeAlpha();
  } else {
    // 2) Crop automatique : détection des pixels foncés
    const raw = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = raw;
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (isInk(data[i], data[i + 1], data[i + 2])) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      console.error('Aucune zone d\'encre détectée — essayez --bbox=x,y,w,h pour cibler manuellement.');
      process.exit(2);
    }
    const pad = 8;
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const width = Math.min(info.width - left, maxX - minX + pad * 2);
    const height = Math.min(info.height - top, maxY - minY + pad * 2);
    console.log(`Zone détectée : ${left},${top} ${width}x${height}`);
    img = sharp(input).extract({ left, top, width, height }).removeAlpha();
  }

  // 3) Rendre transparent le fond clair, garder l'encre
  const cropped = await img.raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cropped;
  const channels = info.channels; // 3 (RGB) après removeAlpha
  const outBuf = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let alpha;
    if (!isInk(r, g, b)) {
      alpha = 0;
    } else {
      const lum = (r + g + b) / 3;
      alpha = Math.min(255, Math.round((threshold - lum) * (255 / threshold) * 1.4 + 60));
    }
    outBuf[p * 4] = r;
    outBuf[p * 4 + 1] = g;
    outBuf[p * 4 + 2] = b;
    outBuf[p * 4 + 3] = alpha;
  }

  mkdirSync(dirname(out), { recursive: true });
  await sharp(outBuf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(out);

  console.log(`✅ Signature enregistrée : ${out}`);
  console.log(`   Dimensions : ${info.width}x${info.height} px`);
  console.log(`   Elle sera automatiquement utilisée sur tous les PDF (SIGNATURE_PATH par défaut = public/signature.png).`);
}

main().catch(e => {
  console.error('Erreur :', e.message);
  process.exit(1);
});
