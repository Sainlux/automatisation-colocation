import { TEACHERS, LEVEL_LABEL, SUBJECTS } from './curriculum.js';

// Petits personnages qui donnent un coup de pouce quand on est bloqué.
export const MASCOTS = {
  '6eme': { name: 'Plume', emoji: '🦉' },
  '5eme': { name: 'Globo', emoji: '🐢' },
  '4eme': { name: 'Pi', emoji: '🤖' },
  '3eme': { name: 'Flash', emoji: '🦅' }
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function render(html) {
  const app = $('#app');
  app.innerHTML = html;
  return app;
}

export function announce(text) {
  const live = $('#live');
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

export function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Erreur réseau');
  return data;
}

// Applique les couleurs du professeur référent du niveau consulté.
export function applyTheme(level) {
  const t = TEACHERS[level]?.theme;
  if (!t) return;
  const root = document.documentElement.style;
  root.setProperty('--primary', t.primary);
  root.setProperty('--paper', t.background);
  root.setProperty('--line', t.border);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.primary);
}

export const subjectOf = (level, id) => SUBJECTS[level]?.find((s) => s.id === id);
export const levelLabel = (l) => LEVEL_LABEL[l] || l;

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export const MODULE_LABEL = { training: 'Entraînement', chrono_sprint: 'Sprint Chrono', flashcards: 'Flashcards', dnb_simulator: 'Simulateur DNB' };
