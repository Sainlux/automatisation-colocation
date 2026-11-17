// Réglage de l'alignement par syllabes (alignSyllables) : analyse une fois, grille de paramètres dans la page.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const D = __dirname, files = fs.readdirSync(path.join(D, process.argv.includes('--valid') ? 'songs_valid' : 'songs')).filter(f => f.endsWith('.json'));
const songs = files.map(f => ({...JSON.parse(fs.readFileSync(path.join(D, process.argv.includes('--valid') ? 'songs_valid' : 'songs', f))), id: f.replace('.json', '')}));
const full = process.argv.includes('--grid');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8787/'); await p.waitForTimeout(800);
  for (const s of songs){ await p.setInputFiles('#mp3', path.join(D, process.argv.includes('--valid') ? 'songs_valid' : 'songs', s.id + '.mp3'));
    await p.waitForFunction(() => voiceAna && voiceAna.ok !== undefined, null, {timeout: 30000}); await p.evaluate(id => { (window.__ana = window.__ana || {})[id] = voiceAna; }, s.id); }
  const base = await p.evaluate(() => SYL_P), grid = [base];
  if (full) for (const pause of [0.8, 1.6, 2.5]) for (const rhythm of [0.5, 0.9, 1.4]) for (const on of [0.3, 0.6, 1]) for (const miss of [0.5, 0.9, 1.5]) for (const skipIn of [0.3, 0.8]) grid.push({...base, pause, rhythm, on, miss, skipIn});
  const res = await p.evaluate(({songs, grid}) => {
    const evalP = P => { let n = 0, ok25 = 0, ok5 = 0, sum = 0; const per = {};
      songs.forEach(s => { const a = Math.max(0, s.starts[0] - 1.5), bb = s.ends[s.ends.length-1] + 1, r = alignSyllables(s.lines, window.__ana[s.id], a, bb, true, P), st = r && r.starts;
        let o = 0; s.starts.forEach((t, i) => { const e = st ? Math.abs(st[i] - t) : 9; n++; sum += Math.min(e, 9); if (e <= .25) { ok25++; o++; } if (e <= .5) ok5++; }); per[s.id.slice(0, 2)] = Math.round(100 * o / s.starts.length); });
      return {P, mean: +(sum/n).toFixed(2), ok25: Math.round(100*ok25/n), ok5: Math.round(100*ok5/n), per}; };
    const t0 = performance.now(), all = grid.map(evalP), ms = (performance.now() - t0) / grid.length / songs.length;
    return {cur: all[0], ms: Math.round(ms), top: all.slice().sort((x, y) => (y.ok25 + y.ok5) - (x.ok25 + x.ok5) || x.mean - y.mean).slice(0, 5)};
  }, {songs, grid});
  console.log('ACTUEL', JSON.stringify(res.cur), '| temps par chanson :', res.ms, 'ms'); if (full) res.top.forEach(r => console.log('TOP', JSON.stringify(r)));
  console.log('syllabes détectées :', JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.entries(__ana).map(([k, v]) => [k.slice(0,2), v.syl.length])))));
  await b.close(); })();
