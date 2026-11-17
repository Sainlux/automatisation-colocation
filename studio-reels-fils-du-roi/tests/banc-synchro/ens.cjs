const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const load = dir => fs.readdirSync(path.join(__dirname, dir)).filter(f => f.endsWith('.json')).map(f => ({...JSON.parse(fs.readFileSync(path.join(__dirname, dir, f))), id: f.replace('.json', ''), dir}));
const songs = [...load('songs'), ...load('songs_valid')];
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8787/'); await p.waitForTimeout(800);
  for (const s of songs){ await p.setInputFiles('#mp3', path.join(__dirname, s.dir, s.id + '.mp3')); await p.waitForFunction(() => voiceAna && voiceAna.ok !== undefined, null, {timeout: 30000}); await p.evaluate(id => { (window.__ana = window.__ana || {})[id] = voiceAna; }, s.id); }
  const out = await p.evaluate(songs => {
    const L = (ana, t) => { let best = 0; for (const c of ana.syl) if (Math.abs(c.t - t) < 0.12) best = Math.max(best, c.l); return best; };
    const strat = {
      syll: (A, B) => A, lignes: (A, B) => B,
      meilleureRespiration: (A, B, ana) => { const m = st => st.reduce((x, t) => x + L(ana, t), 0) / st.length; return m(A) >= m(B) ? A : B; },
      parLigne: (A, B, ana) => A.map((t, i) => Math.abs(t - B[i]) < 0.3 ? t : (L(ana, t) >= L(ana, B[i]) ? t : B[i])),
      accordSinonLignes: (A, B) => { const agree = A.filter((t, i) => Math.abs(t - B[i]) < 0.3).length / A.length; return agree >= 0.5 ? A : B; },
    };
    const res = {};
    for (const [name, f] of Object.entries(strat)){ let n = 0, ok25 = 0, ok5 = 0, sum = 0; const per = {};
      songs.forEach(s => { const ana = __ana[s.id], a = Math.max(0, s.starts[0] - 1.5), bb = s.ends[s.ends.length-1] + 1;
        const A = (alignSyllables(s.lines, ana, a, bb, true) || {}).starts, B = placeLinesOnVoice(s.lines, ana, a, bb, true);
        const st = A && B ? f(A, B, ana) : (A || B); let o = 0;
        s.starts.forEach((t, i) => { const e = st ? Math.abs(st[i] - t) : 9; n++; sum += Math.min(e, 9); if (e <= .25){ ok25++; o++; } if (e <= .5) ok5++; }); per[s.id.slice(0,2)] = Math.round(100*o/s.starts.length); });
      res[name] = {mean: +(sum/n).toFixed(2), ok25: Math.round(100*ok25/n), ok5: Math.round(100*ok5/n), per}; }
    return res; }, songs);
  Object.entries(out).forEach(([k, v]) => console.log(k.padEnd(22), JSON.stringify(v))); await b.close(); })();
