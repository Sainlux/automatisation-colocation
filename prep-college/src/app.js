import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRepo } from './db.js';
import { verifyPin, newToken, createLoginLimiter, PIN_RE } from './auth.js';
import { analyzeAttempts, aiCoachSummary } from './analysis.js';
import { LEVELS, SUBJECTS, MODULES } from '../public/js/curriculum.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const COOKIE = 'pc_session';
const MAX_BODY = 32 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

export const AVATARS = ['🦊', '🐼', '🦄', '🐯', '🐸', '🦁', '🐬', '🦋', '🦉', '🌸', '🐨', '🐧', '🐙', '🐲', '🚀', '⚡', '🎸', '⚽', '🐱', '🐶', '🦖', '🐝', '🌈', '🍀'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON invalide'); }
}

const cleanName = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
const int = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

function validateStudentInput(body) {
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'Le prénom est obligatoire');
  if (!LEVELS.includes(body.level)) throw new HttpError(400, 'Niveau invalide');
  const avatar = AVATARS.includes(body.avatar) ? body.avatar : AVATARS[0];
  return { name, level: body.level, avatar };
}

function validateAttempt(body) {
  if (!LEVELS.includes(body.level)) throw new HttpError(400, 'Niveau invalide');
  if (!SUBJECTS[body.level].some((s) => s.id === body.subject) && body.subject !== 'dnb') throw new HttpError(400, 'Matière invalide');
  if (!MODULES.some((m) => m.id === body.module)) throw new HttpError(400, 'Module invalide');
  const total = int(body.total, 1, 500);
  return {
    level: body.level, subject: body.subject, module: body.module,
    skill: body.skill ? String(body.skill).slice(0, 80) : null,
    total, correct: int(body.correct, 0, total), hints: int(body.hints, 0, 500), durationS: int(body.durationS, 0, 7200)
  };
}

export function createApp(db) {
  const repo = createRepo(db);
  const limiter = createLoginLimiter();
  setInterval(() => repo.purgeSessions(), 3600 * 1000).unref();

  function currentStudent(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const id = token && repo.getSessionStudent(token);
    return id ? repo.getStudent(id) : null;
  }
  const requireUser = (req) => {
    const me = currentStudent(req);
    if (!me) throw new HttpError(401, 'Connecte-toi d’abord');
    return me;
  };
  const requireAdmin = (req) => {
    const me = requireUser(req);
    if (!me.isAdmin) throw new HttpError(403, 'Réservé à l’administrateur');
    return me;
  };
  const studentOr404 = (id) => {
    const s = repo.getStudent(Number(id));
    if (!s) throw new HttpError(404, 'Élève introuvable');
    return s;
  };

  async function fullAnalysis(student) {
    const analysis = analyzeAttempts(repo.allAttempts(student.id));
    const ai = await aiCoachSummary(student, analysis);
    return { ...analysis, coach: ai, coachSource: ai ? 'claude' : 'local' };
  }

  // Table de routage : [méthode, motif, gestionnaire]
  const routes = [
    ['GET', /^\/api\/students$/, () => repo.listStudents().map(({ id, name, level, avatar }) => ({ id, name, level, avatar }))],
    ['GET', /^\/api\/avatars$/, () => AVATARS],

    ['POST', /^\/api\/login$/, async (req, res) => {
      const { studentId, pin } = await readJson(req);
      const student = repo.getStudent(Number(studentId));
      if (!student) throw new HttpError(404, 'Élève introuvable');
      const wait = limiter.lockedFor(student.id);
      if (wait) throw new HttpError(429, `Trop d’essais. Réessaie dans ${Math.ceil(wait / 60000)} min.`);
      if (!verifyPin(String(pin ?? ''), repo.getPinHash(student.id))) {
        limiter.fail(student.id);
        throw new HttpError(401, 'Code incorrect');
      }
      limiter.success(student.id);
      const token = newToken();
      repo.createSession(token, student.id, SESSION_TTL);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
      return student;
    }],

    ['POST', /^\/api\/logout$/, (req, res) => {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) repo.deleteSession(token);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      return { ok: true };
    }],

    ['GET', /^\/api\/me$/, (req) => requireUser(req)],

    ['PUT', /^\/api\/me\/avatar$/, async (req) => {
      const me = requireUser(req);
      const { avatar } = await readJson(req);
      if (!AVATARS.includes(avatar)) throw new HttpError(400, 'Avatar inconnu');
      repo.setAvatar(me.id, avatar);
      return repo.getStudent(me.id);
    }],

    ['PUT', /^\/api\/me\/pin$/, async (req) => {
      const me = requireUser(req);
      const { currentPin, newPin } = await readJson(req);
      if (!verifyPin(String(currentPin ?? ''), repo.getPinHash(me.id))) throw new HttpError(401, 'Code actuel incorrect');
      if (!PIN_RE.test(String(newPin ?? ''))) throw new HttpError(400, 'Le nouveau code doit contenir 4 chiffres');
      if (newPin === '0000' || newPin === currentPin) throw new HttpError(400, 'Choisis un code différent');
      repo.setPin(me.id, newPin, false);
      return repo.getStudent(me.id);
    }],

    ['POST', /^\/api\/attempts$/, async (req) => {
      const me = requireUser(req);
      repo.addAttempt(me.id, validateAttempt(await readJson(req)));
      return { ok: true };
    }],

    ['GET', /^\/api\/me\/history$/, (req) => repo.history(requireUser(req).id)],
    ['GET', /^\/api\/me\/analysis$/, (req) => fullAnalysis(requireUser(req))],

    // --- Administration (Samuel uniquement) ---
    ['GET', /^\/api\/admin\/overview$/, (req) => {
      requireAdmin(req);
      return repo.overview().map((s) => ({ ...s, rate: s.total ? Math.round((s.correct / s.total) * 100) : null }));
    }],
    ['GET', /^\/api\/admin\/students\/(\d+)\/history$/, (req, res, [, id]) => {
      requireAdmin(req);
      return { student: studentOr404(id), history: repo.history(Number(id)) };
    }],
    ['GET', /^\/api\/admin\/students\/(\d+)\/analysis$/, (req, res, [, id]) => {
      requireAdmin(req);
      return fullAnalysis(studentOr404(id));
    }],
    ['POST', /^\/api\/admin\/students$/, async (req) => {
      requireAdmin(req);
      const input = validateStudentInput(await readJson(req));
      try { return repo.getStudent(repo.createStudent(input)); } catch { throw new HttpError(409, 'Ce prénom existe déjà'); }
    }],
    ['PUT', /^\/api\/admin\/students\/(\d+)$/, async (req, res, [, id]) => {
      requireAdmin(req);
      studentOr404(id);
      const input = validateStudentInput(await readJson(req));
      try { repo.updateStudent(Number(id), input); } catch { throw new HttpError(409, 'Ce prénom existe déjà'); }
      return repo.getStudent(Number(id));
    }],
    ['POST', /^\/api\/admin\/students\/(\d+)\/reset-pin$/, (req, res, [, id]) => {
      const me = requireAdmin(req);
      const s = studentOr404(id);
      if (s.id === me.id) throw new HttpError(400, 'Change ton propre code depuis ton profil');
      repo.setPin(s.id, '0000', true);
      repo.deleteSessionsOf(s.id);
      return { ok: true };
    }],
    ['DELETE', /^\/api\/admin\/students\/(\d+)\/history$/, (req, res, [, id]) => {
      requireAdmin(req);
      repo.clearHistory(studentOr404(id).id);
      return { ok: true };
    }],
    ['DELETE', /^\/api\/admin\/students\/(\d+)$/, (req, res, [, id]) => {
      requireAdmin(req);
      if (!repo.deleteStudent(studentOr404(id).id)) throw new HttpError(400, 'Impossible de supprimer l’administrateur');
      return { ok: true };
    }]
  ];

  async function serveStatic(req, res, pathname) {
    const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
    let file = join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR) || rel.split(sep).some((p) => p.startsWith('.'))) throw new HttpError(404, 'Introuvable');
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      if (extname(rel)) throw new HttpError(404, 'Introuvable');
      file = join(PUBLIC_DIR, 'index.html'); // routes de l'application monopage
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'");
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/healthz') { res.end('ok'); return; }
      if (pathname.startsWith('/api/')) {
        for (const [method, re, handler] of routes) {
          const m = pathname.match(re);
          if (m && req.method === method) return send(res, 200, await handler(req, res, m));
        }
        throw new HttpError(404, 'Route inconnue');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée');
      await serveStatic(req, res, pathname);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Erreur interne' : err.message });
    }
  });
}
