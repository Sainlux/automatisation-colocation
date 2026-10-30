// Référentiel Prep'Collège 2026 : niveaux, professeurs référents, matières, règles DNB.
// Partagé entre le navigateur et le serveur (module ES sans dépendance).

export const LEVELS = ['6eme', '5eme', '4eme', '3eme'];

export const LEVEL_LABEL = { '6eme': '6ᵉ', '5eme': '5ᵉ', '4eme': '4ᵉ', '3eme': '3ᵉ' };

export const TEACHERS = {
  '6eme': {
    name: 'Mme Martin',
    title: 'Experte en transition primaire-collège et consolidation des fondamentaux',
    cycle: 'Cycle 3 (Consolidation)',
    emoji: '👩‍🏫',
    theme: { primary: '#2e7d32', background: '#f1f8e9', border: '#c8e6c9' }
  },
  '5eme': {
    name: 'M. Dubois',
    title: "Accompagnement vers l'autonomie et intégration des langues vivantes 2",
    cycle: 'Cycle 4 (Approfondissement)',
    emoji: '🧑‍🏫',
    theme: { primary: '#1565c0', background: '#e3f2fd', border: '#bbdefb' }
  },
  '4eme': {
    name: 'Mme Laurent',
    title: "Spécialiste de l'abstraction mathématique et de l'analyse critique",
    cycle: 'Cycle 4 (Approfondissement)',
    emoji: '👩‍🔬',
    theme: { primary: '#7b1fa2', background: '#f3e5f5', border: '#e1bee7' }
  },
  '3eme': {
    name: 'M. Alex',
    title: 'Coach expert en préparation mentale et stratégique pour le Brevet 2026',
    cycle: 'Cycle 4 (Préparation DNB)',
    emoji: '🏆',
    theme: { primary: '#b78103', background: '#fffde7', border: '#fff9c4' }
  }
};

// Identifiants de matières utilisés par le contenu (public/js/content/*).
export const SUBJECTS = {
  '6eme': [
    { id: 'francais', name: 'Français', icon: '📖' },
    { id: 'maths', name: 'Mathématiques', icon: '📐' },
    { id: 'histgeo', name: 'Histoire-Géographie & EMC', icon: '🌍' },
    { id: 'sciences', name: 'Sciences & Technologie', icon: '🔬' },
    { id: 'lv1', name: 'Anglais (LV1)', icon: '🇬🇧' },
    { id: 'arts', name: 'Arts Plastiques & Éducation Musicale', icon: '🎨' },
    { id: 'eps', name: 'Éducation Physique et Sportive', icon: '⚽' }
  ],
  '5eme': [
    { id: 'francais', name: 'Français', icon: '📖' },
    { id: 'maths', name: 'Mathématiques', icon: '📐' },
    { id: 'histgeo', name: 'Histoire-Géographie & EMC', icon: '🌍' },
    { id: 'lv1', name: 'Anglais (LV1)', icon: '🇬🇧' },
    { id: 'lv2', name: 'Espagnol / Allemand / Italien (LV2)', icon: '🇪🇸' },
    { id: 'svt', name: 'SVT', icon: '🌱' },
    { id: 'physique', name: 'Physique-Chimie', icon: '⚗️' },
    { id: 'techno', name: 'Technologie & Modélisation 3D', icon: '🛠️' },
    { id: 'arts', name: 'Arts Plastiques & Éducation Musicale', icon: '🎨' }
  ],
  '4eme': [
    { id: 'francais', name: 'Français', icon: '📖' },
    { id: 'maths', name: 'Mathématiques', icon: '📐' },
    { id: 'histgeo', name: 'Histoire-Géographie & EMC', icon: '🌍' },
    { id: 'lv1', name: 'Anglais (LV1)', icon: '🇬🇧' },
    { id: 'lv2', name: 'Espagnol / Allemand / Italien (LV2)', icon: '🇪🇸' },
    { id: 'svt', name: 'SVT', icon: '🌱' },
    { id: 'physique', name: 'Physique-Chimie', icon: '⚗️' },
    { id: 'techno', name: 'Technologie & Modélisation 3D', icon: '🛠️' },
    { id: 'arts', name: 'Arts Plastiques & Éducation Musicale', icon: '🎨' }
  ],
  '3eme': [
    { id: 'francais', name: 'Français (épreuve écrite DNB)', icon: '📖' },
    { id: 'maths', name: 'Mathématiques & Automatismes', icon: '📐' },
    { id: 'histgeo', name: 'Histoire-Géographie & EMC', icon: '🌍' },
    { id: 'langues', name: 'LV1 & LV2 (A2 → B1)', icon: '🗣️' },
    { id: 'sciences', name: 'SVT, Physique-Chimie & Technologie', icon: '🔬' },
    { id: 'pix', name: 'Certification Pix & Numérique', icon: '💻' },
    { id: 'oral', name: 'Épreuve orale du Brevet', icon: '🎤' }
  ]
};

export const MODULES = [
  { id: 'training', name: 'Entraînement infini', icon: '♾️', description: 'Exercices générés à l’infini, correction détaillée par ton professeur référent.' },
  { id: 'chrono_sprint', name: 'Sprint Chrono', icon: '⏱️', description: '60 secondes pour enchaîner un maximum d’automatismes.' },
  { id: 'flashcards', name: 'Flashcards', icon: '🃏', description: 'Retourne les cartes pour mémoriser règles, définitions et théorèmes.' },
  { id: 'dnb_simulator', name: 'Simulateur Brevet 2026', icon: '🎓', description: 'Calcule ton score final au DNB et ta mention.' }
];

export const DNB = {
  total: 800,
  continuous: { weight: 40, max: 320 },
  exams: [
    { id: 'french', name: 'Français', max: 100 },
    { id: 'maths', name: 'Mathématiques (avec automatismes)', max: 100 },
    { id: 'hist_geo', name: 'Histoire-Géographie & EMC', max: 100 },
    { id: 'sciences', name: 'Sciences (2 disciplines sur 3)', max: 100 },
    { id: 'oral', name: 'Épreuve orale du Brevet', max: 100 }
  ],
  thresholds: [
    { min: 720, label: 'Mention Très bien avec félicitations du jury' },
    { min: 640, label: 'Mention Très bien' },
    { min: 560, label: 'Mention Bien' },
    { min: 480, label: 'Mention Assez bien' },
    { min: 400, label: 'Admis·e' }
  ]
};

// Calcul du score DNB : moyenne annuelle /20 → contrôle continu /320, + épreuves finales /480.
export function computeDnb(average20, exams) {
  const avg = Math.min(20, Math.max(0, Number(average20) || 0));
  const continuous = Math.round((avg / 20) * DNB.continuous.max * 10) / 10;
  const finals = DNB.exams.reduce((sum, e) => sum + Math.min(e.max, Math.max(0, Number(exams?.[e.id]) || 0)), 0);
  const total = Math.round((continuous + finals) * 10) / 10;
  const honor = DNB.thresholds.find((t) => total >= t.min);
  const next = [...DNB.thresholds].reverse().find((t) => total < t.min);
  return {
    continuous,
    finals,
    total,
    admitted: total >= 400,
    honor: honor ? honor.label : 'Non admis·e (moins de 400 points)',
    nextGoal: next ? { label: next.label, missing: Math.round((next.min - total) * 10) / 10 } : null
  };
}
