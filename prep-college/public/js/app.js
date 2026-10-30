import { LEVELS, TEACHERS, SUBJECTS, MODULES } from './curriculum.js';
import { training, sprint, flashcards, dnbSimulator } from './activities.js';
import { $, $$, esc, render, api, applyTheme, toast, levelLabel, subjectOf, formatDate, MODULE_LABEL, MASCOTS, ApiError } from './ui.js';

let me = null;
let leaveHandlers = [];
const onLeave = (fn) => leaveHandlers.push(fn);
const go = (hash) => { location.hash = hash; };

// ================================================================ Barre du haut
function renderTopbar(active) {
  const bar = $('#topbar');
  if (!me) { bar.hidden = true; return; }
  bar.hidden = false;
  const link = (href, label, key) => `<a href="${href}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  bar.innerHTML = `
    <a class="brand" href="#/">Prep’Collège <span>2026</span></a>
    <nav class="nav" aria-label="Navigation principale">
      ${link('#/', 'Réviser', 'home')}
      ${link('#/progres', 'Mes progrès', 'progress')}
      ${me.isAdmin ? link('#/admin', 'Administration', 'admin') : ''}
    </nav>
    <a class="me-chip" href="#/profil" style="text-decoration:none;color:inherit" aria-label="Mon profil">
      <span class="avatar" aria-hidden="true">${esc(me.avatar)}</span>${esc(me.name)}</a>
    <button class="btn ghost small" id="logout">Quitter</button>`;
  $('#logout').onclick = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    me = null;
    go('#/');
    route();
  };
}

// ================================================================ Connexion
async function loginScreen() {
  renderTopbar();
  applyTheme('6eme');
  const students = await api('/students');
  render(`
    <section class="login-hero">
      <h1>Qui révise aujourd’hui ?</h1>
      <p class="muted">Touche ton prénom, puis tape ton code secret.</p>
    </section>
    ${LEVELS.map((l) => {
      const group = students.filter((s) => s.level === l);
      if (!group.length) return '';
      return `<section class="level-group" style="--lvl:${TEACHERS[l].theme.primary}">
        <h2>En ${levelLabel(l)} avec ${esc(TEACHERS[l].name)}</h2>
        <div class="labels">${group.map((s) => `
          <button class="name-label" data-id="${s.id}"><span class="avatar" aria-hidden="true">${esc(s.avatar)}</span>${esc(s.name)}</button>`).join('')}
        </div></section>`;
    }).join('')}`);
  $$('.name-label').forEach((b) => {
    b.onclick = () => pinScreen(students.find((s) => s.id === Number(b.dataset.id)));
  });
}

function pinPad({ title, subtitle, onSubmit, back }) {
  let pin = '';
  render(`
    <section class="sheet pinpad" style="margin:0 auto">
      <h1 style="font-size:1.6rem">${title}</h1>
      <p class="muted">${subtitle}</p>
      <div class="pin-dots" aria-hidden="true">${'<span></span>'.repeat(4)}</div>
      <label class="sr-only" for="pin-input">Code</label>
      <input type="password" id="pin-input" inputmode="numeric" autocomplete="off" maxlength="4" class="sr-only">
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="del" aria-label="Effacer">⌫</button><button data-k="0">0</button><button data-k="ok" aria-label="Valider">✓</button>
      </div>
      <div id="pin-error" role="alert"></div>
      ${back ? '<p style="margin-top:14px"><a href="#/" id="pin-back">Ce n’est pas moi</a></p>' : ''}
    </section>`);
  const dots = $$('.pin-dots span');
  const input = $('#pin-input');
  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    input.value = pin;
  };
  const submit = async () => {
    if (pin.length < 4) return;
    try {
      await onSubmit(pin);
    } catch (e) {
      $('#pin-error').innerHTML = `<p class="alert error">${esc(e.message)}</p>`;
      pin = '';
      paint();
    }
  };
  const press = (k) => {
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') return submit();
    else if (pin.length < 4) pin += k;
    paint();
    if (pin.length === 4) submit();
  };
  $$('.keys button').forEach((b) => { b.onclick = () => press(b.dataset.k); });
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  $('.pinpad').addEventListener('click', (e) => { if (e.target.tagName !== 'A') input.focus({ preventScroll: true }); });
  if (back) $('#pin-back').onclick = (e) => { e.preventDefault(); loginScreen(); };
}

function pinScreen(student) {
  applyTheme(student.level);
  pinPad({
    title: `${esc(student.avatar)} Bonjour ${esc(student.name)} !`,
    subtitle: 'Tape ton code secret à 4 chiffres.',
    back: true,
    onSubmit: async (pin) => {
      me = await api('/login', { method: 'POST', body: { studentId: student.id, pin } });
      if (me.mustChangePin) return changePinScreen(pin);
      go('#/');
      route();
    }
  });
}

function changePinScreen(currentPin, first = null) {
  pinPad({
    title: first ? 'Confirme ton code' : 'Choisis ton code secret',
    subtitle: first
      ? 'Tape-le une deuxième fois pour être sûr·e.'
      : 'C’est ta première connexion : invente un code à 4 chiffres que toi seul·e connais.',
    onSubmit: async (pin) => {
      if (!first) {
        if (pin === '0000') throw new Error('Choisis un code différent de 0000.');
        return changePinScreen(currentPin, pin);
      }
      if (pin !== first) {
        toast('Les deux codes ne correspondent pas. Recommence.');
        return changePinScreen(currentPin);
      }
      me = await api('/me/pin', { method: 'PUT', body: { currentPin, newPin: pin } });
      toast('Code enregistré !');
      go('#/');
      route();
    }
  });
}

// ================================================================ Accueil d’un niveau
function levelSwitch(current) {
  return `<nav class="level-switch" aria-label="Changer de niveau">${LEVELS.map((l) =>
    `<a href="#/niveau/${l}" style="--lvl:${TEACHERS[l].theme.primary}" aria-current="${l === current}">${levelLabel(l)}${l === me.level ? ' (ma classe)' : ''}</a>`).join('')}</nav>`;
}

function levelHome(level) {
  const t = TEACHERS[level];
  const mascot = MASCOTS[level];
  const other = level !== me.level;
  render(`
    ${levelSwitch(level)}
    <section class="teacher">
      <span class="face" aria-hidden="true">${t.emoji}</span>
      <div>
        <h1>${other ? `Programme de ${levelLabel(level)}` : `Salut ${esc(me.name)} !`}</h1>
        <p><b>${esc(t.name)}</b>, ${esc(t.title.charAt(0).toLowerCase() + t.title.slice(1))}. <span class="muted">${esc(t.cycle)}</span></p>
        ${other ? `<p class="muted small">Tu explores le programme d’un autre niveau : tous les exercices comptent dans tes progrès.</p>` : ''}
      </div>
    </section>
    <h2>Choisis une matière</h2>
    <div class="grid" style="margin-bottom:28px">
      ${SUBJECTS[level].map((s) => `<a class="subject" href="#/niveau/${level}/${s.id}"><span class="icon" aria-hidden="true">${s.icon}</span>${esc(s.name)}</a>`).join('')}
    </div>
    <h2>Défis rapides</h2>
    <div class="modules">
      <a class="module" href="#/sprint/${level}"><span class="icon" aria-hidden="true">⏱️</span><strong>Sprint Chrono</strong><p>${esc(MODULES[1].description)}</p></a>
      <a class="module" href="#/brevet"><span class="icon" aria-hidden="true">🎓</span><strong>Simulateur Brevet 2026</strong><p>${esc(MODULES[3].description)}</p></a>
    </div>
    <p class="muted small" style="margin-top:24px">${mascot.emoji} ${esc(mascot.name)} t’accompagne en ${levelLabel(level)} : appuie sur « Je suis bloqué·e » pendant un exercice pour un coup de pouce.</p>`);
}

function subjectHome(level, subjectId) {
  const s = subjectOf(level, subjectId);
  if (!s) return go(`#/niveau/${level}`);
  render(`
    ${levelSwitch(level)}
    <div class="ex-head"><a class="btn ghost small" href="#/niveau/${level}">Toutes les matières</a></div>
    <h1>${s.icon} ${esc(s.name)} <span class="muted" style="font-size:.6em">${levelLabel(level)}</span></h1>
    <div class="modules" style="margin-top:18px">
      <a class="module" href="#/entrainement/${level}/${s.id}"><span class="icon" aria-hidden="true">♾️</span><strong>Entraînement infini</strong><p>${esc(MODULES[0].description)}</p></a>
      <a class="module" href="#/flashcards/${level}/${s.id}"><span class="icon" aria-hidden="true">🃏</span><strong>Flashcards</strong><p>${esc(MODULES[2].description)}</p></a>
    </div>`);
}

// ================================================================ Progrès & analyse
function analysisHtml(a, history, { forAdmin = false, name = '' } = {}) {
  const who = forAdmin ? name : 'tu';
  return `
    <div class="stats">
      <div class="stat"><b>${a.totals.total}</b>questions</div>
      <div class="stat"><b>${a.totals.total ? a.totals.rate + ' %' : '—'}</b>de réussite</div>
      <div class="stat"><b>${a.totals.activeDays}</b>jour${a.totals.activeDays > 1 ? 's' : ''} d’entraînement</div>
      <div class="stat"><b>${a.totals.hints}</b>coup${a.totals.hints > 1 ? 's' : ''} de pouce</div>
    </div>
    <section class="sheet coach">
      <h2>${a.coachSource === 'claude' ? 'Le bilan du coach IA' : 'Les conseils du coach'}</h2>
      ${a.coach ? `<p class="coach-text">${esc(a.coach)}</p>` : ''}
      ${!a.coach || forAdmin ? `<ul>${a.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </section>
    ${a.subjects.length ? `<section class="sheet"><h2>Par matière</h2>
      ${a.subjects.map((s) => `<div class="subject-line"><span>${esc(s.name)} <span class="pill">${levelLabel(s.level)}</span></span>
        <span class="bar" role="img" aria-label="${s.rate} %"><i style="width:${s.rate}%"></i></span><b>${s.rate} %</b></div>`).join('')}
    </section>` : ''}
    ${a.weak.length || a.strong.length ? `<section class="sheet"><div class="grid">
      <div><h3>À retravailler</h3>${a.weak.length ? `<ul>${a.weak.map((k) => `<li>${esc(k.skill)} <span class="muted small">(${esc(k.subjectName)}, ${k.rate} %)</span></li>`).join('')}</ul>` : '<p class="muted">Rien de préoccupant pour l’instant.</p>'}</div>
      <div><h3>Points forts</h3>${a.strong.length ? `<ul>${a.strong.map((k) => `<li>${esc(k.skill)} <span class="muted small">(${esc(k.subjectName)}, ${k.rate} %)</span></li>`).join('')}</ul>` : '<p class="muted">Ils apparaîtront après quelques séries.</p>'}</div>
    </div></section>` : ''}
    <section class="sheet"><h2>Historique</h2>
      ${history.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Activité</th><th>Matière</th><th>Notion</th><th>Résultat</th></tr></thead>
        <tbody>${history.slice(0, 80).map((h) => `<tr>
          <td>${formatDate(h.createdAt)}</td><td>${MODULE_LABEL[h.module] || h.module}</td>
          <td>${esc(subjectOf(h.level, h.subject)?.name || h.subject)} <span class="pill">${levelLabel(h.level)}</span></td>
          <td>${esc(h.skill || '')}</td><td>${h.correct} / ${h.total}${h.hints ? ` <span title="coups de pouce">💡${h.hints}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted">${forAdmin ? `${esc(who)} n’a pas encore fait d’exercice.` : 'Ton historique apparaîtra ici dès ton premier exercice.'}</p>`}
    </section>`;
}

async function progress() {
  applyTheme(me.level);
  render('<p class="muted">Analyse de tes résultats…</p>');
  const [a, history] = await Promise.all([api('/me/analysis'), api('/me/history')]);
  render(`<h1>Mes progrès</h1>${analysisHtml(a, history)}`);
}

// ================================================================ Profil
async function profile() {
  applyTheme(me.level);
  const avatars = await api('/avatars');
  render(`
    <h1>Mon profil</h1>
    <section class="sheet">
      <h2>Mon personnage</h2>
      <div class="avatars">${avatars.map((a) => `<button data-a="${a}" aria-pressed="${a === me.avatar}" aria-label="Choisir ${a}">${a}</button>`).join('')}</div>
    </section>
    <section class="sheet">
      <h2>Changer mon code secret</h2>
      <form id="pin-form" class="grid" autocomplete="off">
        <div><label for="cur">Code actuel</label><input type="password" id="cur" inputmode="numeric" maxlength="4" required></div>
        <div><label for="new">Nouveau code (4 chiffres)</label><input type="password" id="new" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></div>
        <div style="align-self:end"><button class="btn">Changer le code</button></div>
      </form>
      <div id="pin-msg" role="alert"></div>
    </section>`);
  $$('.avatars button').forEach((b) => {
    b.onclick = async () => {
      me = await api('/me/avatar', { method: 'PUT', body: { avatar: b.dataset.a } });
      $$('.avatars button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      renderTopbar();
      toast('Personnage changé !');
    };
  });
  $('#pin-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      me = await api('/me/pin', { method: 'PUT', body: { currentPin: $('#cur').value, newPin: $('#new').value } });
      e.target.reset();
      $('#pin-msg').innerHTML = '<p class="alert info">Code changé.</p>';
    } catch (err) {
      $('#pin-msg').innerHTML = `<p class="alert error">${esc(err.message)}</p>`;
    }
  };
}

// ================================================================ Administration (Samuel)
const levelOptions = (sel) => LEVELS.map((l) => `<option value="${l}" ${l === sel ? 'selected' : ''}>${levelLabel(l)}</option>`).join('');

async function admin() {
  if (!me.isAdmin) return go('#/');
  applyTheme(me.level);
  const [rows, avatars] = await Promise.all([api('/admin/overview'), api('/avatars')]);
  render(`
    <h1>Administration</h1>
    <p class="muted">Tu es le seul à voir cette page : résultats de tous les élèves, comptes et codes.</p>
    <section class="sheet"><div class="table-wrap"><table>
      <thead><tr><th>Élève</th><th>Classe</th><th>Questions</th><th>Réussite</th><th>Dernière activité</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map((s) => `<tr>
        <td><span aria-hidden="true">${esc(s.avatar)}</span> <b>${esc(s.name)}</b>${s.isAdmin ? ' <span class="pill">admin</span>' : ''}</td>
        <td>${levelLabel(s.level)}</td><td>${s.total}</td><td>${s.rate === null ? '—' : s.rate + ' %'}</td>
        <td>${formatDate(s.lastActivity)}</td>
        <td><a class="btn small" href="#/admin/eleve/${s.id}">Voir</a></td></tr>`).join('')}</tbody>
    </table></div></section>
    <section class="sheet">
      <h2>Ajouter un élève</h2>
      <form id="add-form" class="grid">
        <div><label for="add-name">Prénom</label><input type="text" id="add-name" maxlength="30" required></div>
        <div><label for="add-level">Classe</label><select id="add-level">${levelOptions('6eme')}</select></div>
        <div><label for="add-avatar">Personnage</label><select id="add-avatar">${avatars.map((a) => `<option>${a}</option>`).join('')}</select></div>
        <div style="align-self:end"><button class="btn">Ajouter</button></div>
      </form>
      <p class="muted small">Le code de départ est 0000 ; l’élève devra en choisir un nouveau à sa première connexion.</p>
      <div id="add-msg" role="alert"></div>
    </section>`);
  $('#add-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/students', { method: 'POST', body: { name: $('#add-name').value, level: $('#add-level').value, avatar: $('#add-avatar').value } });
      toast('Élève ajouté');
      admin();
    } catch (err) { $('#add-msg').innerHTML = `<p class="alert error">${esc(err.message)}</p>`; }
  };
}

async function adminStudent(id) {
  if (!me.isAdmin) return go('#/');
  const [{ student: s, history }, a, avatars] = await Promise.all([api(`/admin/students/${id}/history`), api(`/admin/students/${id}/analysis`), api('/avatars')]);
  applyTheme(s.level);
  const self = s.id === me.id;
  render(`
    <div class="ex-head"><a class="btn ghost small" href="#/admin">Tous les élèves</a></div>
    <h1>${esc(s.avatar)} ${esc(s.name)} <span class="muted" style="font-size:.6em">${levelLabel(s.level)}</span></h1>
    <section class="sheet">
      <h2>Modifier le compte</h2>
      <form id="edit-form" class="grid">
        <div><label for="e-name">Prénom</label><input type="text" id="e-name" value="${esc(s.name)}" maxlength="30" required></div>
        <div><label for="e-level">Classe</label><select id="e-level">${levelOptions(s.level)}</select></div>
        <div><label for="e-avatar">Personnage</label><select id="e-avatar">${avatars.map((x) => `<option ${x === s.avatar ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div style="align-self:end"><button class="btn">Enregistrer</button></div>
      </form>
      <div class="row" style="margin-top:14px">
        ${self ? '' : '<button class="btn ghost small" id="reset-pin">Remettre le code à 0000</button>'}
        <button class="btn danger small" id="clear-history">Effacer l’historique</button>
        ${self ? '' : '<button class="btn danger small" id="delete">Supprimer l’élève</button>'}
      </div>
      <div id="edit-msg" role="alert"></div>
    </section>
    ${analysisHtml(a, history, { forAdmin: true, name: s.name })}`);

  const msg = (html) => { $('#edit-msg').innerHTML = html; };
  $('#edit-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/students/${id}`, { method: 'PUT', body: { name: $('#e-name').value, level: $('#e-level').value, avatar: $('#e-avatar').value } });
      if (self) me = await api('/me');
      toast('Compte mis à jour');
      adminStudent(id);
    } catch (err) { msg(`<p class="alert error">${esc(err.message)}</p>`); }
  };
  const confirmThen = (question, fn) => async () => { if (confirm(question)) { try { await fn(); } catch (err) { msg(`<p class="alert error">${esc(err.message)}</p>`); } } };
  if (!self) {
    $('#reset-pin').onclick = confirmThen(`Remettre le code de ${s.name} à 0000 ?`, async () => {
      await api(`/admin/students/${id}/reset-pin`, { method: 'POST' });
      msg('<p class="alert info">Code remis à 0000. Il faudra en choisir un nouveau à la prochaine connexion.</p>');
    });
    $('#delete').onclick = confirmThen(`Supprimer définitivement ${s.name} et tous ses résultats ?`, async () => {
      await api(`/admin/students/${id}`, { method: 'DELETE' });
      toast('Élève supprimé');
      go('#/admin');
    });
  }
  $('#clear-history').onclick = confirmThen(`Effacer tout l’historique de ${s.name} ?`, async () => {
    await api(`/admin/students/${id}/history`, { method: 'DELETE' });
    toast('Historique effacé');
    adminStudent(id);
  });
}

// ================================================================ Routeur
async function route() {
  leaveHandlers.forEach((fn) => fn());
  leaveHandlers = [];
  try {
    if (!me) {
      try { me = await api('/me'); } catch { me = null; }
    }
    if (!me) return loginScreen();
    if (me.mustChangePin) return changePinScreen('0000');

    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const [page, a, b] = parts;
    const lvl = LEVELS.includes(a) ? a : me.level;
    const active = page === 'progres' ? 'progress' : page === 'admin' ? 'admin' : 'home';
    renderTopbar(active);
    if (['niveau', 'entrainement', 'flashcards', 'sprint'].includes(page)) applyTheme(lvl);

    switch (page) {
      case undefined: return go(`#/niveau/${me.level}`);
      case 'niveau': return b ? subjectHome(lvl, b) : levelHome(lvl);
      case 'entrainement': return training({ level: lvl, subject: b });
      case 'flashcards': return flashcards({ level: lvl, subject: b });
      case 'sprint': return sprint({ level: lvl }, onLeave);
      case 'brevet': applyTheme('3eme'); return dnbSimulator();
      case 'progres': return progress();
      case 'profil': return profile();
      case 'admin': return a === 'eleve' ? adminStudent(Number(b)) : admin();
      default: return go('#/');
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { me = null; return loginScreen(); }
    render(`<section class="sheet"><h2>Oups</h2><p class="alert error">${esc(err.message)}</p><a class="btn" href="#/">Revenir à l’accueil</a></section>`);
  } finally {
    window.scrollTo(0, 0);
  }
}

window.addEventListener('hashchange', route);
route();
