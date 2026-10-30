import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, SPRINT } from '../public/js/content/index.js';
import { isCorrect } from '../public/js/content/util.js';
import { LEVELS, SUBJECTS } from '../public/js/curriculum.js';

const BAD = /undefined|NaN|Infinity|\[object Object\]/;

function check(ex, where) {
  assert.ok(['qcm', 'input'].includes(ex.type), `${where} : type`);
  for (const k of ['prompt', 'hint', 'explanation', 'skill']) {
    assert.equal(typeof ex[k], 'string', `${where} : ${k}`);
    assert.ok(ex[k].trim(), `${where} : ${k} vide`);
  }
  const answers = [].concat(ex.answer).map(String);
  assert.ok(answers.length && answers[0].trim(), `${where} : réponse vide`);
  for (const s of [ex.prompt, ex.explanation, ...answers]) assert.doesNotMatch(s, BAD, `${where} : ${s}`);
  if (ex.type === 'qcm') {
    assert.ok(ex.choices.length >= 2, `${where} : choix`);
    assert.equal(new Set(ex.choices).size, ex.choices.length, `${where} : choix en double ${ex.choices}`);
    assert.ok(ex.choices.includes(ex.answer), `${where} : réponse absente des choix`);
  }
  assert.ok(isCorrect(ex, answers[0]), `${where} : la réponse attendue n'est pas reconnue (${answers[0]})`);
}

test('chaque matière de chaque niveau a des exercices et des flashcards', () => {
  for (const level of LEVELS) {
    for (const { id } of SUBJECTS[level]) {
      const c = CONTENT[level][id];
      assert.ok(c, `${level}/${id} manquant`);
      assert.ok(c.generators.length >= 4, `${level}/${id} : trop peu de générateurs`);
      assert.ok(c.flashcards.length >= 8, `${level}/${id} : trop peu de flashcards`);
      for (const f of c.flashcards) assert.ok(f.front && f.back, `${level}/${id} : flashcard incomplète`);
    }
    assert.ok(SPRINT[level].length >= 4, `sprint ${level}`);
  }
});

test('tous les générateurs produisent des exercices valides (100 tirages)', () => {
  for (const level of LEVELS) {
    for (const [subject, { generators }] of Object.entries(CONTENT[level])) {
      generators.forEach((gen, i) => {
        for (let n = 0; n < 100; n++) check(gen(), `${level}/${subject}#${i}`);
      });
    }
    SPRINT[level].forEach((gen, i) => {
      for (let n = 0; n < 100; n++) {
        const ex = gen();
        assert.equal(ex.type, 'input', `sprint ${level}#${i}`);
        check(ex, `sprint ${level}#${i}`);
      }
    });
  }
});
