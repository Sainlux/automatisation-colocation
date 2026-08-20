// Convertit la première page d'un PDF en PNG via pdfjs-dist v3 + node-canvas
// Usage : node tools/pdf-to-png.js <input.pdf> <output.png> [scale=3]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from 'canvas';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const [inPath, outPath, scaleArg] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('Usage : node tools/pdf-to-png.js <in.pdf> <out.png> [scale=3]');
  process.exit(1);
}
const scale = parseFloat(scaleArg || '3');

pdfjsLib.GlobalWorkerOptions.workerSrc = false;

const data = new Uint8Array(readFileSync(resolve(inPath)));
const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;
const page = await pdf.getPage(1);

const viewport = page.getViewport({ scale });
const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, viewport.width, viewport.height);

await page.render({ canvasContext: ctx, viewport }).promise;

writeFileSync(resolve(outPath), canvas.toBuffer('image/png'));
console.log(`OK : ${outPath} (${Math.round(viewport.width)}x${Math.round(viewport.height)})`);
