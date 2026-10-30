import { SUBJECTS, LEVEL_LABEL } from '../public/js/curriculum.js';

const subjectName = (level, id) => SUBJECTS[level]?.find((s) => s.id === id)?.name || id;
const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);
// Jour calendaire à Paris (les dates SQLite sont en UTC).
const parisDay = (iso) => new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

// Analyse locale des résultats : toujours disponible, sans réseau.
export function analyzeAttempts(attempts) {
  const totals = { correct: 0, total: 0, hints: 0, sessions: attempts.length };
  const bySubject = new Map();
  const bySkill = new Map();
  const days = new Set();

  for (const a of attempts) {
    totals.correct += a.correct;
    totals.total += a.total;
    totals.hints += a.hints;
    days.add(parisDay(a.createdAt));

    const sk = `${a.level}|${a.subject}`;
    const s = bySubject.get(sk) || { level: a.level, subject: a.subject, name: subjectName(a.level, a.subject), correct: 0, total: 0 };
    s.correct += a.correct; s.total += a.total;
    bySubject.set(sk, s);

    if (a.skill && a.module === 'training') {
      const kk = `${sk}|${a.skill}`;
      const k = bySkill.get(kk) || { level: a.level, subject: a.subject, subjectName: s.name, skill: a.skill, correct: 0, total: 0, recent: [] };
      k.correct += a.correct; k.total += a.total;
      k.recent.push(a.correct === a.total ? 1 : 0);
      bySkill.set(kk, k);
    }
  }

  const subjects = [...bySubject.values()].map((s) => ({ ...s, rate: pct(s.correct, s.total) }))
    .sort((a, b) => b.total - a.total);

  // Une compétence n'est jugée qu'à partir de 3 questions ; on regarde aussi les 5 dernières.
  const skills = [...bySkill.values()].filter((k) => k.total >= 3).map((k) => {
    const last = k.recent.slice(-5);
    return { level: k.level, subject: k.subject, subjectName: k.subjectName, skill: k.skill, total: k.total,
      rate: pct(k.correct, k.total), recentRate: pct(last.reduce((x, y) => x + y, 0), last.length) };
  });
  const weak = skills.filter((k) => k.rate < 60).sort((a, b) => a.rate - b.rate).slice(0, 5);
  const strong = skills.filter((k) => k.rate >= 80).sort((a, b) => b.rate - a.rate).slice(0, 5);
  const improving = skills.filter((k) => k.recentRate - k.rate >= 20).slice(0, 3);

  const rate = pct(totals.correct, totals.total);
  const tips = [];
  if (!attempts.length) {
    tips.push('Commence par un Entraînement dans ta matière préférée : 10 questions suffisent pour démarrer ton analyse.');
  } else {
    if (weak[0]) tips.push(`Priorité : « ${weak[0].skill} » en ${weak[0].subjectName} (${weak[0].rate} % de réussite). Fais une série de 10 questions et relis bien chaque correction.`);
    if (improving[0]) tips.push(`Bravo, tu progresses nettement sur « ${improving[0].skill} » : continue sur ta lancée !`);
    if (strong[0]) tips.push(`Point fort : « ${strong[0].skill} » (${strong[0].rate} %). Tente le Sprint Chrono pour gagner en vitesse.`);
    if (totals.total >= 10 && totals.hints / totals.total > 0.5) tips.push('Tu utilises souvent les indices : essaie d’abord seul·e 30 secondes avant de demander de l’aide.');
    if (days.size < 3) tips.push('Le secret de la mémoire, c’est la régularité : 15 minutes par jour valent mieux qu’une longue séance par semaine.');
    if (!attempts.some((a) => a.module === 'flashcards')) tips.push('Pense aux Flashcards pour fixer les définitions et les règles à retenir.');
  }

  return {
    totals: { ...totals, rate, activeDays: days.size },
    lastActivity: attempts.at(-1)?.createdAt || null,
    subjects, weak, strong, improving,
    tips: tips.slice(0, 4)
  };
}

// --- Coach IA (optionnel) : nécessite ANTHROPIC_API_KEY et le paquet @anthropic-ai/sdk ---

const SYSTEM = `Tu es le coach pédagogique bienveillant de Prep'Collège 2026, une appli de révision pour collégiens (11-15 ans).
On te donne les statistiques anonymes d'un élève. Rédige en français, en tutoyant l'élève, un bilan de 4 à 6 phrases maximum :
1) une réussite concrète à féliciter, 2) les 1 ou 2 notions prioritaires à retravailler et comment,
3) un objectif simple pour les prochains jours. Ton encourageant, jamais culpabilisant. Pas de titre, pas de liste, pas de markdown.
N'invente aucun chiffre absent des données.`;

const aiCache = new Map(); // studentId → { key, text }
let clientPromise;

async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  clientPromise ??= import('@anthropic-ai/sdk')
    .then(({ default: Anthropic }) => new Anthropic({ timeout: 20000, maxRetries: 1 }))
    .catch(() => null);
  return clientPromise;
}

export async function aiCoachSummary(student, analysis) {
  if (analysis.totals.total < 5) return null;
  const cacheKey = `${analysis.totals.total}|${analysis.lastActivity}`;
  const cached = aiCache.get(student.id);
  if (cached?.key === cacheKey) return cached.text;

  const client = await getClient();
  if (!client) return null;

  const data = {
    niveau: LEVEL_LABEL[student.level],
    reussite_globale: `${analysis.totals.rate} % sur ${analysis.totals.total} questions`,
    jours_actifs: analysis.totals.activeDays,
    matieres: analysis.subjects.slice(0, 6).map((s) => `${s.name} (${LEVEL_LABEL[s.level]}) : ${s.rate} % sur ${s.total}`),
    a_retravailler: analysis.weak.map((k) => `${k.skill} — ${k.subjectName} : ${k.rate} %`),
    points_forts: analysis.strong.map((k) => `${k.skill} — ${k.subjectName} : ${k.rate} %`),
    en_progres: analysis.improving.map((k) => k.skill)
  };

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(data) }]
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) return null;
    aiCache.set(student.id, { key: cacheKey, text });
    return text;
  } catch (err) {
    console.warn('[coach IA] indisponible :', err?.status || '', err?.message || err);
    return null;
  }
}
