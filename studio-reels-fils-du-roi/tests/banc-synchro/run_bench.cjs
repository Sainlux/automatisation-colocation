#!/usr/bin/env node
/* Lyric-line alignment bench for Studio Reels ("Automatique (écoute la voix)").
 *
 *   node run_bench.cjs                 # all songs in ./songs, app at http://localhost:8787/
 *   node run_bench.cjs --only s3       # songs whose id contains "s3"
 *   node run_bench.cjs -v              # per-line detail table
 *   node run_bench.cjs --url http://localhost:8787/ --out results.json
 *   node run_bench.cjs --regen         # re-run gen_songs.py first (needs espeak-ng, mbrola, numpy, scipy)
 *
 * Output: table on stdout + results JSON (default ./results.json, plus results_<timestamp>.json).
 */
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const URL = arg("--url", "http://localhost:8787/"), ONLY = arg("--only", ""), VERBOSE = argv.includes("-v") || argv.includes("--verbose");
const HERE = __dirname, SONGS = path.join(HERE, "songs"), OUT = arg("--out", path.join(HERE, "results.json"));

if (argv.includes("--regen") || !fs.existsSync(SONGS) || !fs.readdirSync(SONGS).some(f => f.endsWith(".json")))
  execFileSync("python3", [path.join(HERE, "gen_songs.py")], { stdio: "inherit" });

const songs = fs.readdirSync(SONGS).filter(f => f.endsWith(".json")).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(SONGS, f), "utf8"))).filter(s => !ONLY || s.id.includes(ONLY));

const r2 = x => x == null ? null : Math.round(x * 100) / 100;
function metrics(pred, truth){
  const err = truth.map((t, i) => pred[i] == null || !isFinite(pred[i]) ? null : pred[i] - t), ok = err.filter(e => e != null), abs = ok.map(Math.abs), n = truth.length;
  return { mean: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : null, max: abs.length ? Math.max(...abs) : null,
    bias: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
    in025: abs.filter(e => e <= .25).length / n, in05: abs.filter(e => e <= .5).length / n, missing: n - ok.length, err };
}
function baseline(lines, a, b){ // app's own fallback: spread by word counts between vStart and vEnd
  const counts = lines.map(l => l.split(/\s+/).length), tot = counts.reduce((x, y) => x + y, 0);
  let t = a; return counts.map(c => { const s = t; t += (b - a) * c / tot; return s; });
}

async function runSong(browser, song){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
  const logs = []; page.on("pageerror", e => logs.push("pageerror: " + e.message));
  await page.goto(URL, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  const setVal = async (sel, v) => { // fill if visible, else set value + fire events
    try { await page.fill(sel, String(v), { timeout: 1500 }); }
    catch { await page.evaluate(([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [sel, String(v)]); }
  };
  const click = async sel => { try { await page.click(sel, { timeout: 1500 }); } catch { await page.evaluate(s => document.querySelector(s).click(), sel); } };

  await setVal("#lyrics", song.lines.join("\n"));
  await click('[data-sync="auto"]');
  await page.setInputFiles("#mp3", path.join(SONGS, song.id + ".mp3"));
  const t0 = Date.now(); let ana = false;
  while (Date.now() - t0 < 25000){
    ana = await page.evaluate("typeof voiceAna !== 'undefined' && !!voiceAna && voiceAna.ok !== undefined");
    if (ana) break; await page.waitForTimeout(200);
  }
  const anaMs = Date.now() - t0;
  const vStart = Math.max(0, +(song.starts[0] - 1.5).toFixed(2)), vEnd = +(song.ends[song.ends.length - 1] + 1).toFixed(2);
  await click('[data-sync="auto"]');           // make sure the auto panel is the active one
  await setVal("#vStart", vStart); await setVal("#vEnd", vEnd);
  await click("#autoGo"); await page.waitForTimeout(300);
  const st = await page.evaluate(`({
    lineStarts: (typeof lineStarts !== 'undefined' && lineStarts) ? lineStarts.slice() : null,
    ok: (typeof voiceAna !== 'undefined' && voiceAna) ? voiceAna.ok : null,
    cands: (typeof voiceAna !== 'undefined' && voiceAna && voiceAna.cands) ? voiceAna.cands.map(c => ({t: c.t, s: c.s})) : [],
    nLines: lyricLines().length,
    status: (document.getElementById('syncStatus') || {}).textContent || '' })`);
  await ctx.close();
  return { ...st, anaMs, analysisDone: ana, vStart, vEnd, logs };
}

(async () => {
  try { const r = await fetch(URL); if (!r.ok) throw new Error("HTTP " + r.status); }
  catch (e) { console.error(`App not reachable at ${URL} (${e.message}). Start the local server first; this bench does not start it.`); process.exit(2); }
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const results = [];
  for (const song of songs){
    process.stderr.write(`… ${song.id}\n`);
    const r = await runSong(browser, song);
    const truth = song.starts, n = truth.length;
    const pred = (r.lineStarts || []).slice(0, n); while (pred.length < n) pred.push(null);
    const base = baseline(song.lines, r.vStart, r.vEnd);
    const T = r.cands.map(c => c.t);
    const recall = truth.filter(t => T.some(c => Math.abs(c - t) <= .2)).length;
    const recall35 = truth.filter(t => T.some(c => Math.abs(c - t) <= .35)).length;
    const lags = truth.map(t => T.length ? T.reduce((x, y) => Math.abs(y - t) < Math.abs(x - t) ? y : x) - t : null).filter(d => d != null && Math.abs(d) <= .5).sort((a, b) => a - b);
    const candLag = lags.length ? lags[Math.floor(lags.length / 2)] : null;
    const inSpan = T.filter(t => t >= r.vStart && t <= r.vEnd);
    // candidate in a pure-instrumental region (not within [start-0.2, end+0.3] of any line) = false alarm from music
    const music = inSpan.filter(t => !truth.some((s, i) => t >= s - .2 && t <= song.ends[i] + .3));
    const nearWord = song.words && song.words.length ? inSpan.filter(t => song.words.some(w => Math.abs(w[1] - t) <= .15)).length : null;
    const usedVoice = /calées sur la voix/.test(r.status);
    results.push({ id: song.id, meta: song.meta, nLines: n, analysisOk: r.ok, analysisMs: r.anaMs, usedVoice, status: r.status,
      vStart: r.vStart, vEnd: r.vEnd, app: metrics(pred, truth), baseline: metrics(base, truth),
      detector: { nCands: T.length, nCandsInSpan: inSpan.length, recall02: recall, recall035: recall35, medianCandLag: candLag, candsInInstrumental: music.length, candsNearWordStart: nearWord },
      truth, pred, base, cands: r.cands, lines: song.lines, ends: song.ends, logs: r.logs });
  }
  await browser.close();

  const pct = x => x == null ? "  -" : String(Math.round(x * 100)).padStart(3) + "%";
  const f2 = x => x == null ? "   -" : x.toFixed(2).padStart(5);
  const H = "song                          | lines | APP mean  max  bias  ≤.25  ≤.5 | BASE mean  max  ≤.25  ≤.5 | cands span rec@.2 rec@.35 lag  inInstr | voice?";
  console.log("\n" + H + "\n" + "-".repeat(H.length));
  for (const r of results){
    const a = r.app, b = r.baseline, d = r.detector;
    console.log(`${r.id.padEnd(30)}| ${String(r.nLines).padStart(5)} | ${f2(a.mean)} ${f2(a.max)} ${f2(a.bias)} ${pct(a.in025)} ${pct(a.in05)} | ${f2(b.mean)} ${f2(b.max)} ${pct(b.in025)} ${pct(b.in05)} | ${String(d.nCands).padStart(5)} ${String(d.nCandsInSpan).padStart(4)} ${String(d.recall02 + "/" + r.nLines).padStart(7)} ${String(d.recall035 + "/" + r.nLines).padStart(6)} ${f2(d.medianCandLag)} ${String(d.candsInInstrumental).padStart(7)} | ${r.usedVoice ? "yes" : "NO"}${r.analysisOk === true ? "" : " (ana " + r.analysisOk + ")"}${a.missing ? " missing=" + a.missing : ""}`);
  }
  const all = k => { const e = results.flatMap(r => r[k].err.filter(x => x != null).map(Math.abs)), n = results.reduce((s, r) => s + r.nLines, 0);
    return `mean ${(e.reduce((x, y) => x + y, 0) / e.length).toFixed(2)} s, ≤0.25 s ${Math.round(100 * e.filter(x => x <= .25).length / n)}%, ≤0.5 s ${Math.round(100 * e.filter(x => x <= .5).length / n)}%`; };
  const rec = results.reduce((s, r) => s + r.detector.recall02, 0), nl = results.reduce((s, r) => s + r.nLines, 0);
  console.log(`\nALL  app: ${all("app")}   |   baseline: ${all("baseline")}   |   detector recall@0.2 s: ${rec}/${nl}`);
  if (VERBOSE) for (const r of results){
    console.log(`\n# ${r.id}   (cands in span: ${r.cands.filter(c => c.t >= r.vStart && c.t <= r.vEnd).map(c => c.t.toFixed(2)).join(" ")})`);
    r.truth.forEach((t, i) => { const p = r.pred[i], e = r.app.err[i], T = r.cands.map(c => c.t), near = T.length ? T.reduce((x, y) => Math.abs(y - t) < Math.abs(x - t) ? y : x) : null;
      console.log(`  ${String(i + 1).padStart(2)} true ${t.toFixed(2).padStart(6)}  app ${p == null ? "   -  " : p.toFixed(2).padStart(6)}  err ${e == null ? "  -  " : (e >= 0 ? "+" : "") + e.toFixed(2)}  base ${(r.base[i] - t >= 0 ? "+" : "") + (r.base[i] - t).toFixed(2)}  nearestCand ${near == null ? "-" : (near - t >= 0 ? "+" : "") + (near - t).toFixed(2)}  ${Math.abs(e) > .5 ? "<<" : "  "} ${r.lines[i]}`); });
  }
  const payload = { date: new Date().toISOString(), url: URL, results };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
  fs.writeFileSync(path.join(path.dirname(OUT), `results_${payload.date.replace(/[:.]/g, "-")}.json`), JSON.stringify(payload));
  console.log(`\nSaved ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
