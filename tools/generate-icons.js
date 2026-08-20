// Génère les icônes PWA (192, 512, Apple Touch 180)
// Style : monogramme "M" doré sur fond bordeaux, façon cachet de notaire
import { createCanvas, registerFont } from 'canvas';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function makeIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // Fond bordeaux
  ctx.fillStyle = '#7C2D2A';
  ctx.fillRect(0, 0, size, size);

  // Cercle ivoire central
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FBF8F3';
  ctx.fill();

  // Anneau or
  ctx.lineWidth = size * 0.012;
  ctx.strokeStyle = '#B89357';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  // Lettre M centrée
  ctx.fillStyle = '#7C2D2A';
  ctx.font = `700 ${Math.round(size * 0.42)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', cx, cy + size * 0.02);

  // Petit point sous le M (couleur or)
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.55, size * 0.018, 0, Math.PI * 2);
  ctx.fillStyle = '#B89357';
  ctx.fill();

  return c.toBuffer('image/png');
}

const outDir = resolve('public');
const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

for (const { name, size } of sizes) {
  const buf = makeIcon(size);
  writeFileSync(resolve(outDir, name), buf);
  console.log(`✅ ${name} (${size}x${size}) — ${(buf.length / 1024).toFixed(1)} Ko`);
}
