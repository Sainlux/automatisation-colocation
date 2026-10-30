// Outils partagés par tous les générateurs d'exercices.
//
// CONTRAT D'UN EXERCICE (objet renvoyé par un générateur) :
// {
//   type: 'qcm' | 'input',
//   prompt: string,              // énoncé (texte brut, \n autorisé)
//   choices?: string[],          // obligatoire si type === 'qcm' (déjà mélangés)
//   answer: string | string[],   // bonne(s) réponse(s) acceptée(s)
//   hint: string,                // coup de pouce du personnage (sans donner la réponse)
//   explanation: string,         // correction détaillée, étape par étape
//   skill: string                // compétence travaillée (ex. « Fractions »)
// }
// Un générateur est une fonction sans argument qui renvoie un nouvel exercice
// à chaque appel (valeurs aléatoires ou tirage dans une banque).

export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

// Nombre au format français (virgule décimale, max 2 décimales par défaut).
export function fr(n, decimals = 2) {
  return String(Math.round(n * 10 ** decimals) / 10 ** decimals).replace('.', ',');
}

// Construit un QCM : la bonne réponse + des distracteurs (dédoublonnés, mélangés).
export function qcm({ prompt, answer, wrong, hint, explanation, skill }) {
  const distractors = [...new Set(wrong.map(String))].filter((w) => w !== String(answer)).slice(0, 3);
  return {
    type: 'qcm',
    prompt,
    choices: shuffle([String(answer), ...distractors]),
    answer: String(answer),
    hint,
    explanation,
    skill
  };
}

export function input({ prompt, answer, hint, explanation, skill }) {
  return { type: 'input', prompt, answer, hint, explanation, skill };
}

// Fabrique un générateur à partir d'une banque de questions QCM fixes.
// item : { q, a, w: [faux...], hint, exp, skill? }
export function fromBank(bank, skill) {
  return () => {
    const it = pick(bank);
    return qcm({ prompt: it.q, answer: it.a, wrong: it.w, hint: it.hint, explanation: it.exp, skill: it.skill || skill });
  };
}

// Normalisation pour comparer une saisie libre à la réponse attendue.
export function normalize(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d) (?=\d{3}\b)/g, '$1')
    .replace(/[.!?]+$/, '');
}

export function isCorrect(exercise, given) {
  const answers = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
  const g = normalize(given);
  return answers.some((a) => {
    const n = normalize(a);
    if (n === g) return true;
    const x = Number(n), y = Number(g);
    return n !== '' && g !== '' && !Number.isNaN(x) && !Number.isNaN(y) && Math.abs(x - y) < 1e-9;
  });
}
