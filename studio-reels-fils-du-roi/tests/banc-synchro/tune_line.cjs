// Réglage de placeLinesOnVoice (avec comptage des syllabes) : réglage sur songs/, contrôle sur songs_valid/.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const load = dir => fs.readdirSync(path.join(__dirname, dir)).filter(f => f.endsWith('.json')).map(f => ({...JSON.parse(fs.readFileSync(path.join(__dirname, dir, f))), id: f.replace('.json', ''), dir}));
const train = load('songs'), valid = load('songs_valid');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8787/'); await p.waitForTimeout(800);
  for (const s of [...train, ...valid]){ await p.setInputFiles('#mp3', path.join(__dirname, s.dir, s.id + '.mp3')); await p.waitForFunction(() => voiceAna && voiceAna.ok !== undefined, null, {timeout: 30000}); await p.evaluate(id => { (window.__ana = window.__ana || {})[id] = voiceAna; }, s.id); }
  const base = await p.evaluate(() => SYNC_P), grid = [];
  for (const cnt of [0, 0.5, 1, 2, 3]) for (const cntOver of [0, 0.3, 0.8]) for (const short of [0.3, 0.7, 1.0]) for (const long of [0.1, 0.3, 0.55]) for (const inside of [0.3, 0.7]) for (const wS of [0.35]) grid.push({...base, cnt, cntOver, short, long, inside, wS});
  const res = await p.evaluate(({train, valid, grid}) => {
    const ev = (songs, P, fn) => { let n = 0, ok25 = 0, ok5 = 0, sum = 0; const per = {};
      songs.forEach(s => { const a = Math.max(0, s.starts[0] - 1.5), bb = s.ends[s.ends.length-1] + 1, st = fn(s, a, bb, P); let o = 0;
        s.starts.forEach((t, i) => { const e = st ? Math.abs(st[i] - t) : 9; n++; sum += Math.min(e, 9); if (e <= .25){ ok25++; o++; } if (e <= .5) ok5++; }); per[s.id.slice(0, 2)] = Math.round(100 * o / s.starts.length); });
      return {mean: +(sum/n).toFixed(2), ok25: Math.round(100*ok25/n), ok5: Math.round(100*ok5/n), per}; };
    const line = (s, a, bb, P) => placeLinesOnVoice(s.lines, __ana[s.id], a, bb, true, P), sylf = (s, a, bb) => (alignSyllables(s.lines, __ana[s.id], a, bb, true) || {}).starts;
    const prop = (s, a, bb) => { const c = s.lines.map(l => l.split(/\s+/).length), tot = c.reduce((x,y)=>x+y,0); let t = a; return c.map(n => { const v = t; t += (bb-a)*n/tot; return v; }); };
    const rows = grid.map(P => ({P, tr: ev(train, P, line)})).sort((x, y) => (y.tr.ok25 + y.tr.ok5) - (x.tr.ok25 + x.tr.ok5) || x.tr.mean - y.tr.mean);
    const top = rows.slice(0, 5).map(r => ({...r, va: ev(valid, r.P, line)}));
    return {top, syl: {tr: ev(train, null, sylf), va: ev(valid, null, sylf)}, prop: {tr: ev(train, null, prop), va: ev(valid, null, prop)}};
  }, {train, valid, grid});
  console.log('RÉPARTITION  réglage', JSON.stringify(res.prop.tr), '| contrôle', JSON.stringify(res.prop.va));
  console.log('SYLLABES     réglage', JSON.stringify(res.syl.tr), '| contrôle', JSON.stringify(res.syl.va));
  res.top.forEach(r => console.log('LIGNES+COMPTE', JSON.stringify({cnt: r.P.cnt, over: r.P.cntOver, short: r.P.short, long: r.P.long, inside: r.P.inside}), 'réglage', JSON.stringify(r.tr), '| contrôle', JSON.stringify(r.va)));
  await b.close(); })();
