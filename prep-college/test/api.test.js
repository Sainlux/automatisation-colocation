import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { computeDnb } from '../public/js/curriculum.js';

let server, base;

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  server = createApp(openDb(':memory:'));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data: await res.json().catch(() => null), cookie: setCookie?.split(';')[0] };
}

async function login(name, pin = '0000') {
  const { data: students } = await call('/api/students');
  const s = students.find((x) => x.name === name);
  const r = await call('/api/login', { method: 'POST', body: { studentId: s.id, pin } });
  return { ...r, id: s.id };
}

test('la liste publique contient les 11 élèves sans donnée sensible', async () => {
  const { status, data } = await call('/api/students');
  assert.equal(status, 200);
  assert.equal(data.length, 11);
  assert.deepEqual(Object.keys(data[0]).sort(), ['avatar', 'id', 'level', 'name']);
  assert.equal(data.find((s) => s.name === 'Noémi').level, '4eme');
});

test('connexion : mauvais code refusé, bon code accepté, changement obligatoire', async () => {
  const bad = await login('Zoé', '1111');
  assert.equal(bad.status, 401);
  const ok = await login('Zoé');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.mustChangePin, true);
  const weak = await call('/api/me/pin', { method: 'PUT', cookie: ok.cookie, body: { currentPin: '0000', newPin: '0000' } });
  assert.equal(weak.status, 400);
  const changed = await call('/api/me/pin', { method: 'PUT', cookie: ok.cookie, body: { currentPin: '0000', newPin: '4821' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.mustChangePin, false);
  assert.equal((await login('Zoé', '4821')).status, 200);
});

test('blocage après 5 essais ratés', async () => {
  for (let i = 0; i < 5; i++) await login('Paul', '9999');
  assert.equal((await login('Paul')).status, 429);
});

test('seul Samuel accède à l’administration', async () => {
  const eleve = await login('Terry');
  assert.equal((await call('/api/admin/overview', { cookie: eleve.cookie })).status, 403);
  assert.equal((await call('/api/admin/overview')).status, 401);

  const sam = await login('Samuel');
  assert.equal(sam.data.isAdmin, true);
  const ov = await call('/api/admin/overview', { cookie: sam.cookie });
  assert.equal(ov.status, 200);
  assert.equal(ov.data.length, 11);
});

test('résultats enregistrés, historique et analyse privés', async () => {
  const noha = await login('Noha');
  for (let i = 0; i < 4; i++) {
    const r = await call('/api/attempts', { method: 'POST', cookie: noha.cookie,
      body: { level: '3eme', subject: 'maths', module: 'training', skill: 'Thalès', correct: i % 2, total: 1, hints: 1 } });
    assert.equal(r.status, 200);
  }
  // Un élève peut travailler un autre niveau.
  assert.equal((await call('/api/attempts', { method: 'POST', cookie: noha.cookie,
    body: { level: '6eme', subject: 'eps', module: 'flashcards', correct: 8, total: 10 } })).status, 200);
  assert.equal((await call('/api/attempts', { method: 'POST', cookie: noha.cookie,
    body: { level: '6eme', subject: 'inconnue', module: 'training', correct: 1, total: 1 } })).status, 400);

  const hist = await call('/api/me/history', { cookie: noha.cookie });
  assert.equal(hist.data.length, 5);
  const an = await call('/api/me/analysis', { cookie: noha.cookie });
  assert.equal(an.data.totals.total, 14);
  assert.equal(an.data.weak[0].skill, 'Thalès');
  assert.equal(an.data.coachSource, 'local');

  // Un autre élève ne peut pas lire l’historique de Noha.
  const sarah = await login('Sarah');
  assert.equal((await call(`/api/admin/students/${noha.id}/history`, { cookie: sarah.cookie })).status, 403);
  const sam = await login('Samuel');
  assert.equal((await call(`/api/admin/students/${noha.id}/history`, { cookie: sam.cookie })).data.history.length, 5);
});

test('l’admin gère les comptes', async () => {
  const sam = await login('Samuel');
  const created = await call('/api/admin/students', { method: 'POST', cookie: sam.cookie, body: { name: 'Lina', level: '5eme', avatar: '🐧' } });
  assert.equal(created.status, 200);
  assert.equal((await call('/api/admin/students', { method: 'POST', cookie: sam.cookie, body: { name: 'Lina', level: '5eme' } })).status, 409);
  const upd = await call(`/api/admin/students/${created.data.id}`, { method: 'PUT', cookie: sam.cookie, body: { name: 'Lina', level: '4eme', avatar: '🐧' } });
  assert.equal(upd.data.level, '4eme');
  assert.equal((await call(`/api/admin/students/${sam.id}`, { method: 'DELETE', cookie: sam.cookie })).status, 400);
  assert.equal((await call(`/api/admin/students/${created.data.id}`, { method: 'DELETE', cookie: sam.cookie })).status, 200);
});

test('fichiers statiques servis, traversée de répertoire bloquée', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Prep'Collège/);
  assert.equal((await fetch(base + '/../src/db.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/src/db.js')).status, 404);
});

test('calcul DNB 2026', () => {
  const r = computeDnb(15, { french: 70, maths: 80, hist_geo: 60, sciences: 75, oral: 90 });
  assert.equal(r.continuous, 240);
  assert.equal(r.finals, 375);
  assert.equal(r.total, 615);
  assert.equal(r.honor, 'Mention Bien');
  assert.deepEqual(r.nextGoal, { label: 'Mention Très bien', missing: 25 });
  assert.equal(computeDnb(5, {}).admitted, false);
  assert.equal(computeDnb(20, { french: 100, maths: 100, hist_geo: 100, sciences: 100, oral: 100 }).honor, 'Mention Très bien avec félicitations du jury');
});

test('premier code sans ancien code, puis ancien code exigé et limité', async () => {
  const s = await login('Isaë');
  const first = await call('/api/me/pin', { method: 'PUT', cookie: s.cookie, body: { newPin: '1593' } });
  assert.equal(first.status, 200);
  assert.equal((await call('/api/me/pin', { method: 'PUT', cookie: s.cookie, body: { newPin: '7777' } })).status, 401);
  for (let i = 0; i < 4; i++) await call('/api/me/pin', { method: 'PUT', cookie: s.cookie, body: { currentPin: '0001', newPin: '7777' } });
  assert.equal((await call('/api/me/pin', { method: 'PUT', cookie: s.cookie, body: { currentPin: '1593', newPin: '7777' } })).status, 429);
});

test('un cookie mal encodé ne casse pas l’API', async () => {
  const r = await call('/api/students', { cookie: 'x=%E0%A4%A' });
  assert.equal(r.status, 200);
  assert.equal((await fetch(base + '/%E0')).status, 200); // repli sur l'application, pas d'erreur 500
  assert.equal((await call('/api/me')).data, null);
});

test('prénom en double insensible à la casse', async () => {
  const sam = await login('Samuel');
  const r = await call('/api/admin/students', { method: 'POST', cookie: sam.cookie, body: { name: 'zoé', level: '6eme' } });
  assert.equal(r.status, 409);
});
