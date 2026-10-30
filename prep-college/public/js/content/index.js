// Point d'entrée du contenu pédagogique : fusionne les banques par niveau et matière.
import { MATHS_SCIENCES, SPRINT } from './maths-sciences.js';
import { LETTRES_LANGUES } from './lettres-langues.js';
import { LEVELS } from '../curriculum.js';

export const CONTENT = Object.fromEntries(
  LEVELS.map((l) => [l, { ...(MATHS_SCIENCES[l] || {}), ...(LETTRES_LANGUES[l] || {}) }])
);

export { SPRINT };

export const generatorsFor = (level, subject) => CONTENT[level]?.[subject]?.generators || [];
export const flashcardsFor = (level, subject) => CONTENT[level]?.[subject]?.flashcards || [];
