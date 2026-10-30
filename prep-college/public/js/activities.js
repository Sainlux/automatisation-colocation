import { TEACHERS, DNB, computeDnb, SUBJECTS } from './curriculum.js';
import { generatorsFor, flashcardsFor, SPRINT } from './content/index.js';
import { isCorrect, pick, shuffle } from './content/util.js';
import { $, $$, esc, render, api, announce, toast, MASCOTS, subjectOf, levelLabel } from './ui.js';

const saveAttempt = (attempt) => api('/attempts', { method: 'POST', body: attempt }).catch(() => toast('Résultat non enregistré (connexion ?)'));

const backLink = (level, subject) =>
  `<a class="btn ghost small" href="#/niveau/${level}${subject ? `/${subject}` : ''}">Retour</a>`;

const emptyState = (level) => render(`
  <section class="sheet"><h2>Pas encore d’exercices ici</h2>
  <p>Cette matière arrive bientôt. Choisis-en une autre en attendant.</p>${backLink(level)}</section>`);

// ---------------------------------------------------------------- Entraînement infini
export function training({ level, subject }) {
  const gens = generatorsFor(level, subject);
  if (!gens.length) return emptyState(level);
  const teacher = TEACHERS[level];
  const mascot = MASCOTS[level];
  const subj = subjectOf(level, subject);
  const stats = { done: 0, good: 0, streak: 0 };
  let lastGen = null;
  const scoreText = () => `${stats.good} / ${stats.done} réussie${stats.good > 1 ? 's' : ''}${stats.streak >= 3 ? ` · série de ${stats.streak} 🔥` : ''}`;

  function next() {
    // Évite de retomber deux fois de suite sur le même type de question.
    const pool = gens.length > 1 ? gens.filter((g) => g !== lastGen) : gens;
    lastGen = pick(pool);
    const ex = lastGen();
    const started = Date.now();
    let hints = 0;
    let answered = false;

    render(`
      <div class="ex-head">
        ${backLink(level, subject)}
        <span class="score" id="score">${scoreText()}</span>
      </div>
      <section class="sheet" aria-labelledby="q">
        <span class="skill-tag">${esc(subj?.icon)} ${esc(subj?.name)} · ${esc(ex.skill)}</span>
        <p class="question" id="q">${esc(ex.prompt)}</p>
        ${ex.type === 'qcm'
          ? `<div class="choices">${ex.choices.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join('')}</div>`
          : `<form class="answer-row" id="answer-form" autocomplete="off">
               <label class="sr-only" for="answer">Ta réponse</label>
               <input type="text" id="answer" inputmode="${/^[\d\s,./-]+$/.test(String([].concat(ex.answer)[0])) ? 'decimal' : 'text'}" placeholder="Ta réponse" required>
               <button class="btn">Valider</button>
             </form>`}
        <div class="row" style="margin-top:14px">
          <button class="btn ghost small" id="hint-btn">${mascot.emoji} Je suis bloqué·e</button>
        </div>
        <div id="hint-zone"></div>
        <div id="feedback" tabindex="-1"></div>
      </section>`);

    $('#hint-btn').onclick = () => {
      hints += 1;
      $('#hint-zone').innerHTML = `
        <div class="mascot"><span class="buddy" aria-hidden="true">${mascot.emoji}</span>
          <p class="bubble"><b>${esc(mascot.name)} :</b> ${esc(ex.hint)}</p></div>`;
      $('#hint-btn').disabled = true;
      announce(`${mascot.name} : ${ex.hint}`);
    };

    function answer(given, button) {
      if (answered) return;
      answered = true;
      const ok = isCorrect(ex, given);
      stats.done += 1;
      if (ok) { stats.good += 1; stats.streak += 1; } else stats.streak = 0;
      $('#score').textContent = scoreText();
      saveAttempt({ level, subject, module: 'training', skill: ex.skill, correct: ok ? 1 : 0, total: 1, hints, durationS: Math.round((Date.now() - started) / 1000) });

      if (ex.type === 'qcm') {
        $$('.choice').forEach((b) => {
          b.disabled = true;
          if (b.textContent === ex.answer) b.classList.add('good');
        });
        if (!ok) button?.classList.add('bad');
      } else {
        $('#answer').disabled = true;
        $('#answer-form button').disabled = true;
      }
      $('#hint-btn').disabled = true;
      const expected = [].concat(ex.answer)[0];
      const fb = $('#feedback');
      fb.className = `feedback ${ok ? 'good' : 'bad'}`;
      fb.innerHTML = `
        <h3 class="${ok ? 'verdict-good' : 'verdict-bad'}">${ok ? 'Bravo, c’est juste !' : `Pas tout à fait. La bonne réponse : ${esc(expected)}`}</h3>
        <div class="teacher-says"><span class="face" aria-hidden="true">${teacher.emoji}</span>
          <div><b>${esc(teacher.name)} t’explique :</b><p class="explanation">${esc(ex.explanation)}</p></div></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="next-btn">Question suivante</button></div>`;
      $('#next-btn').onclick = next;
      $('#next-btn').focus();
      announce(ok ? 'Bonne réponse' : `Réponse incorrecte. La bonne réponse est ${expected}`);
    }

    if (ex.type === 'qcm') {
      $$('.choice').forEach((b) => { b.onclick = () => answer(ex.choices[b.dataset.i], b); });
      $('.choice').focus();
    } else {
      $('#answer-form').onsubmit = (e) => { e.preventDefault(); answer($('#answer').value); };
      $('#answer').focus();
    }
  }
  next();
}

// ---------------------------------------------------------------- Sprint Chrono 60 s
export function sprint({ level }, onLeave) {
  const gens = SPRINT[level] || [];
  if (!gens.length) return emptyState(level);
  const sprintSubject = SUBJECTS[level].some((s) => s.id === 'maths') ? 'maths' : SUBJECTS[level][0].id;

  render(`
    <div class="ex-head">${backLink(level)}<span></span></div>
    <section class="sheet">
      <h1>Sprint Chrono ${esc(levelLabel(level))}</h1>
      <p>60 secondes pour répondre au plus de questions possible. Tape ta réponse puis appuie sur Entrée. Une erreur ne bloque pas : on passe à la suivante.</p>
      <button class="btn" id="go">Lancer le chrono</button>
    </section>`);
  $('#go').focus();
  $('#go').onclick = start;

  function start() {
    const log = [];
    let current = pick(gens)();
    let left = 60;
    render(`
      <section class="sheet" id="sprint-box" style="text-align:center">
        <div class="timer" id="timer" role="timer" aria-live="off">60</div>
        <p class="score" id="sprint-score">0 point</p>
        <p class="sprint-q" id="sprint-q">${esc(current.prompt)}</p>
        <form id="sprint-form" class="answer-row" autocomplete="off" style="max-width:420px;margin:0 auto">
          <label class="sr-only" for="sprint-answer">Ta réponse</label>
          <input type="text" id="sprint-answer" inputmode="decimal" required>
          <button class="btn">OK</button>
        </form>
      </section>`);
    const input = $('#sprint-answer');
    input.focus();

    const timer = setInterval(() => {
      left -= 1;
      $('#timer').textContent = left;
      $('#timer').classList.toggle('hurry', left <= 10);
      if (left <= 0) finish();
    }, 1000);
    onLeave(() => clearInterval(timer));

    $('#sprint-form').onsubmit = (e) => {
      e.preventDefault();
      const ok = isCorrect(current, input.value);
      log.push({ ex: current, given: input.value, ok });
      const box = $('#sprint-box');
      box.classList.remove('flash', 'flash-bad');
      void box.offsetWidth;
      box.classList.add(ok ? 'flash' : 'flash-bad');
      const pts = log.filter((l) => l.ok).length;
      $('#sprint-score').textContent = `${pts} point${pts > 1 ? 's' : ''}`;
      current = pick(gens)();
      $('#sprint-q').textContent = current.prompt;
      input.value = '';
      input.focus();
    };

    function finish() {
      clearInterval(timer);
      const good = log.filter((l) => l.ok).length;
      const key = `pc-sprint-best-${level}`;
      let best = 0;
      try { best = Number(localStorage.getItem(key)) || 0; if (good > best) localStorage.setItem(key, good); } catch { /* stockage indisponible */ }
      if (log.length) saveAttempt({ level, subject: sprintSubject, module: 'chrono_sprint', skill: 'Automatismes', correct: good, total: log.length, hints: 0, durationS: 60 });
      const errors = log.filter((l) => !l.ok);
      render(`
        <section class="sheet">
          <h1>${good} bonne${good > 1 ? 's' : ''} réponse${good > 1 ? 's' : ''} en 60 s</h1>
          <p>${good > best ? 'Nouveau record personnel, bravo !' : `Ton record : ${best}.`} ${log.length ? `Précision : ${Math.round((good / log.length) * 100)} %.` : ''}</p>
          ${errors.length ? `<h2>À revoir</h2><div class="table-wrap"><table>
            <thead><tr><th>Question</th><th>Ta réponse</th><th>Bonne réponse</th></tr></thead>
            <tbody>${errors.map((l) => `<tr><td>${esc(l.ex.prompt)}</td><td>${esc(l.given)}</td><td><b>${esc([].concat(l.ex.answer)[0])}</b></td></tr>`).join('')}</tbody>
          </table></div>` : ''}
          <div class="row" style="margin-top:16px"><button class="btn" id="again">Rejouer</button>${backLink(level)}</div>
        </section>`);
      $('#again').onclick = start;
      $('#again').focus();
    }
  }
}

// ---------------------------------------------------------------- Flashcards
export function flashcards({ level, subject }) {
  const deck = flashcardsFor(level, subject);
  if (!deck.length) return emptyState(level);
  let queue = shuffle(deck);
  let known = 0;
  const missed = new Set();
  const subj = subjectOf(level, subject);

  function show() {
    if (!queue.length) {
      saveAttempt({ level, subject, module: 'flashcards', skill: 'Fiches mémoire', correct: known, total: deck.length, hints: 0, durationS: 0 });
      render(`
        <section class="sheet">
          <h1>Paquet terminé !</h1>
          <p>Tu connaissais <b>${known}</b> carte${known > 1 ? 's' : ''} sur ${deck.length} du premier coup.</p>
          <div class="row"><button class="btn" id="restart">Recommencer</button>${backLink(level, subject)}</div>
        </section>`);
      $('#restart').onclick = () => flashcards({ level, subject });
      return;
    }
    const card = queue[0];
    render(`
      <div class="ex-head">${backLink(level, subject)}<span class="score">${deck.length - queue.length} / ${deck.length}</span></div>
      <section>
        <span class="skill-tag">${esc(subj?.icon)} ${esc(subj?.name)} · ${esc(card.skill || '')}</span>
        <div class="card-scene">
          <button class="card" id="card" aria-label="Retourner la carte">
            <span class="card-face front">${esc(card.front)}<span class="hint-flip">Touche la carte pour voir la réponse</span></span>
            <span class="card-face back">${esc(card.back)}</span>
          </button>
        </div>
        <div class="row" id="grade" hidden>
          <button class="btn" id="knew">Je savais</button>
          <button class="btn ghost" id="again">À revoir</button>
        </div>
      </section>`);
    const el = $('#card');
    el.focus();
    el.onclick = () => {
      el.classList.toggle('flipped');
      $('#grade').hidden = false;
      announce(card.back);
    };
    $('#knew').onclick = () => {
      if (!missed.has(card)) known += 1;
      queue.shift();
      show();
    };
    $('#again').onclick = () => {
      missed.add(card);
      queue.shift();
      queue.splice(Math.min(queue.length, 3), 0, card); // revient un peu plus tard
      show();
    };
  }
  show();
}

// ---------------------------------------------------------------- Simulateur DNB 2026
export function dnbSimulator() {
  const state = { avg: 12, exams: Object.fromEntries(DNB.exams.map((e) => [e.id, 60])) };
  try { Object.assign(state, JSON.parse(localStorage.getItem('pc-dnb') || '{}')); } catch { /* ignoré */ }

  const ranges = (id, label, max, step, value) => `
    <div><label for="${id}">${esc(label)} <span class="muted small">/ ${max}</span></label>
      <div class="range-row">
        <input type="range" id="${id}-r" min="0" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}">
        <input type="number" id="${id}" min="0" max="${max}" step="${step}" value="${value}">
      </div></div>`;

  render(`
    <div class="ex-head">${backLink('3eme')}<span></span></div>
    <section class="sheet">
      <h1>Simulateur Brevet 2026</h1>
      <p class="muted">Contrôle continu : 40 % (320 points). Épreuves finales : 60 % (480 points). Total sur 800.</p>
      <h2>Contrôle continu</h2>
      ${ranges('avg', 'Moyenne annuelle de 3ᵉ', 20, 0.1, state.avg)}
      <h2 style="margin-top:20px">Épreuves finales</h2>
      <div class="dnb-grid">${DNB.exams.map((e) => ranges(e.id, e.name, e.max, 1, state.exams[e.id])).join('')}</div>
    </section>
    <section class="sheet" aria-live="polite" id="dnb-result"></section>`);

  const clamp = (v, max) => Math.min(max, Math.max(0, Number(String(v).replace(',', '.')) || 0));
  const bind = (id, max, setter) => {
    const num = $(`#${id}`), range = $(`#${id}-r`);
    range.oninput = () => { num.value = range.value; setter(clamp(range.value, max)); update(); };
    num.oninput = () => { range.value = clamp(num.value, max); setter(clamp(num.value, max)); update(); };
  };
  bind('avg', 20, (v) => { state.avg = v; });
  DNB.exams.forEach((e) => bind(e.id, e.max, (v) => { state.exams[e.id] = v; }));

  function update() {
    try { localStorage.setItem('pc-dnb', JSON.stringify(state)); } catch { /* ignoré */ }
    const r = computeDnb(state.avg, state.exams);
    const fr = (n) => String(n).replace('.', ',');
    $('#dnb-result').innerHTML = `
      <p class="dnb-total">${fr(r.total)} <span class="muted" style="font-size:1.2rem">/ 800</span></p>
      <h2 style="margin-top:8px">${esc(r.honor)}</h2>
      <div class="gauge" aria-hidden="true">
        <div class="fill" style="width:${(r.total / 800) * 100}%"></div>
        ${[400, 480, 560, 640, 720].map((t) => `<span class="tick" style="left:${(t / 800) * 100}%"><span>${t}</span></span>`).join('')}
      </div>
      <p>Contrôle continu : <b>${fr(r.continuous)}</b> / 320 · Épreuves finales : <b>${fr(r.finals)}</b> / 480</p>
      <p>${r.nextGoal ? `Il te manque <b>${fr(r.nextGoal.missing)} points</b> pour : ${esc(r.nextGoal.label)}.` : 'Tu as atteint le maximum : félicitations du jury !'}</p>
      <p class="muted small">${esc(TEACHERS['3eme'].name)} : chaque point d’oral compte autant qu’un point d’écrit. Prépare ton oral tôt !</p>`;
  }
  update();
}
