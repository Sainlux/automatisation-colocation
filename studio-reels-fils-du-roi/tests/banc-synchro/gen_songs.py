#!/usr/bin/env python3
"""Generate 5 synthetic French test songs with exact ground truth for lyric-line alignment.

Voice: espeak-ng phonemizer + MBROLA diphone voices (fr1 male, fr4 female). The .pho
file gives every phoneme duration, so line/word start times are exact (sample-level).
"Sung" songs: vowels lengthened, pitch forced to a melody with vibrato (pho edit).
Music: numpy (kick, snare, hats, bass, pad, arpeggio, lead), reverb by convolution.

Usage: python3 gen_songs.py            -> writes songs/<id>.mp3 + songs/<id>.json
Requires: espeak-ng, mbrola, mbrola-fr1, mbrola-fr4, ffmpeg, numpy, scipy
"""
import json, os, subprocess, tempfile, re
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "songs")
VOWELS = {"a", "e", "E", "i", "o", "O", "u", "y", "2", "9", "@", "a~", "e~", "o~", "9~", "A"}
VOICED_CONS = {"l", "R", "m", "n", "j", "w", "H", "v", "z", "Z", "b", "d", "g", "N"}

SONGS = [
    dict(id="s1_ps23_clair", voice="fr1", rate=135, sung=False, reverb=False, voice_db=+10,
         bpm=92, intro=6.0, arp=False, dense=False, seed=1, key=0,
         gaps=[0.6, 1.2, 0.4, 1.5, 0.3, 4.0, 0.8, 0.2, 1.0, 0.6, 1.4],
         lines=["L'Éternel est mon berger", "je ne manquerai de rien",
                "Il me fait reposer dans de verts pâturages", "Il me dirige près des eaux paisibles",
                "Il restaure mon âme", "Il me conduit dans les sentiers de la justice",
                "à cause de son nom", "Quand je marche dans la vallée de l'ombre de la mort",
                "je ne crains aucun mal, car tu es avec moi", "Ta houlette et ton bâton me rassurent",
                "Tu dresses devant moi une table", "en face de mes adversaires"]),
    dict(id="s2_ps91_chante_reverb", voice="fr4", rate=105, sung=True, reverb=True, voice_db=+9,
         bpm=76, intro=8.0, arp=False, dense=False, seed=2, key=5,
         gaps=[0.8, 1.6, 0.5, 0.3, 3.5, 1.0, 0.25, 1.8, 0.6, 0.7],
         lines=["Celui qui demeure sous l'abri du Très-Haut", "repose à l'ombre du Tout-Puissant",
                "Je dis à l'Éternel", "Mon refuge et ma forteresse", "Mon Dieu en qui je me confie",
                "Car c'est lui qui te délivre du filet de l'oiseleur", "Il te couvrira de ses plumes",
                "et tu trouveras un refuge sous ses ailes", "Sa fidélité est un bouclier et une cuirasse",
                "Tu ne craindras ni les terreurs de la nuit", "ni la flèche qui vole de jour"]),
    dict(id="s3_ps121_chante_3dB_arpege", voice="fr1", rate=110, sung=True, reverb=False, voice_db=+3,
         bpm=100, intro=5.0, arp=True, dense=False, seed=3, key=2,
         gaps=[0.5, 1.0, 0.2, 2.0, 0.6, 0.9, 0.3, 4.5, 0.7],
         lines=["Je lève mes yeux vers les montagnes", "D'où me viendra le secours",
                "Le secours me vient de l'Éternel", "qui a fait les cieux et la terre",
                "Il ne permettra point que ton pied chancelle", "Celui qui te garde ne sommeillera point",
                "Voici, il ne sommeille ni ne dort", "celui qui garde Israël",
                "L'Éternel est celui qui te garde", "L'Éternel est ton ombre à ta main droite"]),
    dict(id="s4_ps27_parle_3dB_reverb", voice="fr4", rate=160, sung=False, reverb=True, voice_db=+3,
         bpm=118, intro=4.5, arp=False, dense=False, seed=4, key=7,
         gaps=[0.05, 1.1, 0.05, 0.9, 0.3, 3.0, 0.05, 1.3, 0.4, 2.0, 0.1],
         lines=["L'Éternel est ma lumière et mon salut", "De qui aurais-je crainte ?",
                "L'Éternel est le soutien de ma vie", "De qui aurais-je peur ?",
                "Quand des méchants s'avancent contre moi", "pour dévorer ma chair",
                "ce sont mes persécuteurs et mes ennemis", "qui chancellent et tombent",
                "Si une armée se campait contre moi", "mon cœur n'aurait aucune crainte",
                "Je demande à l'Éternel une chose", "que je désire ardemment"]),
    dict(id="s5_ps46_chante_dense_0dB", voice="fr1", rate=115, sung=True, reverb=False, voice_db=0,
         bpm=124, intro=10.0, arp=True, dense=True, seed=5, key=9,
         gaps=[0.4, 1.5, 0.2, 0.8, 3.0, 0.3, 1.2, 0.05, 0.9, 0.5, 1.7],
         lines=["Dieu est pour nous un refuge et un appui", "un secours qui ne manque jamais dans la détresse",
                "C'est pourquoi nous sommes sans crainte", "quand la terre est bouleversée",
                "et que les montagnes chancellent au cœur des mers", "quand les flots de la mer mugissent",
                "écument, se soulèvent jusqu'à faire trembler les montagnes", "Il est un fleuve dont les courants",
                "réjouissent la cité de Dieu", "Dieu est au milieu d'elle", "elle n'est point ébranlée",
                "Dieu la secourt dès l'aube du matin"]),
]

# ---------------------------------------------------------------- voice

def get_pho(text, voice, rate):
    out = subprocess.run(["espeak-ng", "-v", "mb-" + voice, "-s", str(rate), "-q", "--pho", text],
                         capture_output=True, text=True, check=True).stdout
    ph = []
    for ln in out.splitlines():
        p = ln.split()
        if not p or p[0].startswith(";"):
            continue
        ph.append([p[0], int(p[1]), [float(x) for x in p[2:]]])
    return ph


def strip_sil(ph):
    while ph and ph[0][0] == "_": ph = ph[1:]
    while ph and ph[-1][0] == "_": ph = ph[:-1]
    return ph


def make_sung(ph, rng, base_hz, scale):
    """Lengthen vowels, set each syllable to a melody note with vibrato."""
    nv = sum(1 for p in ph if p[0] in VOWELS)
    # simple melodic contour: random walk on the scale, ends on tonic
    deg, notes = 2, []
    for i in range(nv):
        deg = int(np.clip(deg + rng.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(scale) - 1))
        notes.append(deg)
    if notes: notes[-1] = 0 if rng.random() < .6 else 2
    vi, out = 0, []
    cur_note = base_hz * 2 ** (scale[notes[0]] / 12) if notes else base_hz
    for k, (sym, dur, _) in enumerate(ph):
        if sym == "_":
            out.append([sym, dur, []]); continue
        if sym in VOWELS:
            f = base_hz * 2 ** (scale[notes[vi]] / 12)
            last = vi == nv - 1
            d = int(dur * rng.uniform(1.9, 2.6)) if not last else int(rng.uniform(650, 950))
            d = max(d, 140)
            pts, prev = [], cur_note
            n = max(4, int(d / 40))
            for j in range(n + 1):
                pct = 100 * j / n; t = d * j / n / 1000
                glide = min(1, t / 0.06)
                vib = 0.022 * np.sin(2 * np.pi * 5.6 * t) * min(1, max(0, (t - 0.12) / 0.15))
                hz = (prev * (1 - glide) + f * glide) * (1 + vib)
                pts += [round(pct, 1), round(hz, 1)]
            out.append([sym, d, pts]); cur_note = f; vi += 1
        else:
            d = int(dur * (1.15 if sym in VOICED_CONS else 1.0))
            out.append([sym, d, [0, round(cur_note, 1), 100, round(cur_note, 1)]])
    return out


def synth_pho(ph, voice):
    with tempfile.TemporaryDirectory() as td:
        pf, wf = os.path.join(td, "x.pho"), os.path.join(td, "x.wav")
        with open(pf, "w") as f:
            f.write("_ 30\n")
            for sym, dur, pts in ph:
                f.write(f"{sym} {dur} " + " ".join(str(x) for x in pts) + "\n")
            f.write("_ 30\n")
        subprocess.run(["mbrola", "-e", f"/usr/share/mbrola/{voice}/{voice}", pf, wf], check=True,
                       capture_output=True)
        import wave
        with wave.open(wf) as w:
            sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    x = resample_poly(x, SR, sr)
    lead = 0.030  # the "_ 30" we prepended
    return x, lead


def word_times(line, voice, rate, ph):
    """Best-effort word starts: match each word's own phoneme sequence in the line's sequence."""
    syms = [p[0] for p in ph]
    t, starts = 0.0, []
    for p in ph: starts.append(t); t += p[1] / 1000
    res, cur = [], 0
    for w in line.split():
        clean = re.sub(r"[^\w'’-]", "", w)
        wp = [p[0] for p in strip_sil(get_pho(clean, voice, rate))] if clean else []
        idx = None
        if wp:
            for c in range(cur, min(cur + 3, len(syms))):
                if syms[c] == wp[0]: idx = c; break
        if idx is None: idx = min(cur, len(syms) - 1)
        res.append([w, idx])
        cur = idx + max(1, len(wp) - 1)
    out = []
    for i, (w, idx) in enumerate(res):
        s = starts[idx]
        e = starts[res[i + 1][1]] if i + 1 < len(res) else t
        out.append([w, s, max(e, s + 0.02)])
    return out, t

# ---------------------------------------------------------------- music

def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def saw(freq, n, ph0=0.0):
    t = np.arange(n) / SR
    return 2 * ((freq * t + ph0) % 1) - 1


def add(buf, pos, sig):
    i = int(pos * SR)
    if i >= len(buf): return
    m = min(len(sig), len(buf) - i); buf[i:i + m] += sig[:m]


def make_music(cfg, dur, rng):
    n = int(dur * SR); beat = 60 / cfg["bpm"]; bar = 4 * beat
    kick, snare, hats, bass, pad, arp, lead = (np.zeros(n) for _ in range(7))
    root = 110 * 2 ** (cfg["key"] / 12) / 2   # A1-ish region
    prog = [0, 9, 5, 7] if cfg["key"] % 2 == 0 else [0, 5, 9, 7]  # I vi IV V / I IV vi V
    triad = {0: [0, 4, 7], 9: [9, 12, 16], 5: [5, 9, 12], 7: [7, 11, 14]}
    # drum one-shots
    kn = int(.35 * SR); tk = np.arange(kn) / SR
    kick1 = np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-tk / .03)) / SR) * env_exp(kn, .09)
    sn = int(.25 * SR)
    snare1 = bp(rng.standard_normal(sn), 300, 7000) * env_exp(sn, .055) + .6 * np.sin(2 * np.pi * 185 * np.arange(sn) / SR) * env_exp(sn, .04)
    hn = int(.06 * SR)
    hat1 = hp(rng.standard_normal(hn), 7000) * env_exp(hn, .012)
    nb = int(dur / bar) + 1
    for b in range(nb):
        t0 = b * bar
        chord = prog[b % 4]
        drums_on = t0 >= min(cfg["intro"] - 2 * bar, cfg["intro"] * .5) or cfg["dense"]
        for q in range(4):
            tb = t0 + q * beat
            if drums_on:
                if q in (0, 2): add(kick, tb, kick1)
                if cfg["dense"] and q == 3: add(kick, tb + beat / 2, kick1 * .7)
                if q in (1, 3): add(snare, tb, snare1 * rng.uniform(.85, 1))
                for s in range(4 if cfg["dense"] else 2):
                    add(hats, tb + s * beat / (4 if cfg["dense"] else 2), hat1 * rng.uniform(.5, 1))
            # bass: root on each beat (8ths if dense)
            for s in range(2 if cfg["dense"] else 1):
                f = root * 2 ** (chord / 12); ln = int(beat / (2 if cfg["dense"] else 1) * SR * .9)
                add(bass, tb + s * beat / 2, lp(saw(f, ln), 300) * env_exp(ln, .25))
        # pad: sustained chord, octave 3-4
        ln = int(bar * SR)
        a = np.minimum(1, np.arange(ln) / (.3 * SR)) * np.minimum(1, (ln - np.arange(ln)) / (.2 * SR))
        p = sum(saw(root * 4 * 2 ** (iv / 12) * (1 + d), ln, rng.random()) for iv in triad[chord] for d in (-.004, .004))
        add(pad, t0, lp(p, 1800 if cfg["dense"] else 1200) * a)
        # arpeggio: plucked 16ths, mid band (300-1500 Hz)
        if cfg["arp"]:
            notes = triad[chord] + [triad[chord][0] + 12]
            for s in range(16):
                f = root * 8 * 2 ** (notes[(s * 3) % 4 if s % 2 else s % 4] / 12)
                ln2 = int(beat / 4 * SR)
                tone = np.sign(np.sin(2 * np.pi * f * np.arange(ln2) / SR)) * .5 + saw(f, ln2) * .5
                add(arp, t0 + s * beat / 4, lp(tone, 3000) * env_exp(ln2, .07))
        # dense: lead stabs / strummed guitar-like chord on off-beats
        if cfg["dense"]:
            for q in (0.5, 1.5, 2.5, 3.5):
                ln3 = int(beat * .45 * SR)
                st = sum(saw(root * 8 * 2 ** (iv / 12), ln3) for iv in triad[chord])
                add(lead, t0 + q * beat, bp(st, 400, 3500) * env_exp(ln3, .09))
    mix = (1.0 * kick + .55 * snare + .25 * hats + .7 * bass + .22 * pad
           + (.35 if cfg["dense"] else .28) * arp + .3 * lead)
    # fade-in on music start, fade-out at end
    mix *= np.minimum(1, np.arange(n) / (1.0 * SR)) * np.minimum(1, (n - np.arange(n)) / (2.5 * SR))
    return mix


def reverb(x, rng, rt=1.6, wet=.35):
    n = int(rt * SR)
    ir = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / n)
    ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    pre = int(.02 * SR)
    w = np.concatenate([np.zeros(pre), fftconvolve(x, ir)[:len(x) - pre]])
    return (1 - wet) * x + wet * w * (np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(w ** 2)) + 1e-12))

# ---------------------------------------------------------------- build

def build(cfg):
    rng = np.random.default_rng(cfg["seed"])
    voice = cfg["voice"]; base = 118 if voice == "fr1" else 215
    scale = [0, 2, 4, 5, 7, 9, 11, 12]
    segs, t = [], cfg["intro"]
    starts, ends, words = [], [], []
    for i, line in enumerate(cfg["lines"]):
        ph = strip_sil(get_pho(line, voice, cfg["rate"]))
        wt, _ = word_times(line, voice, cfg["rate"], ph) if not cfg["sung"] else (None, None)
        if cfg["sung"]:
            ph_s = make_sung(ph, rng, base * 2 ** (cfg["key"] / 12 / 2), scale)
            # word times re-computed on the sung phoneme durations (same phoneme order)
            wt_raw, _ = word_times(line, voice, cfg["rate"], ph)
            idx_map, acc_old, acc_new = {}, 0.0, 0.0
            olds, news = [], []
            for po, pn in zip(ph, ph_s): olds.append(acc_old); news.append(acc_new); acc_old += po[1] / 1000; acc_new += pn[1] / 1000
            olds.append(acc_old); news.append(acc_new)
            wt = [[w, float(np.interp(s, olds, news)), float(np.interp(e, olds, news))] for w, s, e in wt_raw]
            ph = ph_s
        x, lead = synth_pho(ph, voice)
        total = sum(p[1] for p in ph) / 1000
        pos = t - lead
        segs.append((pos, x))
        starts.append(round(t, 3)); ends.append(round(t + total, 3))
        words += [[w, round(t + s, 3), round(t + e, 3)] for w, s, e in wt]
        if i < len(cfg["gaps"]): t = t + total + cfg["gaps"][i]
    dur = ends[-1] + 5.0
    n = int(dur * SR)
    v = np.zeros(n)
    for pos, x in segs: add(v, pos, x)
    v = hp(v, 70)
    if cfg["reverb"]: v = reverb(v, rng)
    music = make_music(cfg, dur, rng)
    # level: voice RMS vs music RMS, measured over sung regions only
    mask = np.zeros(n, bool)
    for s, e in zip(starts, ends): mask[int(s * SR):int(e * SR)] = True
    rv = np.sqrt(np.mean(v[mask] ** 2)); rm = np.sqrt(np.mean(music[mask] ** 2))
    v *= (rm / rv) * 10 ** (cfg["voice_db"] / 20)
    mix = v + music
    mix *= 0.89 / np.max(np.abs(mix))
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, cfg["id"] + ".wav"); mp3 = os.path.join(OUT, cfg["id"] + ".mp3")
    import wave
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "2", "-b:a", "160k", mp3], check=True)
    os.remove(wav)
    truth = dict(id=cfg["id"], lines=cfg["lines"], starts=starts, ends=ends, words=words,
                 words_note="word times: phoneme-level from MBROLA .pho, word boundaries matched greedily (approx. +-1 phoneme)",
                 vStart=starts[0], vEnd=ends[-1], duration=round(dur, 3),
                 meta={k: cfg[k] for k in ("voice", "rate", "sung", "reverb", "voice_db", "bpm", "intro", "arp", "dense")})
    with open(os.path.join(OUT, cfg["id"] + ".json"), "w") as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)
    print(f"{cfg['id']}: {len(starts)} lines, {dur:.1f}s, voice {cfg['voice_db']:+d} dB, first {starts[0]}s last end {ends[-1]}s")


if __name__ == "__main__":
    for c in SONGS: build(c)
