#!/usr/bin/env python3
"""Reel « lyric kinetic » : image(s) fixe(s) + paroles mot à mot + étalonnage + grain + glitch.
Usage: render.py words.json audio.mp3 start end out.mp4 bg1 [bg2 ...]
Env : STYLE (JSON), BGTIMES="t1,t2,...", MARQUEE (s), INTRO, OUTRO1, OUTRO2, OUTRO_SEC
"""
import sys, os, json, re, random, subprocess, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

W, H, FPS = 1080, 1920, 30
_FD = os.environ.get('FONTS_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts'))
FONTS = {'oswald': os.path.join(_FD, 'Oswald.ttf'), 'bebas': os.path.join(_FD, 'BebasNeue-Regular.ttf'),
         'playfair': os.path.join(_FD, 'PlayfairDisplay.ttf'), 'montserrat': os.path.join(_FD, 'Montserrat.ttf')}
ST = dict(font='oswald', color='#F0F0F0', accent='#F0F0F0', anim='pop', look='nuit',
          glitch=1, leaks=1, grain=1.0, wear=1)
ST.update(json.loads(os.environ.get('STYLE', '{}')))
random.seed(7); rng = np.random.default_rng(7)

words_f, audio, T0, T1, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
bgs = sys.argv[6:]
INTRO = os.environ.get('INTRO', '')
OUT1, OUT2 = os.environ.get('OUTRO1', ''), os.environ.get('OUTRO2', '')
OUTRO_SEC = float(os.environ.get('OUTRO_SEC', '0')) if (OUT1 or OUT2) else 0
MARQUEE = float(os.environ.get('MARQUEE', '9'))
CUTS = [float(x) for x in os.environ.get('BGTIMES', '').split(',') if x]

def hexrgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
COL, ACC = hexrgb(ST['color']), hexrgb(ST['accent'])

# ---------- paroles -> phrases ----------
words = []
for w, a, b, *_ in json.load(open(words_f)):
    w = re.sub(r'[«»‭‬]', '', w).strip()
    if w: words.append([w, a, b])
words = [w for w in words if T0 - 0.3 <= w[1] < T1]
STOP = set("le la les l de du des d un une mon ma mes ton ta tes son sa ses et je j tu il elle on nous vous ils que qui qu à a au aux en y ne n pas me m te t se s ce c dans sur pour par".split())
def is_stop(w): return re.sub(r"[^a-zàâäéèêëîïôöùûüç']", '', w.lower()).split("'")[-1] in STOP
phrases, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    if nxt is None or re.search(r'[,.:;!?–…]$', w[0]) or nxt[1] - w[2] > 0.7 or (len(cur) >= 4 and not is_stop(w[0])) or len(cur) >= 6:
        phrases.append(cur); cur = []
LOOKS = {'nuit': ['bw', 'bw', 'green', 'orange', 'teal'], 'dore': ['warm', 'warm', 'gold', 'warm2'],
         'clair': ['orig', 'orig', 'origw', 'soft'], 'nb': ['bw', 'bw', 'bw', 'teal']}
for i, p in enumerate(phrases):
    p_end = phrases[i + 1][0][1] if i + 1 < len(phrases) else T1
    phrases[i] = dict(words=p, start=p[0][1], end=min(p_end, p[-1][2] + 2.5), idx=i,
                      grade=random.choice(LOOKS[ST['look']]), fx=random.random())
    phrases[i]['leak'] = ST['leaks'] and 0.35 <= phrases[i]['fx'] < 0.6
last_word_end = words[-1][2] if words else T0

def clean(w): return re.sub(r'[\s,.:;!?–…]+$', '', w).upper()
def emph(ws):
    if len(ws) < 2: return -1
    if not is_stop(ws[-1][0]) and len(clean(ws[-1][0])) >= 4: return len(ws) - 1
    best, bl = -1, 0
    for i, w in enumerate(ws):
        if not is_stop(w[0]) and len(clean(w[0])) > bl: best, bl = i, len(clean(w[0]))
    return best
for ph in phrases: ph['emph'] = emph(ph['words'])

# ---------- fonds étalonnés ----------
def load_bg(path):
    im = Image.open(path).convert('RGB')
    s = max(W * 1.07 / im.width, H * 1.07 / im.height)
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)

def grade(im, mode):
    a = np.asarray(im).astype(np.float32) / 255
    g = (a @ np.array([0.3, 0.59, 0.11], np.float32))[..., None]
    m = {'bw': lambda: g * np.array([0.95, 0.97, 1.0]),
         'green': lambda: (0.45 * a + 0.55 * g) * np.array([0.82, 1.05, 0.72]),
         'orange': lambda: (0.4 * a + 0.6 * g) * np.array([1.25, 0.82, 0.45]),
         'teal': lambda: (0.5 * a + 0.5 * g) * np.array([0.75, 0.95, 1.05]),
         'warm': lambda: (0.8 * a + 0.2 * g) * np.array([1.10, 1.0, 0.82]),
         'warm2': lambda: (0.8 * a + 0.2 * g) * np.array([1.18, 0.98, 0.72]),
         'gold': lambda: (0.6 * a + 0.4 * g) * np.array([1.22, 1.05, 0.62]),
         'orig': lambda: a, 'origw': lambda: a * np.array([1.06, 1.0, 0.92]),
         'soft': lambda: (0.85 * a + 0.15 * g) * np.array([1.0, 1.0, 1.04])}[mode]()
    if ST['look'] in ('dore', 'clair'):
        o = np.clip(m, 0, 1) ** 0.82                       # éclaircit les ombres
    else:
        o = np.clip((m - 0.5) * 1.12 + 0.5, 0, 1) ** 1.05
    return Image.fromarray((np.clip(o, 0, 1) * 255).astype(np.uint8))

MODES = sorted(set(LOOKS[ST['look']]))
BG = [{md: grade(load_bg(p), md) for md in MODES} for p in bgs]

yy, xx = np.mgrid[0:H, 0:W]
VMIN = {'nuit': 0.5, 'nb': 0.5, 'dore': 0.68, 'clair': 0.82}[ST['look']]
GAIN = {'nuit': 1.12, 'nb': 1.1, 'dore': 1.12, 'clair': 1.08}[ST['look']]
vign = (1 - 0.75 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.45) / (H * 0.7)) ** 2)).clip(VMIN, 1)[..., None].astype(np.float32) * GAIN
grains = [rng.normal(0, 14 * ST['grain'], (H // 2, W // 2)).astype(np.float32) for _ in range(6)]
grains = [np.asarray(Image.fromarray(g).resize((W, H)))[..., None] for g in grains]
wear = Image.fromarray((rng.random((H // 3, W // 3)) > 0.12).astype(np.uint8) * 255).resize((W, H), Image.NEAREST).filter(ImageFilter.GaussianBlur(0.6))
leak_x = (xx / W).astype(np.float32)

_fc = {}
def font(sz):
    sz = int(sz)
    if sz not in _fc:
        f = ImageFont.truetype(FONTS[ST['font']], sz)
        try: f.set_variation_by_name('Bold')
        except Exception: pass
        _fc[sz] = f
    return _fc[sz]

def fit(text, sz, maxw):
    while sz > 30 and font(sz).getlength(text) > maxw: sz -= 4
    return sz

def ease(x): x = max(0, min(1, x)); return 1 - (1 - x) ** 3

def centered(d, txt, sz, y, fill, dx=0):
    f = font(sz); d.text(((W - f.getlength(txt)) / 2 + dx, y), txt, font=f, fill=fill)

# ---------- rendu d'une frame ----------
def frame(t):
    p = next((p for p in phrases if p['start'] <= t < p['end']), None)
    bi = (sum(t >= c for c in CUTS) if CUTS else (p['idx'] if p else 0)) % len(BG)
    mode = p['grade'] if p else LOOKS[ST['look']][0]
    if p:
        for k, w in enumerate(p['words']):
            if w[1] <= t < w[1] + 0.12 and (p['idx'] + k) % 3 == 2:
                alt = [m for m in MODES if m != mode]; mode = alt[(p['idx'] + k) % len(alt)] if alt else mode
    src = BG[bi][mode]
    z = 1.0 + 0.06 * (t - T0) / max(1, T1 - T0)
    cw, ch = src.width / 1.07 / z, src.height / 1.07 / z
    sx = (src.width - cw) / 2 + math.sin(t * 1.7) * 6; sy = (src.height - ch) / 2 + math.cos(t * 1.3) * 6
    img = src.crop((sx, sy, sx + cw, sy + ch)).resize((W, H), Image.BILINEAR)

    mM = Image.new('L', (W, H), 0); mA = Image.new('L', (W, H), 0)
    dM, dA = ImageDraw.Draw(mM), ImageDraw.Draw(mA)
    ghost = None
    out_start = T1 - OUTRO_SEC if OUTRO_SEC else T1 + 1
    marquee = (T1 - MARQUEE) < t < out_start and t > last_word_end - 6 and MARQUEE > 0
    first_word = words[0][1] if words else T1
    if INTRO and T0 + 0.3 < t < first_word - 0.3 and first_word - T0 > 2:
        a = min(ease((t - T0 - 0.3) / 0.8), ease((first_word - 0.3 - t) / 0.6))
        centered(dM, 'FAIT PAR', 64, H * 0.36, int(235 * a))
        txt = INTRO.upper(); centered(dA, txt, fit(txt, 140, W * 0.86), H * 0.36 + 90, int(245 * a))
    elif t >= out_start:
        a = ease((t - out_start) / 1.0) * ease((T1 - t) / 0.8 + 0.2)
        if OUT1: centered(dA, OUT1.upper(), fit(OUT1.upper(), 150, W * 0.86), H * 0.36, int(245 * a))
        if OUT2: centered(dM, OUT2.upper(), fit(OUT2.upper(), 90, W * 0.8), H * 0.36 + 175, int(235 * a))
    elif p and not marquee:
        items = []
        for k, w in enumerate(p['words']):
            big = k == p['emph']
            items.append((clean(w[0]), fit(clean(w[0]), 175 if big else 92, W * 0.84), w[1], w[2], big))
        y = H * 0.40 - sum(s * 1.0 for _, s, *_ in items) / 2
        for txt, sz, ws, we, big in items:
            if ws > t:
                y += sz * 1.0; continue
            an = ST['anim']; dur = {'fade': 0.3, 'impact': 0.14, 'slide': 0.26}.get(an, 0.18)
            a = 1 - (1 - min(1, max(0, (t - ws) / dur))) ** 5; s2, dy, tx = sz, 0, txt
            if an == 'pop': s2 = int(sz * (1.14 - 0.14 * a)); a = min(1, (t - ws) / 0.09)
            elif an == 'impact': s2 = int(sz * (1.7 - 0.7 * a)); a = 1
            elif an == 'slide': dy = sz * 0.3 * (1 - a)
            elif an == 'type':
                k = math.ceil(len(txt) * min(1, (t - ws) / max(0.2, min(0.6, we - ws)))); tx = txt[:max(1, k)]; a = 1
            f = font(s2); tw = f.getlength(txt)
            jx = (hash(txt) % 7 - 3) if (t - ws < 0.18 and an == 'pop') else 0
            (dA if big else dM).text(((W - tw) / 2 + jx, y + dy + (sz - s2) * 0.5), tx, font=f, fill=int(240 * a))
            y += sz * 1.0
    elif marquee:
        ws_ = [clean(w[0]) for w in words if T1 - MARQUEE - 1 <= w[1] <= t][-7:]
        off = 45 * math.sin((t - (T1 - MARQUEE)) * 0.6)
        half = (len(ws_) + 1) // 2
        for li, ln in enumerate([' '.join(ws_[:half]), ' '.join(ws_[half:])]):
            if ln:
                sz = fit(ln, 100, W * 0.9); centered(dM, ln, sz, H * 0.40 + li * sz * 1.1, 235, off if li == 0 else -off)
        if ws_:
            ghost = Image.new('L', (W, H), 0); gw = ws_[-1]
            centered(ImageDraw.Draw(ghost), gw, fit(gw, 300, W * 0.95), H * 0.62, 140, -off * 2)
            ghost = ghost.filter(ImageFilter.GaussianBlur(9))
    if ST['wear']:
        mM = ImageChops.multiply(mM, wear); mA = ImageChops.multiply(mA, wear)

    a = np.asarray(img).astype(np.float32)
    if p and not marquee:
        if p['emph'] >= 0:
            ew = p['words'][p['emph']][1]
            if t >= ew: a *= 1 + 0.18 * max(0, 1 - (t - ew) / 0.12)
    a *= vign
    if p and p['leak']:
        k = max(0, 1 - (t - p['start']) / 0.9)
        a += (k * 170 * leak_x ** 3)[..., None] * np.array([1.0, 0.35, 0.1])
    a += grains[int(t * FPS) % len(grains)]
    a *= 0.97 + 0.03 * math.sin(t * 37)
    # ombre douce derrière le texte (lisibilité sur images claires)
    both = ImageChops.lighter(mM, mA)
    if both.getbbox():
        sh = np.asarray(both.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3.5)).resize((W, H), Image.BILINEAR)).astype(np.float32)[..., None] / 255
    else:
        sh = 0
    a *= 1 - 0.55 * np.clip(sh * 1.6, 0, 1)
    for m, c in ((mM, COL), (mA, ACC)):
        if not m.getbbox(): continue
        L = np.asarray(m).astype(np.float32)[..., None] / 255
        a = a * (1 - L) + c * L
    if ghost is not None:
        G = np.asarray(ghost).astype(np.float32)[..., None] / 255 * 0.6
        a = a * (1 - G) + ACC * G
    a = np.clip(a, 0, 255).astype(np.uint8)
    if ST['glitch'] and p and p['fx'] < 0.35 and 0 <= t - p['start'] < 0.067:
        for _ in range(5):
            y0 = random.randint(0, H - 80); hh = random.randint(10, 70)
            a[y0:y0 + hh] = np.roll(a[y0:y0 + hh], random.randint(-60, 60), axis=1)
        a[..., 0] = np.roll(a[..., 0], 8, axis=1); a[..., 2] = np.roll(a[..., 2], -8, axis=1)
        if p['fx'] < 0.15:
            y0 = random.randint(int(H * .3), int(H * .5)); a[y0:y0 + 40, int(W * .4):] = (a[y0:y0 + 40, int(W * .4):] * 0.4 + 150).astype(np.uint8)
    return a.tobytes()

if __name__ == '__main__':
    if os.environ.get('PREVIEW'):        # images fixes de contrôle
        for tt in [float(x) for x in os.environ['PREVIEW'].split(',')]:
            Image.frombytes('RGB', (W, H), frame(tt)).resize((360, 640)).save(f'{out}_{tt:.1f}.jpg')
        sys.exit()
    N = int((T1 - T0) * FPS)
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-ss', str(T0), '-t', str(T1 - T0), '-i', audio,
                           '-af', f'afade=in:d=0.4,afade=out:st={T1 - T0 - 1.2}:d=1.2',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-tune', 'grain', '-maxrate', '10M', '-bufsize', '20M',
                           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
                          stdin=subprocess.PIPE)
    for i in range(N):
        ff.stdin.write(frame(T0 + i / FPS))
        if i % 300 == 0: print(i, '/', N, flush=True)
    ff.stdin.close(); ff.wait(); print('done', out)
