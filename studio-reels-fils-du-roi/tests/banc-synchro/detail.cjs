const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const dir = process.argv[2], ids = process.argv.slice(3);
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8787/'); await p.waitForTimeout(800);
  for (const id of ids){ const s = JSON.parse(fs.readFileSync(path.join(__dirname, dir, id + '.json')));
    await p.setInputFiles('#mp3', path.join(__dirname, dir, id + '.mp3')); await p.waitForFunction(() => voiceAna && voiceAna.ok !== undefined, null, {timeout: 30000});
    const r = await p.evaluate(s => { const a = Math.max(0, s.starts[0] - 1.5), bb = s.ends[s.ends.length-1] + 1; const x = alignSyllables(s.lines, voiceAna, a, bb, true);
      const old = placeLinesOnVoice(s.lines, voiceAna, a, bb, true); const cs = voiceAna.syl.map(c => c.t);
      return s.starts.map((t, i) => ({t, app: x && +x.starts[i].toFixed(2), old: old && +old[i].toFixed(2), syl: s.lines[i].split(/\s+/).reduce((n, w) => n + wordSyl(w), 0), near: +(cs.reduce((m, c) => Math.abs(c - t) < Math.abs(m - t) ? c : m, 1e9) - t).toFixed(2), dur: +(s.ends[i] - t).toFixed(2), line: s.lines[i]})); }, s);
    console.log('#', id); r.forEach((x, i) => console.log(String(i+1).padStart(3), 'vrai', x.t.toFixed(2).padStart(6), '| syll', String(x.app).padStart(6), 'err', (x.app - x.t).toFixed(2).padStart(6), '| ancien err', (x.old - x.t).toFixed(2).padStart(6), '| attaque la + proche', String(x.near).padStart(5), '| durée', x.dur, 'syl', x.syl, '|', x.line)); }
  await b.close(); })();
