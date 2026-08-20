// Lecture / écriture simple du fichier .env (KEY=VALUE).
// Préserve les lignes existantes (commentaires, blanks, ordre).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve('.env');

export function readEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const text = readFileSync(ENV_PATH, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[m[1]] = val;
  }
  return out;
}

export function writeEnv(updates) {
  // Lit l'existant et fusionne (préserve commentaires/lignes vides)
  const existingText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const lines = existingText.split(/\r?\n/);
  const seen = new Set();

  // Met à jour les clés présentes
  const outLines = lines.map(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/i);
    if (!m) return line;
    const key = m[1];
    if (key in updates) {
      seen.add(key);
      return `${key}=${quote(updates[key])}`;
    }
    return line;
  });

  // Ajoute les nouvelles clés à la fin
  for (const k of Object.keys(updates)) {
    if (!seen.has(k)) outLines.push(`${k}=${quote(updates[k])}`);
  }

  writeFileSync(ENV_PATH, outLines.join('\n'), 'utf8');

  // Met aussi à jour process.env en mémoire pour effet immédiat
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }
}

function quote(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[\s"']/.test(s)) return '"' + s.replace(/"/g, '\\"') + '"';
  return s;
}
