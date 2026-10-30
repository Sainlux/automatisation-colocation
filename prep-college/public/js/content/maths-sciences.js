// Prep'Collège 2026 — Contenu Mathématiques & Sciences (6ᵉ → 3ᵉ).
// Programmes cycles 3 et 4 (réforme 2026), DNB 2026 avec automatismes.
// Chaque générateur respecte le contrat décrit dans ./util.js.
// Module ES sans autre dépendance : fonctionne dans le navigateur et dans Node.

import { rand, pick, shuffle, gcd, fr, qcm, input, fromBank } from './util.js';

// =====================================================================
// Outils locaux
// =====================================================================

const par = (n) => (n < 0 ? `(${n})` : `${n}`); // relatif entre parenthèses si négatif
const dec2 = (cents) => (cents / 100).toFixed(2).replace('.', ','); // 1234 -> « 12,34 »
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
const pow10 = (p) => `10${sup(p)}`;
const big = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // 1234567 -> « 1 234 567 »

// Fraction simplifiée « n/d » (entier si d = 1).
function simp(n, d) {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  let a = n / g;
  let b = d / g;
  if (b < 0) { a = -a; b = -b; }
  return b === 1 ? `${a}` : `${a}/${b}`;
}

// Écritures acceptées d'une fraction : simplifiée, brute et décimale si elle est exacte et courte.
function fracForms(n, d) {
  const forms = [simp(n, d), `${n}/${d}`];
  const v = n / d;
  if (Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9) forms.push(fr(v, 3));
  return [...new Set(forms)];
}

// Polynôme ax² + bx + c écrit proprement (sans « 1x », sans « + -3 »).
function poly(a, b, c) {
  const terms = [];
  const add = (coef, lit) => {
    if (coef === 0) return;
    const abs = Math.abs(coef);
    terms.push({ neg: coef < 0, body: lit ? (abs === 1 ? lit : `${abs}${lit}`) : `${abs}` });
  };
  add(a, 'x²');
  add(b, 'x');
  add(c, '');
  if (!terms.length) return '0';
  return terms.map((t, i) => (i === 0 ? (t.neg ? '-' : '') + t.body : (t.neg ? ' - ' : ' + ') + t.body)).join('');
}
const lin = (a, b) => poly(0, a, b);

// QCM robuste : garantit 3 distracteurs distincts (complète par des valeurs voisines si numérique).
function q4({ prompt, answer, wrong, hint, explanation, skill }) {
  const a = String(answer);
  const ws = [...new Set(wrong.map(String))].filter((w) => w !== a);
  const x = Number(a.replace(',', '.'));
  for (let k = 1; ws.length < 3 && !Number.isNaN(x) && k < 50; k++) {
    for (const c of [fr(x + k), fr(x - k)]) if (c !== a && !ws.includes(c) && ws.length < 3) ws.push(c);
  }
  return qcm({ prompt, answer: a, wrong: ws, hint, explanation, skill });
}

// Saisie courte (réponse(s) converties en chaînes).
const inp = (prompt, answer, hint, explanation, skill) =>
  input({ prompt, answer: (Array.isArray(answer) ? answer : [answer]).map(String), hint, explanation, skill });

// Item de banque QCM.
const B = (q, a, w, hint, exp) => ({ q, a, w, hint, exp });

// Tire k entiers distincts dans [min, max].
function distinct(k, min, max) {
  const s = new Set();
  while (s.size < k) s.add(rand(min, max));
  return [...s];
}

// =====================================================================
// 6ᵉ — MATHÉMATIQUES
// =====================================================================

const maths6 = [
  // Addition / soustraction de décimaux
  () => {
    const a = rand(105, 9999);
    const b = rand(105, 9999);
    const op = pick(['+', '-']);
    const [x, y] = op === '-' && b > a ? [b, a] : [a, b];
    const r = op === '+' ? x + y : x - y;
    return inp(
      `Calcule : ${fr(x / 100)} ${op} ${fr(y / 100)}`,
      fr(r / 100),
      'Pose l’opération en colonnes en alignant les virgules : unités sous unités, dixièmes sous dixièmes. Tu peux compléter avec des zéros.',
      `On écrit les deux nombres avec le même nombre de décimales : ${dec2(x)} ${op} ${dec2(y)}.\nOn calcule colonne par colonne en commençant par les centièmes : ${dec2(x)} ${op} ${dec2(y)} = ${dec2(r)}.\nRéponse : ${fr(r / 100)}.`,
      'Nombres décimaux'
    );
  },
  // Multiplier / diviser par 10, 100, 1000
  () => {
    const c = rand(101, 99999);
    const v = c / 100;
    const p = pick([10, 100, 1000]);
    const n = String(p).length - 1;
    const mult = Math.random() < 0.5;
    const r = mult ? (c * p) / 100 : c / (100 * p);
    return inp(
      `Calcule : ${fr(v)} ${mult ? '×' : '÷'} ${p}`,
      fr(r, 6),
      `${mult ? 'Multiplier' : 'Diviser'} par ${p}, c’est déplacer la virgule. Dans quel sens, et de combien de rangs ?`,
      `${mult ? 'Multiplier' : 'Diviser'} par ${p}, c’est décaler la virgule de ${n} rang${n > 1 ? 's' : ''} vers la ${mult ? 'droite (le nombre devient plus grand)' : 'gauche (le nombre devient plus petit)'}, en ajoutant des zéros si nécessaire.\n${fr(v)} ${mult ? '×' : '÷'} ${p} = ${fr(r, 6)}.`,
      'Nombres décimaux'
    );
  },
  // Comparer des décimaux
  () => {
    const e = rand(0, 20);
    const vals = new Set();
    while (vals.size < 4) {
      const t = pick([rand(1, 9) * 100, rand(1, 99) * 10, rand(1, 999)]);
      vals.add(e * 1000 + t);
    }
    const arr = [...vals];
    const max = Math.max(...arr);
    const show = (t) => fr(t / 1000, 3);
    return q4({
      prompt: `Quel est le plus grand de ces nombres ?\n${shuffle(arr).map(show).join(' ; ')}`,
      answer: show(max),
      wrong: arr.filter((t) => t !== max).map(show),
      hint: 'Les parties entières sont égales : compare d’abord les dixièmes, puis les centièmes… Écrire tous les nombres avec 3 décimales aide beaucoup.',
      explanation: `On écrit tous les nombres avec 3 décimales : ${arr.map((t) => (t / 1000).toFixed(3).replace('.', ',')).join(' ; ')}.\nOn compare chiffre par chiffre de gauche à droite (dixièmes, puis centièmes, puis millièmes).\nLe plus grand est ${show(max)}. Attention : un nombre « plus long » n’est pas forcément plus grand !`,
      skill: 'Comparer des décimaux'
    });
  },
  // Fraction d'une quantité
  () => {
    const b = pick([2, 3, 4, 5, 6, 8, 10]);
    const a = rand(1, b - 1);
    const N = b * rand(2, 15);
    const r = (N / b) * a;
    return inp(
      `Calcule ${a}/${b} de ${N}.`,
      r,
      `Prendre ${a}/${b} d’une quantité, c’est la partager en ${b} parts égales, puis prendre ${a} de ces parts.`,
      `On partage ${N} en ${b} parts égales : ${N} ÷ ${b} = ${N / b}.\nOn prend ${a} part${a > 1 ? 's' : ''} : ${N / b} × ${a} = ${r}.\nRéponse : ${a}/${b} de ${N} = ${r}.`,
      'Fractions'
    );
  },
  // Périmètre et aire du rectangle
  () => {
    const L = rand(4, 30);
    const l = rand(2, L - 1);
    const aire = Math.random() < 0.5;
    return inp(
      `Un rectangle mesure ${L} cm de longueur et ${l} cm de largeur. Calcule son ${aire ? 'aire (en cm²)' : 'périmètre (en cm)'}.`,
      aire ? L * l : 2 * (L + l),
      aire ? 'L’aire d’un rectangle se calcule avec la longueur et la largeur : quelle opération les relie ?' : 'Le périmètre, c’est la longueur du tour de la figure : additionne les 4 côtés.',
      aire
        ? `Aire du rectangle = longueur × largeur = ${L} × ${l} = ${L * l} cm².`
        : `Périmètre = 2 × (longueur + largeur) = 2 × (${L} + ${l}) = 2 × ${L + l} = ${2 * (L + l)} cm.`,
      'Périmètres et aires'
    );
  },
  // Aire du triangle rectangle
  () => {
    let a = rand(3, 20);
    const b = rand(2, 15);
    if ((a * b) % 2) a += 1;
    return inp(
      `Un triangle rectangle a deux côtés de l’angle droit qui mesurent ${a} cm et ${b} cm. Calcule son aire en cm².`,
      (a * b) / 2,
      'Un triangle rectangle, c’est la moitié d’un rectangle. Calcule l’aire de ce rectangle, puis prends-en la moitié.',
      `Le triangle est la moitié d’un rectangle de ${a} cm sur ${b} cm.\nAire du rectangle : ${a} × ${b} = ${a * b} cm².\nAire du triangle : ${a * b} ÷ 2 = ${(a * b) / 2} cm².`,
      'Périmètres et aires'
    );
  },
  // Proportionnalité : prix
  () => {
    const u = rand(5, 60) * 10;
    const n = rand(2, 6);
    const m = rand(7, 15);
    const obj = pick(['cahiers', 'stylos', 'croissants', 'billets de bus', 'paquets de gâteaux']);
    return inp(
      `${n} ${obj} coûtent ${dec2(n * u)} €. Combien coûtent ${m} ${obj} (en €) ?`,
      fr((m * u) / 100),
      'Cherche d’abord le prix d’un seul objet (passage par l’unité), puis multiplie.',
      `Prix d’un objet : ${dec2(n * u)} ÷ ${n} = ${dec2(u)} €.\nPrix de ${m} ${obj} : ${dec2(u)} × ${m} = ${dec2(m * u)} €.\nRéponse : ${fr((m * u) / 100)} €.`,
      'Proportionnalité'
    );
  },
  // Nature d'un angle
  () => {
    const kind = pick(['aigu', 'droit', 'obtus', 'plat']);
    const mes = { aigu: rand(5, 85), droit: 90, obtus: rand(95, 175), plat: 180 }[kind];
    return q4({
      prompt: `Un angle mesure ${mes}°. Quelle est sa nature ?`,
      answer: kind,
      wrong: ['aigu', 'droit', 'obtus', 'plat'].filter((k) => k !== kind),
      hint: 'Compare la mesure à 90° (angle droit) et à 180° (angle plat).',
      explanation: `Un angle aigu mesure moins de 90°, un angle droit exactement 90°, un angle obtus entre 90° et 180°, un angle plat 180°.\n${mes}° → l’angle est ${kind}.`,
      skill: 'Angles'
    });
  },
  // Division euclidienne
  () => {
    const d = rand(3, 12);
    const q = rand(5, 40);
    const r = rand(0, d - 1);
    const n = d * q + r;
    const askQ = Math.random() < 0.5;
    return inp(
      `Dans la division euclidienne de ${n} par ${d}, quel est le ${askQ ? 'quotient' : 'reste'} ?`,
      askQ ? q : r,
      `Cherche le plus grand multiple de ${d} qui ne dépasse pas ${n}. Le reste doit toujours être plus petit que ${d}.`,
      `${d} × ${q} = ${d * q} ≤ ${n} et ${d} × ${q + 1} = ${d * (q + 1)} > ${n}.\nDonc ${n} = ${d} × ${q} + ${r}, avec ${r} < ${d}.\nLe quotient est ${q} et le reste est ${r}.`,
      'Division euclidienne'
    );
  },
  // Conversions de longueurs
  () => {
    const U = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];
    const i = rand(0, 6);
    let j = rand(Math.max(0, i - 3), Math.min(6, i + 3));
    if (j === i) j = i < 6 ? i + 1 : i - 1;
    const t = rand(1, 999);
    const v = t / 10;
    const r = (t * 10 ** (j - i)) / 10;
    const k = Math.abs(j - i);
    return inp(
      `Convertis : ${fr(v)} ${U[i]} = … ${U[j]}`,
      fr(r, 6),
      'Utilise le tableau de conversion km | hm | dam | m | dm | cm | mm : chaque colonne vaut 10 fois la suivante.',
      `De ${U[i]} à ${U[j]}, on se déplace de ${k} colonne${k > 1 ? 's' : ''} vers la ${j > i ? 'droite : on multiplie' : 'gauche : on divise'} par ${10 ** k}.\n${fr(v)} ${j > i ? '×' : '÷'} ${10 ** k} = ${fr(r, 6)}.\nDonc ${fr(v)} ${U[i]} = ${fr(r, 6)} ${U[j]}.`,
      'Grandeurs et mesures'
    );
  },
  // Périmètre du cercle
  () => {
    const useR = Math.random() < 0.5;
    const x = rand(2, 20);
    const d = useR ? 2 * x : x;
    const P = (d * 314) / 100;
    return inp(
      `Un cercle a un ${useR ? 'rayon' : 'diamètre'} de ${x} cm. Calcule son périmètre en cm, en prenant π ≈ 3,14.`,
      fr(P),
      'Le périmètre d’un cercle se calcule avec son diamètre et le nombre π. Attention : le diamètre vaut deux fois le rayon.',
      `${useR ? `Diamètre = 2 × rayon = 2 × ${x} = ${d} cm.\n` : ''}Périmètre = π × diamètre ≈ 3,14 × ${d} = ${fr(P)} cm.`,
      'Cercle'
    );
  }
];

const maths6Cards = [
  { front: 'Périmètre d’un rectangle', back: 'P = 2 × (longueur + largeur)', skill: 'Périmètres et aires' },
  { front: 'Aire d’un rectangle', back: 'A = longueur × largeur', skill: 'Périmètres et aires' },
  { front: 'Aire d’un carré de côté c', back: 'A = c × c', skill: 'Périmètres et aires' },
  { front: 'Aire d’un triangle rectangle', back: 'La moitié de l’aire du rectangle : (côté 1 × côté 2) ÷ 2', skill: 'Périmètres et aires' },
  { front: 'Périmètre d’un cercle', back: 'P = π × diamètre = 2 × π × rayon (π ≈ 3,14)', skill: 'Cercle' },
  { front: 'Multiplier un décimal par 10, 100, 1 000', back: 'On décale la virgule de 1, 2 ou 3 rangs vers la droite.', skill: 'Nombres décimaux' },
  { front: 'Diviser un décimal par 10, 100, 1 000', back: 'On décale la virgule de 1, 2 ou 3 rangs vers la gauche.', skill: 'Nombres décimaux' },
  { front: 'Division euclidienne', back: 'dividende = diviseur × quotient + reste, avec reste < diviseur', skill: 'Division euclidienne' },
  { front: 'Angle aigu / droit / obtus / plat', back: 'Aigu : moins de 90° ; droit : 90° ; obtus : entre 90° et 180° ; plat : 180°.', skill: 'Angles' },
  { front: 'Prendre a/b d’une quantité', back: 'On divise la quantité par b, puis on multiplie le résultat par a.', skill: 'Fractions' },
  { front: 'Situation de proportionnalité', back: 'On passe d’une grandeur à l’autre en multipliant toujours par le même nombre (coefficient de proportionnalité).', skill: 'Proportionnalité' },
  { front: 'Critères de divisibilité par 2, 5, 10', back: 'Par 2 : chiffre des unités pair. Par 5 : se termine par 0 ou 5. Par 10 : se termine par 0.', skill: 'Nombres entiers' },
  { front: 'Critères de divisibilité par 3 et par 9', back: 'La somme des chiffres est divisible par 3 (respectivement par 9).', skill: 'Nombres entiers' },
  { front: 'Médiatrice d’un segment', back: 'Droite perpendiculaire au segment qui passe par son milieu.', skill: 'Géométrie' }
];

// =====================================================================
// 6ᵉ — SCIENCES & TECHNOLOGIE
// =====================================================================

const sci6Matiere = [
  B('Sous quels trois états peut-on trouver l’eau ?', 'Solide, liquide et gazeux', ['Solide, liquide et pâteux', 'Liquide, gazeux et transparent', 'Glace, neige et pluie'], 'Pense à la glace, à l’eau du robinet et à la vapeur.', 'L’eau existe à l’état solide (glace), liquide (eau) et gazeux (vapeur d’eau, invisible).'),
  B('Comment s’appelle le passage de l’état liquide à l’état solide ?', 'La solidification', ['La fusion', 'La vaporisation', 'La condensation'], 'Le mot ressemble à l’état final obtenu.', 'Liquide → solide : solidification. La fusion est le passage inverse (solide → liquide).'),
  B('Comment s’appelle le passage de l’état solide à l’état liquide ?', 'La fusion', ['La solidification', 'La liquéfaction', 'L’évaporation'], 'C’est ce qui arrive à un glaçon sorti du congélateur.', 'Solide → liquide : fusion (le glaçon fond).'),
  B('Un liquide…', 'prend la forme du récipient et a une surface libre plane et horizontale', ['a une forme propre qui ne change pas', 'occupe tout le volume disponible', 'ne peut pas être versé'], 'Verse de l’eau dans un verre puis dans une bouteille : que se passe-t-il ?', 'Un liquide n’a pas de forme propre : il épouse la forme du récipient, et sa surface au repos est plane et horizontale.'),
  B('L’eau salée est un mélange…', 'homogène', ['hétérogène', 'qui n’est pas un mélange', 'gazeux'], 'Peut-on distinguer à l’œil nu le sel dans l’eau une fois dissous ?', 'Le sel est dissous : on ne distingue plus ses constituants à l’œil nu, c’est un mélange homogène.'),
  B('Quelle technique permet de séparer le sable de l’eau ?', 'La filtration', ['La dissolution', 'L’évaporation du sable', 'L’aimantation'], 'Pense à un filtre à café.', 'Le filtre retient les grains de sable et laisse passer l’eau : c’est la filtration.'),
  B('Lors de la fusion de 50 g de glace, on obtient…', '50 g d’eau liquide', ['moins de 50 g d’eau', 'plus de 50 g d’eau', 'une masse impossible à prévoir'], 'Lors d’un changement d’état, la matière disparaît-elle ?', 'Lors d’un changement d’état, la masse se conserve : 50 g de glace donnent 50 g d’eau.'),
  B('Quel instrument mesure une masse ?', 'Une balance', ['Une éprouvette graduée', 'Un thermomètre', 'Un chronomètre'], 'Pense à ce qu’on utilise en cuisine pour peser la farine.', 'La masse se mesure avec une balance (en g ou kg). L’éprouvette mesure un volume.'),
  B('Un gaz…', 'occupe tout l’espace disponible', ['a une forme propre', 'a toujours une surface plane', 'ne peut pas être comprimé'], 'Que se passe-t-il quand on ouvre un flacon de parfum dans une pièce ?', 'Un gaz n’a ni forme ni volume propres : il occupe tout l’espace qui lui est offert et se comprime facilement.')
];

const sci6Vivant = [
  B('De quoi une plante verte a-t-elle besoin pour produire sa matière ?', 'De lumière, d’eau, de sels minéraux et de dioxyde de carbone', ['De sucre et de viande', 'Uniquement d’eau', 'De terre seulement, qu’elle mange'], 'La plante ne mange pas : elle fabrique sa matière grâce au soleil.', 'Une plante verte fabrique sa matière avec la lumière, l’eau, les sels minéraux du sol et le dioxyde de carbone de l’air.'),
  B('Dans la chaîne alimentaire « herbe → lapin → renard », que signifie la flèche ?', '« est mangé par »', ['« mange »', '« vit avec »', '« se transforme en »'], 'Lis la chaîne en partant de l’herbe.', 'La flèche se lit « est mangé par » : l’herbe est mangée par le lapin, qui est mangé par le renard.'),
  B('Quel animal est un vertébré ?', 'Le lézard', ['L’escargot', 'Le ver de terre', 'L’araignée'], 'Un vertébré possède un squelette intérieur avec une colonne vertébrale.', 'Le lézard possède une colonne vertébrale : c’est un vertébré. Les trois autres n’en ont pas.'),
  B('Pour classer les êtres vivants, on utilise…', 'les attributs (caractères) qu’ils possèdent en commun', ['leur taille', 'le milieu où ils vivent', 'leur couleur'], 'On regroupe les êtres vivants selon ce qu’ils ont, pas selon ce qu’ils font.', 'La classification en groupes emboîtés repose sur les attributs partagés (squelette, poils, plumes…), pas sur la taille ou le milieu de vie.'),
  B('Un animal qui ne mange que des végétaux est…', 'herbivore', ['carnivore', 'omnivore', 'décomposeur'], 'Le mot vient du latin « herba ».', 'Un herbivore se nourrit uniquement de végétaux (vache, lapin…).'),
  B('Comment appelle-t-on le passage de la chenille au papillon ?', 'Une métamorphose', ['Une mue simple', 'Une germination', 'Une reproduction'], 'L’animal change complètement de forme.', 'Chez le papillon, le développement passe par des transformations importantes (chenille, chrysalide, papillon) : c’est une métamorphose.'),
  B('Quel est le rôle des décomposeurs (vers de terre, champignons…) ?', 'Transformer la matière morte en matière minérale', ['Produire de la lumière', 'Manger les animaux vivants', 'Fabriquer de l’oxygène la nuit'], 'Que deviennent les feuilles mortes en forêt ?', 'Les décomposeurs transforment les restes d’êtres vivants en sels minéraux, réutilisés par les plantes.'),
  B('Une graine qui se met à pousser…', 'germe', ['fleurit', 'pollinise', 'fructifie'], 'C’est la toute première étape de la vie d’une nouvelle plante.', 'Quand une graine se développe en jeune plante, on parle de germination.'),
  B('Quel organe permet au poisson de respirer dans l’eau ?', 'Les branchies', ['Les poumons', 'Les nageoires', 'Les écailles'], 'Cet organe est situé de chaque côté de la tête.', 'Le poisson prélève le dioxygène dissous dans l’eau grâce à ses branchies.')
];

const sci6Terre = [
  B('Quelle est l’étoile la plus proche de la Terre ?', 'Le Soleil', ['La Lune', 'Mars', 'L’étoile Polaire'], 'Elle nous éclaire chaque jour.', 'Le Soleil est une étoile, la plus proche de nous. La Lune est un satellite et Mars une planète.'),
  B('Combien de temps la Terre met-elle pour faire un tour sur elle-même ?', 'Environ 24 heures', ['Environ 365 jours', 'Environ 1 mois', 'Environ 1 heure'], 'Ce mouvement explique l’alternance du jour et de la nuit.', 'La rotation de la Terre sur elle-même dure environ 24 h : elle explique le jour et la nuit.'),
  B('Combien de temps la Terre met-elle pour faire le tour du Soleil ?', 'Environ 365 jours', ['Environ 24 heures', 'Environ 28 jours', 'Environ 10 ans'], 'Cette durée définit une année.', 'La révolution de la Terre autour du Soleil dure environ 365,25 jours : c’est une année.'),
  B('La Lune est…', 'un satellite naturel de la Terre', ['une étoile', 'une planète du système solaire', 'une comète'], 'Elle tourne autour de la Terre.', 'La Lune tourne autour de la Terre : c’est son satellite naturel. Elle ne produit pas de lumière, elle renvoie celle du Soleil.'),
  B('Pourquoi a-t-on des saisons ?', 'Parce que l’axe de rotation de la Terre est incliné', ['Parce que la Terre s’éloigne beaucoup du Soleil en hiver', 'Parce que le Soleil s’éteint un peu', 'À cause de la Lune'], 'Ce n’est pas une question de distance au Soleil.', 'L’axe de la Terre est incliné : au cours de l’année, les rayons du Soleil arrivent plus ou moins inclinés et la durée du jour change, ce qui crée les saisons.'),
  B('Quelle planète est la plus proche du Soleil ?', 'Mercure', ['Vénus', 'La Terre', 'Neptune'], 'C’est une petite planète rocheuse.', 'Ordre des planètes : Mercure, Vénus, Terre, Mars, Jupiter, Saturne, Uranus, Neptune.'),
  B('Quelle source d’énergie est renouvelable ?', 'Le vent', ['Le pétrole', 'Le charbon', 'Le gaz naturel'], 'Une énergie renouvelable ne s’épuise pas à l’échelle humaine.', 'Le vent (énergie éolienne) se renouvelle sans cesse. Pétrole, charbon et gaz sont des énergies fossiles qui s’épuisent.'),
  B('Où trouve-t-on la majeure partie de l’eau sur Terre ?', 'Dans les océans (eau salée)', ['Dans les rivières', 'Dans les nuages', 'Dans les nappes souterraines'], 'La Terre est appelée la « planète bleue ».', 'Environ 97 % de l’eau de la Terre est l’eau salée des océans.')
];

const sci6Techno = [
  B('Qu’est-ce que la fonction d’usage d’un objet technique ?', 'Ce à quoi sert l’objet', ['La couleur de l’objet', 'Le prix de l’objet', 'Le matériau de l’objet'], 'Réponds à la question « à quoi sert-il ? ».', 'La fonction d’usage décrit le besoin auquel répond l’objet (ex. : un stylo sert à écrire).'),
  B('Dans un circuit électrique simple, que faut-il pour qu’une lampe brille ?', 'Une boucle fermée avec un générateur', ['Un seul fil relié à la pile', 'Un interrupteur ouvert', 'Un circuit sans pile'], 'Le courant doit pouvoir faire le tour complet.', 'Il faut un circuit fermé comprenant un générateur (pile) : le courant circule alors et la lampe brille.'),
  B('Quel matériau est un bon conducteur électrique ?', 'Le cuivre', ['Le plastique', 'Le bois sec', 'Le verre'], 'On l’utilise à l’intérieur des câbles électriques.', 'Les métaux comme le cuivre conduisent l’électricité. Plastique, bois sec et verre sont des isolants.'),
  B('Un interrupteur ouvert dans un circuit…', 'empêche le courant de circuler', ['augmente la luminosité', 'fait circuler le courant plus vite', 'recharge la pile'], 'Un circuit ouvert n’est plus une boucle complète.', 'Interrupteur ouvert = circuit ouvert : le courant ne circule plus, la lampe s’éteint.'),
  B('Quelle est la famille de matériaux d’une canette de soda ?', 'Les métaux', ['Les matières plastiques', 'Les matériaux organiques', 'Les céramiques'], 'Elle est en aluminium.', 'Une canette est en aluminium, un métal (souvent recyclable à l’infini).'),
  B('Un panneau solaire transforme l’énergie lumineuse en…', 'énergie électrique', ['énergie chimique', 'énergie sonore', 'énergie nucléaire'], 'On l’utilise pour alimenter des appareils.', 'Les panneaux photovoltaïques convertissent la lumière du Soleil en électricité.'),
  B('Pourquoi trie-t-on les déchets ?', 'Pour recycler les matériaux et préserver les ressources', ['Pour qu’ils prennent moins de place à la maison', 'Parce que c’est plus joli', 'Pour les brûler plus vite'], 'Pense à la seconde vie des matériaux.', 'Le tri permet de recycler (papier, verre, métaux, plastiques) et de limiter l’exploitation de nouvelles ressources.'),
  B('Dans un algorithme, une instruction « répéter 4 fois » est…', 'une boucle', ['une condition', 'une variable', 'un capteur'], 'Elle fait recommencer plusieurs fois les mêmes actions.', 'Une boucle répète un bloc d’instructions un nombre donné de fois.')
];

const sciences6 = [
  fromBank(sci6Matiere, 'La matière'),
  fromBank(sci6Vivant, 'Le vivant'),
  fromBank(sci6Terre, 'La Terre et l’Univers'),
  fromBank(sci6Techno, 'Objets techniques'),
  // État de l'eau selon la température
  () => {
    const etat = pick(['solide (glace)', 'liquide', 'gazeuse (vapeur d’eau)']);
    const T = { 'solide (glace)': rand(-30, -2), liquide: rand(2, 98), 'gazeuse (vapeur d’eau)': rand(102, 140) }[etat];
    return q4({
      prompt: `Sous la pression atmosphérique normale, à ${T} °C, l’eau pure est :`,
      answer: etat,
      wrong: ['solide (glace)', 'liquide', 'gazeuse (vapeur d’eau)', 'à la fois solide et gazeuse'].filter((e) => e !== etat),
      hint: 'Rappelle-toi les deux températures repères de l’eau : celle où elle gèle et celle où elle bout.',
      explanation: `L’eau pure gèle à 0 °C et bout à 100 °C (pression normale).\nEn dessous de 0 °C elle est solide, entre 0 °C et 100 °C liquide, au-dessus de 100 °C gazeuse.\nÀ ${T} °C, l’eau est donc ${etat}.`,
      skill: 'La matière'
    });
  },
  // Conversion de masses
  () => {
    const toKg = Math.random() < 0.5;
    const g = toKg ? rand(1, 999) * 10 : rand(1, 99) * 100;
    return inp(
      toKg ? `Convertis ${g} g en kg.` : `Convertis ${fr(g / 1000)} kg en g.`,
      toKg ? fr(g / 1000, 3) : g,
      'Combien de grammes y a-t-il dans 1 kilogramme ?',
      `1 kg = 1 000 g.\n${toKg ? `${g} g = ${g} ÷ 1 000 kg = ${fr(g / 1000, 3)} kg.` : `${fr(g / 1000)} kg = ${fr(g / 1000)} × 1 000 g = ${g} g.`}`,
      'Grandeurs et mesures'
    );
  },
  // Contenances
  () => {
    const cl = rand(1, 300) * 5;
    const toL = Math.random() < 0.5;
    return inp(
      toL ? `Une bouteille contient ${cl} cL. Combien de litres cela fait-il ?` : `Convertis ${cl} cL en mL.`,
      toL ? fr(cl / 100) : cl * 10,
      'Utilise le tableau L | dL | cL | mL : chaque unité vaut 10 fois la suivante.',
      toL ? `1 L = 100 cL, donc ${cl} cL = ${cl} ÷ 100 L = ${fr(cl / 100)} L.` : `1 cL = 10 mL, donc ${cl} cL = ${cl} × 10 = ${cl * 10} mL.`,
      'Grandeurs et mesures'
    );
  },
  // Distance parcourue à vitesse constante
  () => {
    const v = pick([4, 5, 12, 15, 20, 50, 80, 90, 110]);
    const t = pick([2, 3, 4, 5]);
    const [moy, pro] = v <= 5 ? ['Un randonneur', 'il'] : v <= 20 ? ['Une cycliste', 'elle'] : ['Une voiture', 'elle'];
    return inp(
      `${moy} se déplace à la vitesse constante de ${v} km/h pendant ${t} h. Quelle distance parcourt-${pro} (en km) ?`,
      v * t,
      `${v} km/h signifie qu’en 1 heure on parcourt ${v} km. Et en ${t} heures ?`,
      `En 1 h, on parcourt ${v} km. En ${t} h, on parcourt ${t} fois plus : ${v} × ${t} = ${v * t} km.`,
      'Mouvement et vitesse'
    );
  }
];

const sciences6Cards = [
  { front: 'Les trois états de la matière', back: 'Solide (forme propre), liquide (prend la forme du récipient), gaz (occupe tout l’espace).', skill: 'La matière' },
  { front: 'Fusion / solidification', back: 'Fusion : solide → liquide. Solidification : liquide → solide (0 °C pour l’eau pure).', skill: 'La matière' },
  { front: 'Vaporisation / condensation', back: 'Vaporisation : liquide → gaz. Condensation (liquéfaction) : gaz → liquide.', skill: 'La matière' },
  { front: 'Conservation de la masse', back: 'Lors d’un changement d’état, la masse se conserve (le volume peut changer).', skill: 'La matière' },
  { front: 'Mélange homogène', back: 'On ne distingue pas ses constituants à l’œil nu (ex. : eau salée).', skill: 'La matière' },
  { front: 'Besoins d’une plante verte', back: 'Lumière, eau, sels minéraux, dioxyde de carbone.', skill: 'Le vivant' },
  { front: 'Chaîne alimentaire', back: 'Suite d’êtres vivants où chacun est mangé par le suivant ; la flèche signifie « est mangé par ».', skill: 'Le vivant' },
  { front: 'Classification en groupes emboîtés', back: 'On regroupe les êtres vivants selon les attributs qu’ils partagent (squelette interne, poils, plumes…).', skill: 'Le vivant' },
  { front: 'Rotation et révolution de la Terre', back: 'Rotation sur elle-même : 24 h (jour/nuit). Révolution autour du Soleil : environ 365 jours (année).', skill: 'La Terre et l’Univers' },
  { front: 'Énergie renouvelable', back: 'Source qui se renouvelle à l’échelle humaine : soleil, vent, eau, biomasse, géothermie.', skill: 'Énergie' },
  { front: 'Fonction d’usage', back: 'Ce à quoi sert un objet technique, le besoin auquel il répond.', skill: 'Objets techniques' },
  { front: 'Circuit électrique fermé', back: 'Boucle complète avec un générateur : le courant circule.', skill: 'Objets techniques' }
];

// =====================================================================
// 5ᵉ — MATHÉMATIQUES
// =====================================================================

// Explication générique de l'addition de deux relatifs.
function explAdd(a, b) {
  const r = a + b;
  if ((a >= 0) === (b >= 0)) {
    return `${par(a)} et ${par(b)} ont le même signe : on additionne leurs distances à zéro (${Math.abs(a)} + ${Math.abs(b)} = ${Math.abs(r)}) et on garde le signe commun.\nRésultat : ${r}.`;
  }
  const grand = Math.abs(a) >= Math.abs(b) ? a : b;
  return `${par(a)} et ${par(b)} sont de signes contraires : on soustrait leurs distances à zéro (${Math.max(Math.abs(a), Math.abs(b))} - ${Math.min(Math.abs(a), Math.abs(b))} = ${Math.abs(r)}) et on prend le signe de ${par(grand)}, qui a la plus grande distance à zéro.\nRésultat : ${r}.`;
}

const maths5 = [
  // Addition de relatifs
  () => {
    const a = rand(-20, 20) || 7;
    const b = rand(-20, 20) || -4;
    return inp(`Calcule : ${par(a)} + ${par(b)}`, a + b,
      'Regarde les signes : s’ils sont identiques, on additionne les distances à zéro ; sinon, on les soustrait.',
      explAdd(a, b), 'Nombres relatifs');
  },
  // Soustraction de relatifs
  () => {
    const a = rand(-15, 15) || 6;
    const b = rand(-15, 15) || -9;
    return inp(`Calcule : ${par(a)} - ${par(b)}`, a - b,
      'Soustraire un nombre, c’est ajouter son opposé. Transforme la soustraction en addition.',
      `Soustraire ${par(b)}, c’est ajouter son opposé ${par(-b)} :\n${par(a)} - ${par(b)} = ${par(a)} + ${par(-b)}.\n${explAdd(a, -b)}`, 'Nombres relatifs');
  },
  // Priorités opératoires
  () => {
    const a = rand(2, 12);
    const b = rand(2, 9);
    const c = rand(2, 9);
    const [expr, r, exp] = pick([
      [`${a} + ${b} × ${c}`, a + b * c, `La multiplication est prioritaire : ${b} × ${c} = ${b * c}.\nPuis l’addition : ${a} + ${b * c} = ${a + b * c}.`],
      [`(${a} + ${b}) × ${c}`, (a + b) * c, `On calcule d’abord entre parenthèses : ${a} + ${b} = ${a + b}.\nPuis : ${a + b} × ${c} = ${(a + b) * c}.`],
      [`${a * b + c} - ${a} × ${b}`, c, `La multiplication est prioritaire : ${a} × ${b} = ${a * b}.\nPuis : ${a * b + c} - ${a * b} = ${c}.`],
      [`${a} + ${b * c} ÷ ${c}`, a + b, `La division est prioritaire : ${b * c} ÷ ${c} = ${b}.\nPuis : ${a} + ${b} = ${a + b}.`],
      [`${a} × (${b + c} - ${c})`, a * b, `On calcule d’abord entre parenthèses : ${b + c} - ${c} = ${b}.\nPuis : ${a} × ${b} = ${a * b}.`]
    ]);
    return inp(`Calcule : ${expr}`, r,
      'Ordre des priorités : d’abord les parenthèses, puis les multiplications et divisions, enfin les additions et soustractions.',
      `${exp}\nRéponse : ${r}.`, 'Priorités opératoires');
  },
  // Addition / soustraction de fractions
  () => {
    const d1 = rand(2, 9);
    const k = pick([1, 2, 3]);
    const d2 = d1 * k;
    let n1 = rand(1, 2 * d1 - 1);
    if (n1 % d1 === 0) n1 += 1;
    let n2 = rand(1, 2 * d2 - 1);
    if (n2 % d2 === 0) n2 += 1;
    const sub = Math.random() < 0.4 && n1 * k > n2;
    const N = sub ? n1 * k - n2 : n1 * k + n2;
    const op = sub ? '-' : '+';
    const step = k === 1 ? 'Les dénominateurs sont déjà égaux.' : `On met au même dénominateur ${d2} : ${n1}/${d1} = ${n1 * k}/${d2} (on multiplie en haut et en bas par ${k}).`;
    const fin = simp(N, d2) !== `${N}/${d2}` ? `\nOn simplifie : ${N}/${d2} = ${simp(N, d2)}.` : '';
    return inp(`Calcule et donne le résultat sous forme de fraction : ${n1}/${d1} ${op} ${n2}/${d2}`, fracForms(N, d2),
      'Pour additionner ou soustraire des fractions, il faut le même dénominateur. Ensuite, on garde le dénominateur et on calcule les numérateurs.',
      `${step}\n${n1 * k}/${d2} ${op} ${n2}/${d2} = ${N}/${d2}.${fin}`, 'Fractions');
  },
  // Appliquer un pourcentage
  () => {
    const t = pick([5, 10, 15, 20, 25, 30, 40, 50, 75]);
    const N = 20 * rand(1, 25);
    const r = (t * N) / 100;
    return inp(`Calcule ${t} % de ${N}.`, r,
      `Prendre ${t} %, c’est multiplier par ${t}/100.`,
      `${t} % de ${N} = ${t}/100 × ${N} = ${t * N} ÷ 100 = ${r}.`, 'Pourcentages');
  },
  // Somme des angles d'un triangle
  () => {
    if (Math.random() < 0.5) {
      const a = rand(20, 120);
      const b = rand(15, 170 - a);
      const c = 180 - a - b;
      return inp(`Dans un triangle ABC, l’angle A mesure ${a}° et l’angle B mesure ${b}°. Combien mesure l’angle C (en degrés) ?`, c,
        'Dans tout triangle, la somme des trois angles vaut toujours la même valeur.',
        `La somme des angles d’un triangle vaut 180°.\nC = 180 - ${a} - ${b} = ${c}°.`, 'Triangles et angles');
    }
    const p = 2 * rand(10, 80);
    const base = (180 - p) / 2;
    return inp(`Un triangle est isocèle ; son angle principal (au sommet) mesure ${p}°. Combien mesure chacun des deux angles à la base (en degrés) ?`, base,
      'Un triangle isocèle a deux angles de même mesure (à la base), et la somme des angles d’un triangle est connue.',
      `La somme des angles vaut 180°. Les deux angles à la base sont égaux.\nIls mesurent ensemble 180 - ${p} = ${180 - p}°, donc chacun mesure ${180 - p} ÷ 2 = ${base}°.`, 'Triangles et angles');
  },
  // Aires : triangle et parallélogramme
  () => {
    const b = rand(3, 20);
    const h = rand(2, 15);
    if (Math.random() < 0.5) {
      return inp(`Un triangle a une base de ${b} cm et une hauteur relative à cette base de ${h} cm. Calcule son aire en cm².`, fr((b * h) / 2),
        'L’aire d’un triangle, c’est la moitié de « base × hauteur ».',
        `Aire = base × hauteur ÷ 2 = ${b} × ${h} ÷ 2 = ${b * h} ÷ 2 = ${fr((b * h) / 2)} cm².`, 'Aires');
    }
    return inp(`Un parallélogramme a un côté de ${b} cm et une hauteur relative à ce côté de ${h} cm. Calcule son aire en cm².`, b * h,
      'Un parallélogramme peut se transformer en rectangle en déplaçant un triangle : quelles dimensions aurait ce rectangle ?',
      `Aire du parallélogramme = base × hauteur = ${b} × ${h} = ${b * h} cm².`, 'Aires');
  },
  // Comparer des relatifs
  () => {
    const vals = distinct(4, -150, 150);
    const small = Math.random() < 0.5;
    const target = small ? Math.min(...vals) : Math.max(...vals);
    const show = (v) => fr(v / 10);
    return q4({
      prompt: `Quel est le plus ${small ? 'petit' : 'grand'} de ces nombres ?\n${vals.map(show).join(' ; ')}`,
      answer: show(target),
      wrong: vals.filter((v) => v !== target).map(show),
      hint: 'Place mentalement les nombres sur une droite graduée : plus un nombre est à gauche, plus il est petit. Entre deux négatifs, le plus petit est le plus éloigné de zéro.',
      explanation: `Rangés dans l’ordre croissant : ${[...vals].sort((x, y) => x - y).map(show).join(' < ')}.\nLe plus ${small ? 'petit' : 'grand'} est donc ${show(target)}.`,
      skill: 'Nombres relatifs'
    });
  },
  // Valeur d'une expression littérale
  () => {
    const a = rand(2, 9);
    const b = rand(1, 9);
    const x = rand(-5, 6);
    const [expr, r, exp] = pick([
      [`${a}x + ${b}`, a * x + b, `${a} × ${par(x)} + ${b} = ${a * x} + ${b} = ${a * x + b}`],
      [`${a}(x + ${b})`, a * (x + b), `${a} × (${x} + ${b}) = ${a} × ${par(x + b)} = ${a * (x + b)}`],
      [`x² + ${b}`, x * x + b, `${par(x)} × ${par(x)} + ${b} = ${x * x} + ${b} = ${x * x + b}`]
    ]);
    return inp(`Calcule la valeur de l’expression ${expr} pour x = ${x}.`, r,
      'Remplace x par sa valeur (entre parenthèses si elle est négative) et rappelle-toi que « 3x » signifie « 3 × x ».',
      `On remplace x par ${x} :\n${exp}.`, 'Calcul littéral');
  },
  // Simplifier une fraction
  () => {
    let n0;
    let d0;
    do { d0 = rand(2, 12); n0 = rand(1, 15); } while (gcd(n0, d0) !== 1 || n0 === d0);
    const k = rand(2, 9);
    return inp(`Simplifie la fraction ${n0 * k}/${d0 * k} jusqu’à la rendre irréductible.`, d0 === 1 ? [`${n0}`] : [`${n0}/${d0}`],
      'Cherche un diviseur commun au numérateur et au dénominateur (tables de multiplication, critères de divisibilité).',
      `${n0 * k} = ${k} × ${n0} et ${d0 * k} = ${k} × ${d0}.\nOn divise en haut et en bas par ${k} : ${n0 * k}/${d0 * k} = ${simp(n0, d0)}.\n${n0} et ${d0} n’ont plus de diviseur commun autre que 1 : la fraction est irréductible.`, 'Fractions');
  },
  // Partage selon un ratio
  () => {
    let p;
    let q;
    do { p = rand(1, 5); q = rand(1, 6); } while (p === q);
    const u = rand(2, 15);
    const T = (p + q) * u;
    const [n1, n2] = pick([['Léa', 'Tom'], ['Inès', 'Noah'], ['Sami', 'Jade']]);
    return inp(`${n1} et ${n2} se partagent ${T} billes selon le ratio ${p} : ${q}. Combien de billes reçoit ${n1} ?`, p * u,
      'Un ratio p : q signifie que l’on partage en p + q parts égales.',
      `Nombre total de parts : ${p} + ${q} = ${p + q}.\nUne part vaut ${T} ÷ ${p + q} = ${u} billes.\n${n1} reçoit ${p} part${p > 1 ? 's' : ''} : ${p} × ${u} = ${p * u} billes.`, 'Proportionnalité');
  },
  // Aire du disque
  () => {
    const r = rand(1, 12);
    const useD = Math.random() < 0.4;
    const A = (314 * r * r) / 100;
    return inp(`Calcule l’aire d’un disque de ${useD ? `diamètre ${2 * r}` : `rayon ${r}`} cm, en prenant π ≈ 3,14 (en cm²).`, fr(A),
      'L’aire d’un disque utilise le rayon multiplié par lui-même, puis π. Attention : le rayon est la moitié du diamètre.',
      `${useD ? `Rayon = ${2 * r} ÷ 2 = ${r} cm.\n` : ''}Aire = π × rayon × rayon ≈ 3,14 × ${r} × ${r} = 3,14 × ${r * r} = ${fr(A)} cm².`, 'Aires');
  }
];

const maths5Cards = [
  { front: 'Addition de deux relatifs de même signe', back: 'On additionne les distances à zéro et on garde le signe commun.', skill: 'Nombres relatifs' },
  { front: 'Addition de deux relatifs de signes contraires', back: 'On soustrait les distances à zéro et on prend le signe de celui qui a la plus grande distance à zéro.', skill: 'Nombres relatifs' },
  { front: 'Soustraire un relatif', back: 'Soustraire un nombre revient à ajouter son opposé : a - b = a + (-b).', skill: 'Nombres relatifs' },
  { front: 'Priorités opératoires', back: '1) parenthèses ; 2) multiplications et divisions ; 3) additions et soustractions (de gauche à droite).', skill: 'Priorités opératoires' },
  { front: 'Additionner deux fractions', back: 'On les écrit avec le même dénominateur, puis on additionne les numérateurs et on garde le dénominateur.', skill: 'Fractions' },
  { front: 'Fractions égales', back: 'On ne change pas une fraction en multipliant (ou divisant) numérateur et dénominateur par un même nombre non nul.', skill: 'Fractions' },
  { front: 'Somme des angles d’un triangle', back: '180°', skill: 'Triangles et angles' },
  { front: 'Inégalité triangulaire', back: 'Dans un triangle, chaque côté est plus petit que la somme des deux autres.', skill: 'Triangles et angles' },
  { front: 'Aire d’un triangle', back: 'A = base × hauteur ÷ 2', skill: 'Aires' },
  { front: 'Aire d’un parallélogramme', back: 'A = base × hauteur', skill: 'Aires' },
  { front: 'Aire d’un disque', back: 'A = π × r × r (π ≈ 3,14)', skill: 'Aires' },
  { front: 'Appliquer t %', back: 'Prendre t % d’un nombre, c’est le multiplier par t/100.', skill: 'Pourcentages' },
  { front: 'Angles alternes-internes', back: 'Si deux droites parallèles sont coupées par une sécante, les angles alternes-internes sont égaux.', skill: 'Triangles et angles' }
];

// =====================================================================
// 5ᵉ — SVT
// =====================================================================

const svt5Corps = [
  B('Quel gaz notre sang prélève-t-il dans les poumons ?', 'Le dioxygène', ['Le dioxyde de carbone', 'L’azote', 'La vapeur d’eau'], 'C’est le gaz indispensable aux organes pour fonctionner.', 'Au niveau des alvéoles pulmonaires, le sang s’enrichit en dioxygène (O₂) et rejette du dioxyde de carbone (CO₂).'),
  B('Pendant un effort physique, la fréquence cardiaque…', 'augmente', ['diminue', 'reste identique', 's’arrête'], 'Les muscles ont besoin de plus de dioxygène et de nutriments.', 'Pendant l’effort, le cœur bat plus vite pour apporter davantage de dioxygène et de nutriments aux muscles.'),
  B('Où se font les échanges gazeux entre l’air et le sang ?', 'Dans les alvéoles pulmonaires', ['Dans la trachée', 'Dans l’estomac', 'Dans le cœur'], 'Ce sont de minuscules sacs au bout des bronches.', 'Les alvéoles pulmonaires ont une paroi très fine et très vascularisée : c’est là que se font les échanges gazeux.'),
  B('Quel organe met le sang en mouvement ?', 'Le cœur', ['Les poumons', 'Le foie', 'Les reins'], 'C’est un muscle creux qui fonctionne comme une pompe.', 'Le cœur est une pompe musculaire qui propulse le sang dans les vaisseaux sanguins.'),
  B('Que produisent les muscles qui travaillent, en plus de l’énergie ?', 'Du dioxyde de carbone', ['Du dioxygène', 'Du glucose', 'Des globules rouges'], 'C’est un déchet rejeté ensuite par les poumons.', 'Les muscles consomment dioxygène et nutriments (glucose) et rejettent du dioxyde de carbone, évacué par les poumons.'),
  B('Où se termine la digestion et où passent les nutriments dans le sang ?', 'Dans l’intestin grêle', ['Dans la bouche', 'Dans l’œsophage', 'Dans le gros intestin uniquement'], 'C’est un très long tube replié, à la paroi plissée.', 'Les aliments sont transformés en nutriments qui passent dans le sang à travers la paroi de l’intestin grêle.'),
  B('Pourquoi faut-il un échauffement avant le sport ?', 'Pour préparer progressivement le cœur, les muscles et les articulations', ['Pour se fatiguer avant l’effort', 'Pour diminuer la fréquence cardiaque', 'Ça ne sert à rien'], 'Pense aux blessures que l’on veut éviter.', 'L’échauffement augmente progressivement le rythme cardiaque et la température des muscles, ce qui limite les blessures.'),
  B('Quel est le rôle principal des globules rouges ?', 'Transporter le dioxygène', ['Défendre contre les microbes', 'Digérer les aliments', 'Fabriquer les os'], 'Ils contiennent l’hémoglobine.', 'Les globules rouges transportent le dioxygène grâce à l’hémoglobine.')
];

const svt5Terre = [
  B('Comment s’appelle l’usure des roches par l’eau, le vent ou le gel ?', 'L’érosion', ['La sédimentation', 'Le volcanisme', 'La fossilisation'], 'C’est le phénomène qui creuse les vallées et façonne les falaises.', 'L’érosion est la destruction progressive des roches par des agents comme l’eau, le vent, le gel.'),
  B('Où se déposent la plupart des sédiments ?', 'Dans les zones basses comme les lacs et les océans', ['Au sommet des montagnes', 'Dans l’atmosphère', 'Au centre de la Terre'], 'Les rivières transportent les particules vers le bas.', 'Les particules transportées se déposent (sédimentation) dans les zones calmes et basses : lacs, deltas, fonds marins.'),
  B('Qu’est-ce qu’un fossile ?', 'Un reste ou une trace d’être vivant conservé dans une roche', ['Une roche volcanique', 'Un cristal de sel', 'Un animal actuel'], 'On en trouve souvent dans les roches sédimentaires.', 'Un fossile est le reste (coquille, os) ou la trace (empreinte) d’un être vivant ancien, conservé dans une roche sédimentaire.'),
  B('Quelle roche est une roche sédimentaire ?', 'Le calcaire', ['Le granite', 'Le basalte', 'Le diamant'], 'Elle se forme par accumulation de débris, souvent de coquilles.', 'Le calcaire se forme par accumulation de sédiments (souvent des restes de coquilles). Granite et basalte sont magmatiques.'),
  B('La météo décrit…', 'le temps qu’il fait à un endroit sur une courte durée', ['le climat moyen sur 30 ans', 'les séismes', 'la composition des roches'], 'Pense au bulletin du soir à la télévision.', 'La météorologie décrit le temps à court terme ; le climat est une moyenne sur au moins 30 ans.'),
  B('Quel facteur influence le plus le peuplement d’un milieu par les êtres vivants ?', 'Les conditions du milieu (lumière, température, humidité)', ['La couleur des roches', 'Le nom du lieu', 'La présence d’une route uniquement'], 'Pense aux différences entre une forêt sombre et une prairie ensoleillée.', 'La répartition des êtres vivants dépend des conditions du milieu : lumière, température, humidité, nourriture disponible.'),
  B('Le sol est formé…', 'par l’altération des roches et la décomposition de matière organique', ['uniquement de sable venu de la mer', 'par des volcans uniquement', 'en quelques jours'], 'Il contient à la fois des minéraux et de l’humus.', 'Le sol résulte de l’altération lente de la roche et de la transformation de la matière organique (humus) par les décomposeurs.'),
  B('Comment une plante à fleurs peut-elle disperser ses graines ?', 'Grâce au vent, à l’eau ou aux animaux', ['Uniquement en marchant', 'Grâce à la lumière', 'Elle ne les disperse jamais'], 'Pense au pissenlit et aux fruits mangés par les oiseaux.', 'Les graines sont dispersées par le vent (pissenlit), l’eau ou les animaux (fruits consommés, graines accrochées aux poils).')
];

const svt5Eco = [
  B('Qu’appelle-t-on un écosystème ?', 'Un milieu de vie et l’ensemble des êtres vivants qui y vivent en interaction', ['Uniquement les animaux d’une forêt', 'Une espèce protégée', 'Un parc d’attractions'], 'Le mot réunit un lieu et des relations entre êtres vivants.', 'Un écosystème = un milieu (biotope) + les êtres vivants qui y vivent (biocénose) et leurs interactions.'),
  B('Les producteurs primaires d’un écosystème sont…', 'les végétaux chlorophylliens', ['les carnivores', 'les champignons', 'les animaux herbivores'], 'Ils fabriquent leur propre matière grâce à la lumière.', 'Les végétaux chlorophylliens produisent de la matière organique à partir de matière minérale et de lumière.'),
  B('La pollinisation correspond…', 'au transport du pollen vers le pistil d’une fleur', ['à la chute des feuilles', 'à la germination d’une graine', 'à la respiration des plantes'], 'Les abeilles y jouent un grand rôle.', 'La pollinisation est le transport du pollen (cellules reproductrices mâles) jusqu’au pistil, souvent par les insectes ou le vent.'),
  B('Que devient le pistil d’une fleur après la fécondation ?', 'Un fruit contenant des graines', ['Une racine', 'Une feuille', 'Du pollen'], 'Pense à ce que l’on mange en été sur un cerisier.', 'Après la fécondation, le pistil se transforme en fruit et les ovules en graines.'),
  B('Quelle action humaine favorise la biodiversité ?', 'Planter des haies', ['Utiliser beaucoup de pesticides', 'Bétonner les zones humides', 'Introduire des espèces invasives'], 'Pense aux abris pour les oiseaux et les insectes.', 'Les haies offrent abri et nourriture à de nombreuses espèces : elles favorisent la biodiversité.'),
  B('Un champignon qui décompose les feuilles mortes est…', 'un décomposeur', ['un producteur', 'un prédateur', 'un herbivore'], 'Il recycle la matière morte.', 'Les décomposeurs transforment la matière organique morte en matière minérale utilisable par les végétaux.'),
  B('La reproduction asexuée d’une plante (bouturage, stolon) donne…', 'des individus identiques à la plante mère', ['des individus tous différents', 'des graines', 'des fleurs uniquement'], 'Il n’y a pas de fécondation.', 'Sans fécondation, la reproduction asexuée produit des clones, génétiquement identiques à la plante mère.'),
  B('Pourquoi de nombreux animaux migrent-ils en hiver ?', 'Pour trouver de la nourriture et des conditions plus favorables', ['Pour fuir la lumière', 'Parce qu’ils changent d’espèce', 'Pour hiberner sous l’eau'], 'Les ressources varient au cours des saisons.', 'Quand les conditions deviennent défavorables (froid, manque de nourriture), certains animaux migrent vers des régions plus favorables.')
];

const svt5 = [
  fromBank(svt5Corps, 'Le corps humain et l’effort'),
  fromBank(svt5Terre, 'La planète Terre'),
  fromBank(svt5Eco, 'Écosystèmes et biodiversité'),
  // Fréquence cardiaque
  () => {
    const s = pick([10, 15, 20, 30]);
    const bpm = (60 / s) * rand(Math.ceil(55 * s / 60), Math.floor(180 * s / 60));
    const n = (bpm * s) / 60;
    return inp(`On compte ${n} battements de cœur en ${s} secondes. Quelle est la fréquence cardiaque en battements par minute ?`, bpm,
      'Combien de fois y a-t-il ' + s + ' secondes dans une minute ?',
      `1 minute = 60 s = ${60 / s} × ${s} s.\nFréquence cardiaque = ${n} × ${60 / s} = ${bpm} battements par minute.`, 'Le corps humain et l’effort');
  },
  // Débit ventilatoire
  () => {
    const v = pick([0.4, 0.5, 0.6, 0.8, 1, 1.5, 2]);
    const f = rand(12, 30);
    return inp(`À chaque inspiration, Lina fait entrer ${fr(v)} L d’air dans ses poumons. Elle respire ${f} fois par minute. Quel volume d’air (en L) inspire-t-elle en une minute ?`, fr(v * f),
      'Le volume par minute dépend du volume d’une inspiration et du nombre d’inspirations par minute.',
      `Volume par minute = volume d’une inspiration × fréquence respiratoire = ${fr(v)} × ${f} = ${fr(v * f)} L par minute.`, 'Le corps humain et l’effort');
  },
  // Consommation de dioxygène à l'effort
  () => {
    const rep = rand(2, 4) * 100;
    const k = rand(3, 8);
    return inp(`Au repos, un élève consomme ${rep} mL de dioxygène par minute. Pendant une course, sa consommation est multipliée par ${k}. Combien de mL de dioxygène consomme-t-il par minute pendant la course ?`, rep * k,
      'L’énoncé te dit par combien la consommation est multipliée.',
      `Consommation à l’effort = ${rep} × ${k} = ${rep * k} mL de dioxygène par minute. Les muscles qui travaillent ont besoin de beaucoup plus de dioxygène.`, 'Le corps humain et l’effort');
  },
  // Vitesse de sédimentation
  () => {
    const r = pick([0.1, 0.2, 0.5, 1, 2]);
    const N = rand(1, 20) * 1000;
    const mm = r * N;
    return inp(`Dans un lac, les sédiments se déposent à la vitesse de ${fr(r)} mm par an. Quelle épaisseur (en m) se dépose en ${N} ans ?`, fr(mm / 1000, 3),
      'Calcule d’abord l’épaisseur en millimètres, puis convertis : 1 m = 1 000 mm.',
      `Épaisseur = ${fr(r)} × ${N} = ${fr(mm)} mm.\nConversion : ${fr(mm)} mm = ${fr(mm)} ÷ 1 000 m = ${fr(mm / 1000, 3)} m.`, 'La planète Terre');
  }
];

const svt5Cards = [
  { front: 'Respiration (organisme)', back: 'Prélèvement de dioxygène et rejet de dioxyde de carbone.', skill: 'Le corps humain et l’effort' },
  { front: 'Alvéoles pulmonaires', back: 'Petits sacs au bout des bronches où se font les échanges gazeux entre l’air et le sang.', skill: 'Le corps humain et l’effort' },
  { front: 'Fréquence cardiaque', back: 'Nombre de battements du cœur par minute ; elle augmente pendant l’effort.', skill: 'Le corps humain et l’effort' },
  { front: 'Besoins d’un muscle en activité', back: 'Dioxygène et nutriments (glucose), apportés par le sang ; il rejette du CO₂.', skill: 'Le corps humain et l’effort' },
  { front: 'Digestion', back: 'Transformation des aliments en nutriments, qui passent dans le sang au niveau de l’intestin grêle.', skill: 'Le corps humain et l’effort' },
  { front: 'Érosion', back: 'Usure et destruction des roches par l’eau, le vent, le gel ou les êtres vivants.', skill: 'La planète Terre' },
  { front: 'Sédimentation', back: 'Dépôt de particules (sédiments) dans les zones calmes : lacs, océans.', skill: 'La planète Terre' },
  { front: 'Fossile', back: 'Reste ou trace d’un être vivant ancien conservé dans une roche sédimentaire.', skill: 'La planète Terre' },
  { front: 'Météo et climat', back: 'Météo : temps à court terme. Climat : moyenne sur au moins 30 ans.', skill: 'La planète Terre' },
  { front: 'Écosystème', back: 'Un milieu de vie + les êtres vivants qui y vivent et leurs interactions.', skill: 'Écosystèmes et biodiversité' },
  { front: 'Pollinisation', back: 'Transport du pollen d’une fleur jusqu’au pistil (par le vent, les insectes…).', skill: 'Écosystèmes et biodiversité' },
  { front: 'Biodiversité', back: 'Diversité des espèces, des individus et des écosystèmes.', skill: 'Écosystèmes et biodiversité' }
];

// =====================================================================
// 5ᵉ — PHYSIQUE-CHIMIE
// =====================================================================

const phys5Etats = [
  B('Pendant la solidification de l’eau pure, la température…', 'reste constante à 0 °C (palier)', ['augmente', 'baisse régulièrement', 'monte jusqu’à 100 °C'], 'Pense à l’allure de la courbe de température : il y a une partie horizontale.', 'Pour un corps pur, la température reste constante pendant tout le changement d’état : c’est le palier (0 °C pour l’eau).'),
  B('Quand l’eau liquide se transforme en glace, son volume…', 'augmente', ['diminue', 'reste exactement le même', 'devient nul'], 'Pourquoi une bouteille pleine d’eau éclate-t-elle au congélateur ?', 'L’eau est une exception : en gelant, son volume augmente (la glace flotte), mais sa masse reste la même.'),
  B('La buée sur un miroir de salle de bains est due à…', 'la condensation de la vapeur d’eau', ['la fusion de la glace', 'la solidification de l’eau', 'l’évaporation du miroir'], 'La vapeur d’eau rencontre une surface froide.', 'La vapeur d’eau de l’air chaud se liquéfie au contact du miroir froid : c’est une condensation (liquéfaction).'),
  B('Quelle est la température d’ébullition de l’eau pure sous pression normale ?', '100 °C', ['0 °C', '50 °C', '37 °C'], 'C’est la valeur repère la plus haute de l’échelle Celsius pour l’eau.', 'Sous pression atmosphérique normale, l’eau pure bout à 100 °C.'),
  B('Un corps pur se reconnaît…', 'à ses températures de changement d’état fixes', ['à sa couleur', 'au fait qu’il est toujours liquide', 'au fait qu’il est transparent'], 'Un mélange n’a pas de palier net.', 'Un corps pur présente un palier de température lors d’un changement d’état ; un mélange, non.'),
  B('À l’échelle moléculaire, dans un gaz, les molécules sont…', 'éloignées les unes des autres et en mouvement désordonné', ['collées et immobiles', 'rangées en ordre', 'collées mais mobiles'], 'Un gaz se comprime facilement : il y a de la place entre les molécules.', 'Dans un gaz, les molécules sont dispersées et s’agitent en tous sens : c’est pourquoi un gaz est compressible.'),
  B('L’évaporation de l’eau d’une flaque se fait…', 'à toute température, lentement, à la surface du liquide', ['seulement à 100 °C', 'seulement en hiver', 'uniquement sous l’eau'], 'Une flaque sèche même s’il ne fait pas 100 °C.', 'L’évaporation est une vaporisation lente à la surface du liquide, possible à toute température ; l’ébullition se fait à 100 °C pour l’eau.'),
  B('Lors d’un changement d’état, qu’est-ce qui se conserve toujours ?', 'La masse', ['Le volume', 'La forme', 'La température de l’air ambiant'], 'Pèse un glaçon puis l’eau obtenue.', 'La masse se conserve lors d’un changement d’état ; le volume peut varier.')
];

const phys5Melanges = [
  B('Qu’est-ce que la solubilité du sel dans l’eau ?', 'La masse maximale de sel que l’on peut dissoudre dans 1 L d’eau', ['La couleur de l’eau salée', 'La température d’ébullition du sel', 'Le volume du sel'], 'Au-delà d’une certaine quantité, le sel ne se dissout plus.', 'La solubilité est la masse maximale de soluté que l’on peut dissoudre dans un volume donné de solvant (environ 360 g/L pour le sel).'),
  B('Dans l’eau sucrée, le sucre est…', 'le soluté', ['le solvant', 'la solution', 'le précipité'], 'Le solvant est le liquide qui dissout.', 'Le sucre est dissous : c’est le soluté. L’eau est le solvant ; le mélange obtenu est la solution.'),
  B('Une solution saturée est une solution…', 'dans laquelle on ne peut plus dissoudre de soluté', ['sans aucun soluté', 'qui bout', 'qui est forcément colorée'], 'On voit apparaître un dépôt au fond.', 'Lorsque la solubilité est atteinte, le soluté ajouté ne se dissout plus et se dépose : la solution est saturée.'),
  B('Quel mélange est hétérogène ?', 'L’eau boueuse', ['L’eau sucrée', 'L’air filtré', 'Le sirop dilué'], 'Peut-on voir plusieurs constituants à l’œil nu ?', 'Dans l’eau boueuse, on distingue des particules de terre : c’est un mélange hétérogène.'),
  B('Comment récupérer le sel dissous dans l’eau de mer ?', 'Par évaporation de l’eau', ['Par filtration', 'Par décantation', 'Avec un aimant'], 'C’est ce qui se passe dans les marais salants.', 'Le sel dissous traverse le filtre ; en faisant évaporer l’eau, on récupère le sel (marais salants).'),
  B('L’air est un mélange composé principalement de…', 'diazote (environ 78 %) et dioxygène (environ 21 %)', ['dioxygène (78 %) et diazote (21 %)', 'dioxyde de carbone (50 %) et dioxygène (50 %)', 'vapeur d’eau uniquement'], 'Le gaz majoritaire n’est pas celui que l’on respire pour vivre.', 'L’air contient environ 78 % de diazote, 21 % de dioxygène et 1 % d’autres gaz.'),
  B('La décantation permet de…', 'laisser les particules solides se déposer au fond', ['dissoudre un solide', 'faire bouillir un liquide', 'colorer un mélange'], 'Il suffit d’attendre et de ne pas toucher au récipient.', 'Au repos, les particules plus denses tombent au fond : c’est la décantation. On peut ensuite filtrer.'),
  B('Quand on dissout 10 g de sel dans 200 g d’eau, la masse de la solution est…', '210 g', ['200 g', '190 g', '10 g'], 'La matière dissoute ne disparaît pas.', 'La masse se conserve lors d’une dissolution : 200 g + 10 g = 210 g.')
];

const phys5Lumiere = [
  B('Dans un milieu homogène et transparent, la lumière se propage…', 'en ligne droite', ['en zigzag', 'en cercle', 'uniquement vers le haut'], 'Pense aux faisceaux d’un phare dans le brouillard.', 'La lumière se propage en ligne droite dans un milieu homogène et transparent ; on la représente par un rayon lumineux.'),
  B('Quel objet est une source primaire de lumière ?', 'Une lampe allumée', ['La Lune', 'Un miroir', 'Une feuille blanche'], 'Une source primaire produit elle-même sa lumière.', 'Une lampe allumée produit sa propre lumière. La Lune, le miroir et la feuille ne font que diffuser ou réfléchir la lumière reçue.'),
  B('Pourquoi voit-on la Lune ?', 'Parce qu’elle diffuse la lumière du Soleil', ['Parce qu’elle produit sa lumière', 'Parce qu’elle est en feu', 'Grâce aux étoiles uniquement'], 'La Lune est un objet diffusant.', 'La Lune est éclairée par le Soleil et renvoie une partie de cette lumière vers la Terre.'),
  B('Pour qu’un objet soit vu, il faut que…', 'de la lumière venant de l’objet entre dans l’œil', ['l’œil envoie de la lumière sur l’objet', 'l’objet soit forcément une source primaire', 'il fasse nuit'], 'Dans le noir complet, on ne voit rien.', 'On voit un objet quand la lumière qu’il émet ou diffuse arrive dans notre œil.'),
  B('Quelle est la vitesse de la lumière dans le vide (environ) ?', '300 000 km/s', ['340 m/s', '300 km/h', '3 000 km/s'], 'C’est la vitesse la plus grande qui existe.', 'La lumière se propage dans le vide à environ 300 000 km/s. 340 m/s est la vitesse du son dans l’air.'),
  B('L’ombre portée d’un objet se forme…', 'sur l’écran, dans la zone que la lumière ne peut pas atteindre', ['sur la face éclairée de l’objet', 'dans la source de lumière', 'uniquement sous l’eau'], 'L’objet opaque bloque les rayons lumineux.', 'L’objet opaque arrête la lumière : derrière lui, sur l’écran, se forme l’ombre portée. Sur l’objet lui-même, la partie non éclairée est l’ombre propre.'),
  B('Les phases de la Lune s’expliquent par…', 'la partie éclairée de la Lune visible depuis la Terre, qui change', ['l’ombre de la Terre chaque nuit', 'la Lune qui s’allume et s’éteint', 'les nuages'], 'La moitié de la Lune tournée vers le Soleil est toujours éclairée.', 'La Lune tourne autour de la Terre : selon sa position, on voit une portion plus ou moins grande de sa face éclairée.'),
  B('Un objet opaque…', 'ne laisse pas passer la lumière', ['laisse passer toute la lumière', 'produit de la lumière', 'est toujours noir'], 'Pense à un carton ou à un mur.', 'Un objet opaque arrête la lumière ; un objet transparent la laisse passer ; un objet translucide la laisse passer partiellement.')
];

const physique5 = [
  fromBank(phys5Etats, 'Changements d’état'),
  fromBank(phys5Melanges, 'Mélanges et solutions'),
  fromBank(phys5Lumiere, 'La lumière'),
  // Conservation de la masse lors d'une dissolution
  () => {
    const e = rand(10, 50) * 10;
    const s = rand(2, 40);
    return inp(`On dissout ${s} g de sucre dans ${e} g d’eau. Quelle est la masse de l’eau sucrée obtenue (en g) ?`, e + s,
      'Lors d’une dissolution, le sucre « disparaît » à l’œil… mais sa matière, elle, disparaît-elle ?',
      `Lors d’une dissolution, la masse se conserve : masse de la solution = masse d’eau + masse de sucre = ${e} + ${s} = ${e + s} g.`, 'Mélanges et solutions');
  },
  // Conversions de volumes
  () => {
    const kind = pick(['L→mL', 'mL→L', 'cm³→mL', 'L→cm³']);
    let prompt;
    let ans;
    let exp;
    if (kind === 'L→mL') { const v = rand(1, 300) / 100; prompt = `Convertis ${fr(v)} L en mL.`; ans = fr(v * 1000); exp = `1 L = 1 000 mL, donc ${fr(v)} L = ${fr(v)} × 1 000 = ${fr(v * 1000)} mL.`; }
    else if (kind === 'mL→L') { const v = rand(5, 300) * 10; prompt = `Convertis ${v} mL en L.`; ans = fr(v / 1000, 3); exp = `1 L = 1 000 mL, donc ${v} mL = ${v} ÷ 1 000 = ${fr(v / 1000, 3)} L.`; }
    else if (kind === 'cm³→mL') { const v = rand(5, 900); prompt = `Convertis ${v} cm³ en mL.`; ans = v; exp = `1 cm³ = 1 mL, donc ${v} cm³ = ${v} mL.`; }
    else { const v = rand(1, 40) / 4; prompt = `Convertis ${fr(v)} L en cm³.`; ans = fr(v * 1000); exp = `1 L = 1 dm³ = 1 000 cm³, donc ${fr(v)} L = ${fr(v)} × 1 000 = ${fr(v * 1000)} cm³.`; }
    return inp(prompt, ans, 'Rappelle-toi : 1 L = 1 000 mL et 1 mL = 1 cm³.', exp, 'Volumes');
  },
  // Vitesse moyenne
  () => {
    const v = pick([4, 6, 15, 20, 30, 40, 60, 80, 90, 120]);
    const t = pick([0.5, 1, 1.5, 2, 3, 4]);
    const d = v * t;
    const askV = Math.random() < 0.5;
    return askV
      ? inp(`Un objet parcourt ${fr(d)} km en ${fr(t)} h. Quelle est sa vitesse moyenne en km/h ?`, v,
        'La vitesse moyenne se calcule avec la distance parcourue et la durée du trajet. Laquelle divise l’autre ?',
        `v = d ÷ t = ${fr(d)} ÷ ${fr(t)} = ${v} km/h.`, 'Mouvement et vitesse')
      : inp(`Un objet roule à la vitesse moyenne de ${v} km/h pendant ${fr(t)} h. Quelle distance parcourt-il (en km) ?`, fr(d),
        'Si tu connais la vitesse et la durée, la distance s’obtient par une multiplication.',
        `d = v × t = ${v} × ${fr(t)} = ${fr(d)} km.`, 'Mouvement et vitesse');
  },
  // Durée de propagation de la lumière
  () => {
    const n = rand(2, 500);
    const d = 300000 * n;
    return inp(`La lumière se propage à environ 300 000 km/s. Combien de secondes met-elle pour parcourir ${big(d)} km ?`, n,
      'Une durée se calcule en divisant la distance par la vitesse.',
      `t = d ÷ v = ${big(d)} ÷ 300 000 = ${n} s.`, 'La lumière');
  }
];

const physique5Cards = [
  { front: 'Palier de changement d’état', back: 'Pour un corps pur, la température reste constante pendant le changement d’état.', skill: 'Changements d’état' },
  { front: 'Températures repères de l’eau pure', back: 'Fusion/solidification : 0 °C ; ébullition : 100 °C (pression normale).', skill: 'Changements d’état' },
  { front: 'Conservation de la masse', back: 'Lors d’un changement d’état ou d’une dissolution, la masse totale se conserve.', skill: 'Changements d’état' },
  { front: 'Soluté, solvant, solution', back: 'Le soluté est dissous dans le solvant ; le mélange obtenu est la solution.', skill: 'Mélanges et solutions' },
  { front: 'Solubilité', back: 'Masse maximale de soluté que l’on peut dissoudre dans 1 L de solvant.', skill: 'Mélanges et solutions' },
  { front: 'Composition de l’air', back: 'Environ 78 % de diazote, 21 % de dioxygène, 1 % d’autres gaz.', skill: 'Mélanges et solutions' },
  { front: 'Propagation de la lumière', back: 'En ligne droite dans un milieu homogène et transparent ; environ 300 000 km/s dans le vide.', skill: 'La lumière' },
  { front: 'Source primaire / objet diffusant', back: 'Une source primaire produit sa lumière (Soleil, lampe) ; un objet diffusant renvoie la lumière reçue (Lune).', skill: 'La lumière' },
  { front: 'Vitesse moyenne', back: 'v = d ÷ t (distance ÷ durée) ; d = v × t ; t = d ÷ v.', skill: 'Mouvement et vitesse' },
  { front: '1 L = ? mL = ? cm³', back: '1 L = 1 000 mL = 1 000 cm³ = 1 dm³.', skill: 'Volumes' },
  { front: 'Molécules dans les trois états', back: 'Solide : serrées et ordonnées. Liquide : serrées et désordonnées. Gaz : éloignées et très agitées.', skill: 'Changements d’état' }
];

// =====================================================================
// 5ᵉ — TECHNOLOGIE & MODÉLISATION 3D
// =====================================================================

const tech5Objets = [
  B('Qu’est-ce qu’un cahier des charges ?', 'Le document qui liste les fonctions et contraintes que l’objet doit respecter', ['La notice de montage', 'Le ticket de caisse', 'Le dessin final en couleur'], 'Il est rédigé avant de concevoir l’objet.', 'Le cahier des charges décrit le besoin, les fonctions attendues et les contraintes (prix, taille, normes…).'),
  B('Le cycle de vie d’un objet comprend…', 'extraction des matières, fabrication, transport, utilisation, fin de vie', ['seulement son utilisation', 'seulement sa fabrication', 'sa couleur et son prix'], 'On suit l’objet « du berceau à la tombe ».', 'Le cycle de vie va de l’extraction des matières premières jusqu’au recyclage ou à l’élimination de l’objet.'),
  B('Une contrainte dans un cahier des charges, c’est par exemple…', 'le prix maximal de l’objet', ['le nom du concepteur', 'la date d’aujourd’hui', 'le magasin préféré'], 'C’est une limite imposée à la conception.', 'Une contrainte est une condition à respecter : coût, dimensions, masse, sécurité, environnement…'),
  B('Qu’appelle-t-on l’évolution d’un objet technique ?', 'Les changements de l’objet au fil du temps grâce aux progrès techniques et aux nouveaux besoins', ['Le fait qu’il se casse', 'Son déplacement dans un magasin', 'Sa couleur qui change au soleil'], 'Pense au téléphone fixe et au smartphone.', 'Les objets évoluent selon les besoins, les matériaux et les techniques disponibles (ex. : du téléphone à cadran au smartphone).'),
  B('Un croquis sert à…', 'représenter rapidement une idée de solution à main levée', ['fabriquer l’objet directement', 'calculer le prix', 'remplacer le cahier des charges'], 'Il se fait avec un crayon, sans règle.', 'Le croquis est un dessin rapide pour communiquer une idée ; le dessin technique et la modélisation 3D viennent ensuite.'),
  B('Pourquoi réalise-t-on un prototype ?', 'Pour tester une solution avant de la fabriquer en série', ['Pour le vendre immédiatement', 'Pour décorer la classe', 'Pour éviter le cahier des charges'], 'On vérifie que l’objet fonctionne vraiment.', 'Le prototype permet de tester et valider une solution technique, puis de l’améliorer avant la production.'),
  B('Qu’est-ce que l’écoconception ?', 'Concevoir un objet en réduisant son impact sur l’environnement tout au long de son cycle de vie', ['Concevoir un objet vert', 'Fabriquer uniquement en bois', 'Utiliser le moins cher possible'], 'Pense au recyclage, aux matériaux, à l’énergie.', 'L’écoconception cherche à limiter l’impact environnemental : matériaux recyclables, moins d’énergie, réparabilité…')
  ,B('La fonction technique d’un composant, c’est…', 'le rôle qu’il remplit dans l’objet', ['sa couleur', 'son prix', 'son poids uniquement'], 'Exemple : la pile d’une lampe torche.', 'Une fonction technique décrit ce que fait une partie de l’objet (ex. : la pile alimente en énergie).')
];

const tech5Materiaux = [
  B('À quelle famille appartient le bois ?', 'Les matériaux organiques', ['Les métaux', 'Les céramiques', 'Les matériaux composites'], 'Il provient d’un être vivant.', 'Le bois, le cuir, le coton sont des matériaux organiques, issus du vivant.'),
  B('Le verre appartient à la famille…', 'des céramiques (minéraux)', ['des métaux', 'des matières plastiques', 'des matériaux organiques'], 'Il est fabriqué à partir de sable.', 'Le verre est un matériau minéral (famille des céramiques), obtenu à partir de sable fondu.'),
  B('Quelle propriété fait qu’on choisit le cuivre pour les fils électriques ?', 'Il conduit bien l’électricité', ['Il est transparent', 'Il flotte', 'Il est magnétique'], 'Le courant doit circuler facilement.', 'Le cuivre est un excellent conducteur électrique, et il se déforme facilement pour faire des fils.'),
  B('Le PLA, souvent utilisé en impression 3D, est…', 'une matière plastique', ['un métal', 'une céramique', 'un tissu'], 'Il fond quand on le chauffe dans la buse de l’imprimante.', 'Le PLA est un plastique (souvent d’origine végétale) qui fond vers 200 °C.'),
  B('Un matériau composite est…', 'un assemblage de plusieurs matériaux aux propriétés complémentaires', ['un métal pur', 'un matériau recyclé', 'un matériau liquide'], 'Pense à la fibre de carbone noyée dans de la résine.', 'Un composite associe plusieurs matériaux (fibres + résine, béton armé) pour combiner leurs qualités.'),
  B('Quel matériau est attiré par un aimant ?', 'L’acier', ['L’aluminium', 'Le cuivre', 'Le plastique'], 'Il contient du fer.', 'L’acier contient du fer : il est attiré par un aimant. L’aluminium et le cuivre ne le sont pas.'),
  B('Pourquoi les casseroles ont-elles souvent un manche en plastique ou en bois ?', 'Parce que ce sont des isolants thermiques', ['Parce qu’ils sont plus lourds', 'Pour conduire la chaleur', 'Pour être magnétiques'], 'On doit pouvoir la tenir sans se brûler.', 'Le bois et le plastique conduisent mal la chaleur : ce sont des isolants thermiques, le manche reste froid.'),
  B('Quel matériau se recycle facilement et à l’infini ?', 'L’aluminium', ['Le plastique mélangé', 'Le papier gras', 'Le polystyrène sale'], 'C’est le matériau des canettes.', 'L’aluminium se recycle presque à l’infini sans perdre ses propriétés et en économisant beaucoup d’énergie.')
];

const tech5CAO = [
  B('Dans un logiciel de modélisation 3D, l’extrusion permet…', 'de donner une épaisseur à une esquisse 2D pour créer un volume', ['de colorier une pièce', 'd’imprimer un document', 'de supprimer une pièce'], 'On « tire » une forme plane vers le haut.', 'L’extrusion transforme une esquisse plane en volume en lui donnant une profondeur.'),
  B('Que signifie CAO ?', 'Conception assistée par ordinateur', ['Calcul automatique d’objets', 'Construction à outils', 'Code avancé ordinateur'], 'C’est l’utilisation de logiciels pour concevoir.', 'CAO = conception assistée par ordinateur : modéliser un objet en 3D avant de le fabriquer.'),
  B('Une esquisse en CAO est…', 'un dessin 2D qui sert de base à un volume', ['un objet imprimé', 'une photo de l’objet', 'un fichier son'], 'Elle se trace sur un plan.', 'L’esquisse est le dessin 2D (avec cotes et contraintes) à partir duquel on crée des volumes.'),
  B('Une imprimante 3D à dépôt de fil fabrique l’objet…', 'couche par couche', ['en un seul bloc moulé', 'en découpant un bloc de bois', 'en le pliant'], 'On parle de fabrication additive.', 'L’imprimante dépose du plastique fondu couche après couche : c’est la fabrication additive.'),
  B('Quel format de fichier est couramment utilisé pour envoyer un modèle 3D à l’impression ?', 'STL', ['MP3', 'DOCX', 'JPG'], 'Ce format décrit la surface de l’objet avec des triangles.', 'Le format STL décrit un objet 3D par des facettes triangulaires ; le trancheur le découpe ensuite en couches.'),
  B('Une cote sur un dessin technique indique…', 'une dimension de l’objet', ['sa couleur', 'son prix', 'son matériau uniquement'], 'Elle est souvent en millimètres.', 'Une cote donne une dimension (longueur, diamètre…), généralement en mm.'),
  B('Le logiciel « trancheur » sert à…', 'découper le modèle 3D en couches et préparer l’impression', ['dessiner le croquis', 'nettoyer l’imprimante', 'peindre l’objet'], 'Il prépare les instructions pour l’imprimante.', 'Le trancheur découpe le modèle en couches et génère les instructions de déplacement de la buse.'),
  B('Pourquoi ajoute-t-on parfois des supports lors d’une impression 3D ?', 'Pour soutenir les parties en surplomb', ['Pour décorer l’objet', 'Pour accélérer l’impression', 'Pour changer de couleur'], 'Le plastique ne peut pas être déposé dans le vide.', 'Les parties en porte-à-faux s’effondreraient : les supports les soutiennent pendant l’impression, puis on les retire.')
];

const tech5Prog = [
  B('Dans Scratch, le bloc « si … alors » est…', 'une condition', ['une boucle', 'une variable', 'un lutin'], 'L’action n’est exécutée que si quelque chose est vrai.', 'Le bloc « si … alors » teste une condition : les instructions ne s’exécutent que si elle est vraie.'),
  B('Une variable dans un programme sert à…', 'stocker une valeur qui peut changer', ['dessiner un lutin', 'répéter des instructions', 'arrêter le programme'], 'Pense à un score dans un jeu.', 'Une variable est une « boîte » nommée qui contient une valeur (score, vies…) modifiable pendant le programme.'),
  B('Un algorithme est…', 'une suite ordonnée d’instructions pour résoudre un problème', ['un ordinateur', 'un langage étranger', 'une image'], 'Une recette de cuisine en est un exemple.', 'Un algorithme décrit étape par étape comment résoudre un problème ; on le traduit ensuite en programme.'),
  B('Le bloc « répéter indéfiniment » est…', 'une boucle infinie', ['une condition', 'un capteur', 'une variable'], 'Il ne s’arrête jamais tout seul.', 'Ce bloc répète sans fin les instructions qu’il contient (jusqu’à l’arrêt du programme).'),
  B('Dans Scratch, un événement comme « quand le drapeau vert est cliqué »…', 'déclenche le début d’un script', ['termine le programme', 'crée une variable', 'supprime un lutin'], 'C’est souvent le premier bloc d’un script.', 'Les blocs d’événement lancent l’exécution d’un script quand l’événement se produit.'),
  B('Un bug dans un programme, c’est…', 'une erreur qui provoque un fonctionnement non prévu', ['un insecte dans l’ordinateur', 'un programme réussi', 'une sauvegarde'], 'Il faut alors « déboguer ».', 'Un bug est une erreur de programmation ; on teste et on corrige pour l’éliminer.'),
  B('Pour qu’un lutin dessine un carré, combien de fois faut-il répéter « avancer, tourner de 90° » ?', '4 fois', ['3 fois', '6 fois', '90 fois'], 'Combien un carré a-t-il de côtés ?', 'Un carré a 4 côtés et 4 angles droits : on répète 4 fois « avancer, tourner de 90° ».'),
  B('Pour dessiner un triangle équilatéral, de combien de degrés le lutin doit-il tourner à chaque sommet ?', '120°', ['60°', '90°', '180°'], 'Le lutin fait un tour complet (360°) en 3 virages.', 'Le lutin tourne de l’angle extérieur : 360° ÷ 3 = 120° (et non 60°, qui est l’angle intérieur).')
];

const techno5 = [
  fromBank(tech5Objets, 'Objets techniques et conception'),
  fromBank(tech5Materiaux, 'Matériaux'),
  fromBank(tech5CAO, 'Modélisation 3D'),
  fromBank(tech5Prog, 'Programmation'),
  // Échelle d'une maquette
  () => {
    const e = pick([10, 20, 25, 50, 100]);
    const m = rand(2, 40);
    const toReal = Math.random() < 0.5;
    return toReal
      ? inp(`Une maquette est réalisée à l’échelle 1/${e}. Une pièce mesure ${m} cm sur la maquette. Quelle est sa longueur réelle en cm ?`, m * e,
        `L’échelle 1/${e} signifie que les longueurs réelles sont ${e} fois plus grandes que sur la maquette.`,
        `Longueur réelle = longueur maquette × ${e} = ${m} × ${e} = ${m * e} cm.`, 'Représentation et échelle')
      : inp(`On veut réaliser une maquette à l’échelle 1/${e}. Un objet réel mesure ${m * e} cm. Quelle longueur doit-il avoir sur la maquette (en cm) ?`, m,
        `À l’échelle 1/${e}, la maquette est ${e} fois plus petite que la réalité.`,
        `Longueur sur la maquette = ${m * e} ÷ ${e} = ${m} cm.`, 'Représentation et échelle');
  },
  // Programme Scratch avec boucle
  () => {
    const s = rand(0, 10);
    const n = rand(3, 10);
    const k = rand(2, 9);
    const op = pick(['ajouter', 'multiplier']);
    if (op === 'multiplier') {
      const n2 = rand(2, 4);
      const k2 = pick([2, 3]);
      const s2 = rand(1, 5);
      const r = s2 * k2 ** n2;
      return inp(`Programme :\nmettre score à ${s2}\nrépéter ${n2} fois : mettre score à score × ${k2}\nQuelle est la valeur finale de score ?`, r,
        'Exécute le programme « à la main », tour de boucle après tour de boucle, en notant la valeur de score.',
        `Départ : ${s2}. À chaque tour, on multiplie par ${k2} : ${Array.from({ length: n2 + 1 }, (_, i) => s2 * k2 ** i).join(' → ')}.\nValeur finale : ${r}.`, 'Programmation');
    }
    return inp(`Programme :\nmettre score à ${s}\nrépéter ${n} fois : ajouter ${k} à score\nQuelle est la valeur finale de score ?`, s + n * k,
      'Combien de fois ajoute-t-on la même valeur ? Pense à une multiplication.',
      `On part de ${s} et on ajoute ${k} à chacun des ${n} tours : ${s} + ${n} × ${k} = ${s} + ${n * k} = ${s + n * k}.`, 'Programmation');
  },
  // Nombre de couches en impression 3D
  () => {
    const c = pick([0.1, 0.2, 0.25, 0.4]);
    const nb = rand(10, 400);
    const h = c * nb;
    return inp(`Une imprimante 3D dépose des couches de ${fr(c)} mm d’épaisseur. Combien de couches faut-il pour imprimer un objet de ${fr(h)} mm de haut ?`, nb,
      'La hauteur totale est la somme de toutes les couches, qui ont toutes la même épaisseur.',
      `Nombre de couches = hauteur ÷ épaisseur d’une couche = ${fr(h)} ÷ ${fr(c)} = ${nb} couches.`, 'Modélisation 3D');
  }
];

const techno5Cards = [
  { front: 'Besoin', back: 'Ce qui est nécessaire ou désiré par l’utilisateur ; l’objet technique y répond.', skill: 'Objets techniques et conception' },
  { front: 'Cahier des charges', back: 'Document listant les fonctions et contraintes qu’un objet doit respecter.', skill: 'Objets techniques et conception' },
  { front: 'Cycle de vie d’un objet', back: 'Extraction des matières premières → fabrication → transport → utilisation → fin de vie (recyclage).', skill: 'Objets techniques et conception' },
  { front: 'Familles de matériaux', back: 'Métaux, matières plastiques, matériaux organiques, céramiques (minéraux), composites.', skill: 'Matériaux' },
  { front: 'Isolant / conducteur thermique', back: 'Un isolant (bois, plastique) conduit mal la chaleur ; un conducteur (métal) la conduit bien.', skill: 'Matériaux' },
  { front: 'CAO', back: 'Conception assistée par ordinateur : modéliser un objet en 3D sur logiciel.', skill: 'Modélisation 3D' },
  { front: 'Extrusion', back: 'Opération de CAO qui donne une épaisseur à une esquisse 2D pour créer un volume.', skill: 'Modélisation 3D' },
  { front: 'Fabrication additive', back: 'Fabrication couche par couche (impression 3D).', skill: 'Modélisation 3D' },
  { front: 'Échelle 1/n', back: 'Les dimensions réelles sont n fois plus grandes que sur le plan ou la maquette.', skill: 'Représentation et échelle' },
  { front: 'Boucle', back: 'Structure qui répète un bloc d’instructions (répéter n fois, répéter indéfiniment).', skill: 'Programmation' },
  { front: 'Condition', back: 'Structure « si … alors … sinon » : exécute des instructions selon qu’un test est vrai ou faux.', skill: 'Programmation' },
  { front: 'Variable', back: 'Emplacement nommé qui mémorise une valeur pouvant changer (score, vies…).', skill: 'Programmation' }
];

// =====================================================================
// 4ᵉ — MATHÉMATIQUES
// =====================================================================

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29]];

const maths4 = [
  // Puissances de 10 : produit, quotient, puissance de puissance
  () => {
    const kind = pick(['×', '÷', '^']);
    let m = rand(-5, 8);
    let n = rand(-5, 8);
    let expr;
    let p;
    let exp;
    if (kind === '×') { p = m + n; expr = `${pow10(m)} × ${pow10(n)}`; exp = `Pour multiplier deux puissances de 10, on additionne les exposants : ${m} + ${par(n)} = ${p}.`; }
    else if (kind === '÷') { p = m - n; expr = `${pow10(m)} ÷ ${pow10(n)}`; exp = `Pour diviser deux puissances de 10, on soustrait les exposants : ${m} - ${par(n)} = ${p}.`; }
    else { m = rand(-3, 4) || 2; n = rand(2, 3); p = m * n; expr = `(${pow10(m)})${sup(n)}`; exp = `Pour élever une puissance à une puissance, on multiplie les exposants : ${m} × ${n} = ${p}.`; }
    return inp(`Écris ${expr} sous la forme 10ⁿ. Quelle est la valeur de l’exposant n ?`, p,
      'Revois les règles : 10ᵃ × 10ᵇ, 10ᵃ ÷ 10ᵇ et (10ᵃ)ᵇ. Attention aux exposants négatifs !',
      `${exp}\nDonc ${expr} = ${pow10(p)} : n = ${p}.`, 'Puissances');
  },
  // Calculer une puissance
  () => {
    let b;
    let e;
    do { b = pick([-3, -2, 2, 3, 4, 5, -5]); e = rand(0, 4); } while (Math.abs(b) ** e > 625);
    const r = b ** e;
    const dev = e === 0 ? `Par convention, tout nombre non nul à la puissance 0 vaut 1.` : `${b < 0 ? `(${b})` : b}${sup(e)} = ${Array(e).fill(par(b)).join(' × ')} = ${r}.`;
    return inp(`Calcule : ${b < 0 ? `(${b})` : b}${sup(e)}`, r,
      'aⁿ, c’est a multiplié par lui-même n fois. Pour un nombre négatif, compte les facteurs négatifs pour trouver le signe.',
      `${dev}${b < 0 && e > 0 ? `\nIl y a ${e} facteur${e > 1 ? 's' : ''} négatif${e > 1 ? 's' : ''} : le résultat est ${e % 2 ? 'négatif' : 'positif'}.` : ''}`, 'Puissances');
  },
  // Développer
  () => {
    if (Math.random() < 0.5) {
      const k = pick([-1, 1]) * rand(2, 9);
      const a = rand(1, 9);
      const b = pick([-1, 1]) * rand(1, 9);
      return q4({
        prompt: `Développe : ${k}(${lin(a, b)})`,
        answer: lin(k * a, k * b),
        wrong: [lin(k * a, b), lin(k * a, -k * b), lin(a, k * b)],
        hint: 'Distributivité simple : k(a + b) = k × a + k × b. Le facteur devant la parenthèse multiplie CHAQUE terme.',
        explanation: `${k}(${lin(a, b)}) = ${k} × ${a === 1 ? 'x' : `${a}x`} + ${k} × ${par(b)} = ${lin(k * a, k * b)}.`,
        skill: 'Calcul littéral'
      });
    }
    let a; let b; let c; let d;
    do { a = rand(1, 3); c = rand(1, 3); b = pick([-1, 1]) * rand(1, 9); d = pick([-1, 1]) * rand(1, 9); } while (a * d + b * c === 0);
    const f1 = lin(a, b);
    const f2 = lin(c, d);
    return q4({
      prompt: `Développe et réduis : (${f1})(${f2})`,
      answer: poly(a * c, a * d + b * c, b * d),
      wrong: [poly(a * c, 0, b * d), poly(a * c, a * d + b * c, -b * d), poly(a * c, -(a * d + b * c), b * d)],
      hint: 'Double distributivité : chaque terme de la première parenthèse multiplie chaque terme de la seconde (4 produits), puis on réduit.',
      explanation: `(${f1})(${f2}) = ${poly(a * c, 0, 0)} + ${a * d === 0 ? '0' : `${par(a * d)}x`} + ${par(b * c)}x + ${par(b * d)}\n= ${poly(a * c, a * d + b * c, b * d)} (on regroupe les termes en x : ${a * d} + ${par(b * c)} = ${a * d + b * c}).`,
      skill: 'Calcul littéral'
    });
  },
  // Résoudre une équation du premier degré
  () => {
    const x = rand(-10, 10);
    const a = pick([-1, 1]) * rand(2, 9);
    const b = pick([-1, 1]) * rand(1, 15);
    if (Math.random() < 0.5) {
      const c = a * x + b;
      return inp(`Résous l’équation : ${lin(a, b)} = ${c}\nx = ?`, x,
        'Isole x : élimine d’abord le terme constant en effectuant la même opération des deux côtés, puis divise par le coefficient de x.',
        `${lin(a, b)} = ${c}\nOn ${b > 0 ? `soustrait ${b}` : `ajoute ${-b}`} des deux côtés : ${a}x = ${c - b}.\nOn divise par ${a} : x = ${c - b} ÷ ${par(a)} = ${x}.\nVérification : ${a} × ${par(x)} + ${par(b)} = ${c}.`, 'Équations');
    }
    let d;
    do { d = rand(-5, 5); } while (d === a || d === 0);
    const e = a * x + b - d * x;
    return inp(`Résous l’équation : ${lin(a, b)} = ${lin(d, e)}\nx = ?`, x,
      'Regroupe les termes en x d’un côté et les nombres de l’autre, en faisant toujours la même opération des deux côtés.',
      `${lin(a, b)} = ${lin(d, e)}\nOn ${d >= 0 ? `soustrait ${d}x` : `ajoute ${-d}x`} des deux côtés : ${lin(a - d, b)} = ${e}.\nOn ${b > 0 ? `soustrait ${b}` : `ajoute ${-b}`} des deux côtés : ${a - d}x = ${e - b}.\nOn divise par ${a - d} : x = ${e - b} ÷ ${par(a - d)} = ${x}.`, 'Équations');
  },
  // Théorème de Pythagore
  () => {
    const [p, q, r] = pick(TRIPLES).map((v) => v * pick([1, 1, 2]));
    if (Math.random() < 0.5) {
      return inp(`ABC est un triangle rectangle en A avec AB = ${p} cm et AC = ${q} cm. Calcule BC (en cm).`, r,
        'Repère l’hypoténuse (le côté opposé à l’angle droit) puis écris l’égalité de Pythagore.',
        `Le triangle est rectangle en A, donc [BC] est l’hypoténuse.\nD’après le théorème de Pythagore : BC² = AB² + AC² = ${p}² + ${q}² = ${p * p} + ${q * q} = ${r * r}.\nBC = √${r * r} = ${r} cm.`, 'Théorème de Pythagore');
    }
    return inp(`ABC est un triangle rectangle en A avec BC = ${r} cm et AB = ${p} cm. Calcule AC (en cm).`, q,
      'L’hypoténuse est le plus long côté : écris l’égalité de Pythagore puis isole le carré cherché.',
      `[BC] est l’hypoténuse : BC² = AB² + AC², donc AC² = BC² - AB² = ${r * r} - ${p * p} = ${q * q}.\nAC = √${q * q} = ${q} cm.`, 'Théorème de Pythagore');
  },
  // Réciproque de Pythagore
  () => {
    let [p, q, r] = pick(TRIPLES);
    const rect = Math.random() < 0.5;
    if (!rect) r += pick([-1, 1]);
    const sides = shuffle(['AB', 'AC', 'BC']);
    const len = { [sides[0]]: p, [sides[1]]: q, [sides[2]]: r };
    const opp = { BC: 'A', AC: 'B', AB: 'C' };
    const answer = rect ? `Oui, rectangle en ${opp[sides[2]]}` : 'Non, il n’est pas rectangle';
    const all = ['Oui, rectangle en A', 'Oui, rectangle en B', 'Oui, rectangle en C', 'Non, il n’est pas rectangle'];
    return q4({
      prompt: `Dans le triangle ABC : AB = ${len.AB} cm, AC = ${len.AC} cm, BC = ${len.BC} cm.\nCe triangle est-il rectangle ?`,
      answer,
      wrong: all.filter((x) => x !== answer),
      hint: 'Repère le plus grand côté. Compare son carré à la somme des carrés des deux autres.',
      explanation: `Le plus grand côté est [${sides[2]}] : ${sides[2]}² = ${r * r}.\n${sides[0]}² + ${sides[1]}² = ${p * p} + ${q * q} = ${p * p + q * q}.\n${rect ? `Les deux résultats sont égaux : d’après la réciproque du théorème de Pythagore, le triangle est rectangle en ${opp[sides[2]]} (le sommet opposé au plus grand côté).` : `${r * r} ≠ ${p * p + q * q} : d’après la contraposée du théorème de Pythagore, le triangle n’est pas rectangle.`}`,
      skill: 'Théorème de Pythagore'
    });
  },
  // Multiplier des fractions
  () => {
    const b = rand(2, 9); const a = rand(1, b - 1); const c = rand(1, 9); const d = rand(2, 9);
    return inp(`Calcule et donne le résultat sous forme de fraction : ${a}/${b} × ${c}/${d}`, fracForms(a * c, b * d),
      'Pour multiplier deux fractions, on multiplie les numérateurs entre eux et les dénominateurs entre eux. Pense à simplifier.',
      `${a}/${b} × ${c}/${d} = (${a} × ${c})/(${b} × ${d}) = ${a * c}/${b * d}${simp(a * c, b * d) !== `${a * c}/${b * d}` ? ` = ${simp(a * c, b * d)} après simplification` : ''}.`, 'Fractions');
  },
  // Diviser des fractions
  () => {
    const b = rand(2, 9); const a = rand(1, b - 1); const c = rand(1, 9); const d = rand(2, 9);
    return inp(`Calcule et donne le résultat sous forme de fraction : ${a}/${b} ÷ ${c}/${d}`, fracForms(a * d, b * c),
      'Diviser par une fraction, c’est multiplier par son inverse.',
      `L’inverse de ${c}/${d} est ${d}/${c}.\n${a}/${b} ÷ ${c}/${d} = ${a}/${b} × ${d}/${c} = ${a * d}/${b * c}${simp(a * d, b * c) !== `${a * d}/${b * c}` ? ` = ${simp(a * d, b * c)} après simplification` : ''}.`, 'Fractions');
  },
  // Évolution en pourcentage
  () => {
    const P = 20 * rand(1, 30);
    const t = pick([5, 10, 15, 20, 25, 30, 40, 50]);
    const up = Math.random() < 0.5;
    const r = up ? P + (P * t) / 100 : P - (P * t) / 100;
    const what = up ? `Le prix d’un vélo de ${P} € augmente de ${t} %.` : `Un jeu vidéo coûte ${P} €. Il est soldé à -${t} %.`;
    return inp(`${what} Quel est le nouveau prix (en €) ?`, fr(r),
      `Calcule d’abord ${t} % du prix, puis ${up ? 'ajoute-le' : 'retire-le'} au prix de départ. (Tu peux aussi multiplier par ${up ? '1 + ' : '1 - '}${t}/100.)`,
      `${t} % de ${P} = ${t} × ${P} ÷ 100 = ${fr((P * t) / 100)} €.\nNouveau prix = ${P} ${up ? '+' : '-'} ${fr((P * t) / 100)} = ${fr(r)} €.\nAvec le coefficient : ${P} × ${fr(up ? 1 + t / 100 : 1 - t / 100)} = ${fr(r)} €.`, 'Pourcentages');
  },
  // Écriture scientifique
  () => {
    let mt;
    do { mt = rand(11, 99); } while (mt % 10 === 0);
    const p = rand(-4, 6);
    const value = mt * 10 ** (p - 1);
    const shown = p >= 1 ? big(Math.round(value)) : fr(value, 8);
    const m = fr(mt / 10);
    return q4({
      prompt: `Quelle est l’écriture scientifique de ${shown} ?`,
      answer: `${m} × ${pow10(p)}`,
      wrong: [`${mt} × ${pow10(p - 1)}`, `${m} × ${pow10(p + 1)}`, `${m} × ${pow10(-p === p ? p - 2 : -p)}`],
      hint: 'L’écriture scientifique est a × 10ⁿ avec 1 ≤ a < 10 : un seul chiffre non nul avant la virgule.',
      explanation: `On place la virgule après le premier chiffre non nul : a = ${m}.\nPour retrouver ${shown}, il faut décaler la virgule de ${Math.abs(p)} rang${Math.abs(p) > 1 ? 's' : ''} vers la ${p >= 0 ? 'droite' : 'gauche'} : n = ${p}.\n${shown} = ${m} × ${pow10(p)}.\n(${mt} × ${pow10(p - 1)} est égal mais n’est pas une écriture scientifique car ${mt} ≥ 10.)`,
      skill: 'Puissances'
    });
  },
  // Multiplier / diviser des relatifs
  () => {
    const a = pick([-1, 1]) * rand(2, 12);
    const b = pick([-1, 1]) * rand(2, 9);
    if (Math.random() < 0.5) {
      return inp(`Calcule : ${par(a)} × ${par(b)}`, a * b,
        'Multiplie les distances à zéro, puis applique la règle des signes.',
        `${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)}.\nRègle des signes : ${(a < 0) === (b < 0) ? 'deux signes identiques donnent un résultat positif' : 'deux signes contraires donnent un résultat négatif'}.\n${par(a)} × ${par(b)} = ${a * b}.`, 'Nombres relatifs');
    }
    return inp(`Calcule : ${par(a * b)} ÷ ${par(b)}`, a,
      'La règle des signes de la division est la même que celle de la multiplication.',
      `${Math.abs(a * b)} ÷ ${Math.abs(b)} = ${Math.abs(a)}.\nSignes : ${(a * b < 0) === (b < 0) ? 'identiques → positif' : 'contraires → négatif'}.\n${par(a * b)} ÷ ${par(b)} = ${a}.`, 'Nombres relatifs');
  },
  // Réduire une expression
  () => {
    const nz = () => pick([-1, 1]) * rand(1, 9);
    const a = nz(); const c = nz(); let b = nz(); let d = nz();
    if (a + c === 0) return maths4[2]();
    if (b + d === 0) d += 1;
    const expr = `${lin(a, b)}${c > 0 ? ' + ' : ' - '}${lin(Math.abs(c), 0)}${d > 0 ? ' + ' : ' - '}${Math.abs(d)}`;
    return q4({
      prompt: `Réduis l’expression : ${expr}`,
      answer: lin(a + c, b + d),
      wrong: [lin(a + b + c + d, 0), lin(a + c, -(b + d)), lin(a - c, b + d), lin(a * c, b + d), lin(b + d, a + c), lin(a + c, b * d)],
      hint: 'Regroupe les termes « en x » ensemble, puis les nombres ensemble. On ne peut pas additionner des x et des nombres seuls.',
      explanation: `Termes en x : ${lin(a, 0)} ${c > 0 ? '+' : '-'} ${lin(Math.abs(c), 0)} = ${lin(a + c, 0)}.\nNombres : ${b} ${d > 0 ? '+' : '-'} ${Math.abs(d)} = ${b + d}.\nExpression réduite : ${lin(a + c, b + d)}.`,
      skill: 'Calcul littéral'
    });
  }
];

const maths4Cards = [
  { front: 'Produit de puissances de même base', back: 'aᵐ × aⁿ = aᵐ⁺ⁿ', skill: 'Puissances' },
  { front: 'Quotient de puissances de 10', back: '10ᵐ ÷ 10ⁿ = 10ᵐ⁻ⁿ', skill: 'Puissances' },
  { front: 'Puissance de puissance', back: '(10ᵐ)ⁿ = 10ᵐˣⁿ', skill: 'Puissances' },
  { front: '10⁻ⁿ', back: '10⁻ⁿ = 1/10ⁿ = 0,0…01 (n zéros en comptant celui avant la virgule). Exemple : 10⁻³ = 0,001.', skill: 'Puissances' },
  { front: 'Écriture scientifique', back: 'a × 10ⁿ avec 1 ≤ a < 10 et n entier relatif.', skill: 'Puissances' },
  { front: 'Règle des signes (produit)', back: 'Deux signes identiques → positif ; deux signes contraires → négatif.', skill: 'Nombres relatifs' },
  { front: 'Distributivité simple', back: 'k(a + b) = ka + kb', skill: 'Calcul littéral' },
  { front: 'Double distributivité', back: '(a + b)(c + d) = ac + ad + bc + bd', skill: 'Calcul littéral' },
  { front: 'Théorème de Pythagore', back: 'Si ABC est rectangle en A, alors BC² = AB² + AC² ([BC] hypoténuse).', skill: 'Théorème de Pythagore' },
  { front: 'Réciproque de Pythagore', back: 'Si BC² = AB² + AC² ([BC] plus grand côté), alors ABC est rectangle en A.', skill: 'Théorème de Pythagore' },
  { front: 'Multiplier des fractions', back: 'a/b × c/d = (a × c)/(b × d)', skill: 'Fractions' },
  { front: 'Diviser par une fraction', back: 'Diviser par c/d revient à multiplier par son inverse d/c.', skill: 'Fractions' },
  { front: 'Augmenter / diminuer de t %', back: 'Augmenter : multiplier par 1 + t/100. Diminuer : multiplier par 1 - t/100.', skill: 'Pourcentages' },
  { front: 'Résoudre ax + b = c', back: 'On soustrait b des deux côtés, puis on divise par a : x = (c - b)/a.', skill: 'Équations' }
];

// =====================================================================
// 4ᵉ — SVT
// =====================================================================

const svt4Tecto = [
  B('La lithosphère est découpée en…', 'plaques lithosphériques mobiles', ['continents immobiles', 'océans figés', 'volcans indépendants'], 'Ces grands morceaux se déplacent de quelques cm par an.', 'La lithosphère (croûte + partie du manteau supérieur) est découpée en plaques qui se déplacent lentement.'),
  B('Où se produisent la plupart des séismes ?', 'Aux limites des plaques lithosphériques', ['Au centre des plaques', 'Uniquement dans les océans', 'Uniquement en Europe'], 'Pense à la répartition des séismes sur une carte du monde.', 'Les séismes se concentrent aux frontières des plaques, là où elles s’écartent, coulissent ou se rapprochent.'),
  B('Au niveau d’une dorsale océanique, les plaques…', 's’écartent', ['se rapprochent', 'ne bougent pas', 'disparaissent dans le manteau'], 'Du magma remonte et forme une nouvelle croûte océanique.', 'À la dorsale, les plaques divergent : du magma remonte et crée du nouveau plancher océanique.'),
  B('La subduction correspond à…', 'l’enfoncement d’une plaque océanique sous une autre plaque', ['la formation d’une dorsale', 'la fonte d’un glacier', 'l’érosion d’une montagne'], 'Une plaque « plonge » sous l’autre.', 'En zone de subduction, une plaque océanique dense plonge dans le manteau sous une autre plaque (ex. : Japon, Andes).'),
  B('Le foyer d’un séisme est…', 'le lieu en profondeur où les roches se rompent', ['le point en surface au-dessus du foyer', 'le sismographe', 'la zone épargnée'], 'L’épicentre, lui, est en surface.', 'Le foyer est le point de rupture en profondeur ; l’épicentre est le point de la surface situé juste au-dessus.'),
  B('Une éruption volcanique explosive est liée à…', 'un magma visqueux et riche en gaz', ['un magma très fluide', 'l’absence de magma', 'la pluie'], 'Les gaz ont du mal à s’échapper.', 'Un magma visqueux retient les gaz qui s’accumulent : la pression provoque des explosions (nuées ardentes).'),
  B('Quel instrument enregistre les ondes sismiques ?', 'Le sismomètre (sismographe)', ['Le baromètre', 'Le thermomètre', 'L’anémomètre'], 'Son nom contient le mot « séisme ».', 'Le sismomètre enregistre les vibrations du sol ; le tracé obtenu est un sismogramme.'),
  B('Quel comportement adopter en cas de séisme à l’intérieur d’un bâtiment ?', 'S’abriter sous un meuble solide, loin des vitres', ['Prendre l’ascenseur', 'Sortir sur le balcon', 'Rester près des fenêtres'], 'Le danger principal vient des chutes d’objets.', 'On s’abrite sous une table solide, loin des fenêtres ; on n’utilise jamais l’ascenseur.')
];

const svt4Repro = [
  B('Quelles cellules reproductrices produit l’homme ?', 'Les spermatozoïdes', ['Les ovules', 'Les globules rouges', 'Les neurones'], 'Elles sont fabriquées dans les testicules.', 'Les testicules produisent les spermatozoïdes en continu à partir de la puberté.'),
  B('Où se produit habituellement la fécondation chez la femme ?', 'Dans une trompe (oviducte)', ['Dans l’utérus', 'Dans l’ovaire', 'Dans le vagin'], 'C’est le conduit entre l’ovaire et l’utérus.', 'La rencontre ovule-spermatozoïde a lieu dans une trompe ; la cellule-œuf migre ensuite vers l’utérus pour s’y implanter.'),
  B('La puberté est déclenchée par…', 'des hormones', ['l’alimentation uniquement', 'le sport', 'la croissance des os seule'], 'Ce sont des messagers chimiques transportés par le sang.', 'Les hormones (produites par le cerveau et les organes reproducteurs) déclenchent les transformations de la puberté.'),
  B('Les règles correspondent…', 'à l’élimination de la muqueuse utérine en absence de fécondation', ['à l’ovulation', 'à la fécondation', 'à la production de spermatozoïdes'], 'Elles reviennent environ tous les 28 jours.', 'Sans nidation, la muqueuse de l’utérus se détache et s’élimine : ce sont les règles, qui marquent le début d’un nouveau cycle.'),
  B('L’ovulation a lieu en moyenne…', 'vers le 14ᵉ jour d’un cycle de 28 jours', ['le 1er jour du cycle', 'le 28ᵉ jour', 'chaque jour'], 'Elle se situe au milieu du cycle.', 'Dans un cycle de 28 jours, l’ovaire libère généralement un ovule vers le 14ᵉ jour.'),
  B('Le préservatif est le seul moyen de contraception qui…', 'protège aussi des infections sexuellement transmissibles', ['est pris par voie orale', 'agit sur les hormones', 'est posé par un médecin'], 'Il forme une barrière.', 'Le préservatif empêche le contact entre les spermatozoïdes et l’ovule, et protège des IST (dont le VIH).'),
  B('La cellule-œuf résulte…', 'de la fusion d’un ovule et d’un spermatozoïde', ['de la division d’un ovule seul', 'd’un spermatozoïde seul', 'd’une hormone'], 'C’est la première cellule d’un nouvel individu.', 'La fécondation réunit un ovule et un spermatozoïde : on obtient une cellule-œuf qui se divise pour former l’embryon.'),
  B('Quel organe assure les échanges entre la mère et le fœtus ?', 'Le placenta', ['Le cordon de l’ovaire', 'L’estomac', 'Le cœur de la mère'], 'Il est relié au fœtus par le cordon ombilical.', 'Le placenta permet le passage de dioxygène et de nutriments vers le fœtus, et l’évacuation de ses déchets.')
];

const svt4Nerveux = [
  B('Quel est le trajet d’un message nerveux lors d’un mouvement volontaire ?', 'Cerveau → moelle épinière → nerf moteur → muscle', ['Muscle → cerveau → nerf → œil', 'Œil → muscle → cerveau', 'Moelle épinière → cerveau → œil'], 'Le message part du centre de commande.', 'Le cerveau élabore la commande, transmise par la moelle épinière puis un nerf moteur jusqu’au muscle.'),
  B('Les cellules du système nerveux qui transmettent les messages s’appellent…', 'les neurones', ['les globules', 'les gamètes', 'les fibres musculaires'], 'Ils communiquent par des synapses.', 'Les neurones transmettent des messages nerveux électriques et communiquent entre eux au niveau des synapses.'),
  B('L’alcool au volant est dangereux car il…', 'augmente le temps de réaction', ['améliore les réflexes', 'diminue la distance de freinage', 'n’a aucun effet sur le cerveau'], 'Il perturbe le fonctionnement des neurones.', 'L’alcool ralentit la transmission des messages nerveux : le temps de réaction augmente, la distance d’arrêt aussi.'),
  B('Un organe des sens, comme l’oreille, contient…', 'des récepteurs sensoriels', ['des muscles uniquement', 'des globules rouges', 'des ovules'], 'Ils captent une stimulation de l’environnement.', 'Les récepteurs sensoriels captent une stimulation (son, lumière…) et la transforment en message nerveux.'),
  B('Quelle habitude favorise un bon fonctionnement du cerveau ?', 'Dormir suffisamment', ['Utiliser un écran tard le soir', 'Sauter le petit-déjeuner', 'Consommer des boissons énergisantes'], 'Le cerveau consolide les apprentissages la nuit.', 'Le sommeil permet au cerveau de récupérer et de mémoriser ; les écrans le soir retardent l’endormissement.'),
  B('Un son très fort et prolongé peut…', 'détruire des cellules ciliées de l’oreille de façon irréversible', ['renforcer l’audition', 'n’avoir aucun effet', 'améliorer la vue'], 'Ces cellules ne se renouvellent pas.', 'Au-delà d’environ 85 dB, l’exposition prolongée abîme les cellules ciliées de l’oreille interne, qui ne repoussent pas.'),
  B('Où se forme la sensation consciente (voir, entendre) ?', 'Dans le cerveau', ['Dans l’organe des sens', 'Dans le muscle', 'Dans le nerf'], 'L’œil capte, mais qui « voit » ?', 'Les messages nerveux sensoriels sont interprétés par des zones spécialisées du cerveau, où naît la sensation.'),
  B('Le message nerveux est de nature…', 'électrique', ['sonore', 'lumineuse', 'chimique uniquement dans le sang'], 'Il circule le long des fibres nerveuses.', 'Le long d’un neurone, le message nerveux est électrique ; il devient chimique au niveau des synapses.')
];

const svt4 = [
  fromBank(svt4Tecto, 'Tectonique et risques'),
  fromBank(svt4Repro, 'Reproduction et sexualité'),
  fromBank(svt4Nerveux, 'Système nerveux'),
  // Distance de l'épicentre
  () => {
    const v = pick([5, 6, 7, 8]);
    const t = rand(10, 120);
    return inp(`Les ondes P d’un séisme se propagent à ${v} km/s. Elles arrivent à une station ${t} s après le séisme. À quelle distance du foyer se trouve la station (en km) ?`, v * t,
      'Distance = vitesse × durée. Vérifie que les unités sont compatibles (km/s et s).',
      `d = v × t = ${v} × ${t} = ${v * t} km.`, 'Tectonique et risques');
  },
  // Expansion océanique
  () => {
    const r = pick([2, 3, 4, 5, 8, 10]);
    const N = rand(1, 50);
    return inp(`Deux plaques s’écartent de ${r} cm par an. De combien de kilomètres se sont-elles écartées en ${N} million${N > 1 ? 's' : ''} d’années ?`, r * N * 10,
      'Calcule d’abord la distance en cm (1 million = 1 000 000), puis convertis : 1 km = 100 000 cm.',
      `Distance = ${r} × ${big(N * 1000000)} = ${big(r * N * 1000000)} cm.\nConversion : ${big(r * N * 1000000)} ÷ 100 000 = ${r * N * 10} km.`, 'Tectonique et risques');
  },
  // Distance parcourue pendant le temps de réaction
  () => {
    const [kmh, ms] = pick([[36, 10], [54, 15], [72, 20], [90, 25], [108, 30], [126, 35]]);
    const t = pick([0.5, 1, 1.5, 2]);
    return inp(`Une voiture roule à ${kmh} km/h, soit ${ms} m/s. Le temps de réaction du conducteur est de ${fr(t)} s. Quelle distance (en m) parcourt la voiture avant que le conducteur commence à freiner ?`, fr(ms * t),
      'Pendant le temps de réaction, la voiture continue à la même vitesse. Utilise la vitesse en m/s.',
      `d = v × t = ${ms} × ${fr(t)} = ${fr(ms * t)} m.\nUn temps de réaction plus long (fatigue, alcool, téléphone) augmente cette distance.`, 'Système nerveux');
  },
  // Durée d'un cycle / date d'ovulation
  () => {
    const L = rand(26, 34);
    return inp(`Chez une femme, l’ovulation a lieu environ 14 jours avant le début des règles suivantes. Si son cycle dure ${L} jours, vers quel jour du cycle l’ovulation a-t-elle lieu ?`, L - 14,
      'Le jour 1 du cycle est le premier jour des règles ; compte à rebours depuis la fin du cycle.',
      `L’ovulation a lieu environ 14 jours avant la fin du cycle : ${L} - 14 = ${L - 14}.\nElle a donc lieu vers le ${L - 14}ᵉ jour.`, 'Reproduction et sexualité');
  }
];

const svt4Cards = [
  { front: 'Plaques lithosphériques', back: 'Morceaux rigides de la lithosphère qui se déplacent de quelques cm par an.', skill: 'Tectonique et risques' },
  { front: 'Dorsale océanique', back: 'Zone où deux plaques s’écartent et où se forme du nouveau plancher océanique.', skill: 'Tectonique et risques' },
  { front: 'Subduction', back: 'Enfoncement d’une plaque océanique sous une autre plaque.', skill: 'Tectonique et risques' },
  { front: 'Foyer et épicentre', back: 'Foyer : point de rupture en profondeur. Épicentre : point de la surface situé à la verticale du foyer.', skill: 'Tectonique et risques' },
  { front: 'Risque = aléa × enjeux', back: 'Le risque dépend du phénomène naturel (aléa) et de la présence d’humains et de biens (enjeux).', skill: 'Tectonique et risques' },
  { front: 'Gamètes', back: 'Cellules reproductrices : spermatozoïdes (homme) et ovules (femme).', skill: 'Reproduction et sexualité' },
  { front: 'Fécondation', back: 'Fusion d’un ovule et d’un spermatozoïde, formant une cellule-œuf (dans une trompe).', skill: 'Reproduction et sexualité' },
  { front: 'Puberté', back: 'Période de transformations du corps, déclenchée par des hormones, qui rend l’individu capable de se reproduire.', skill: 'Reproduction et sexualité' },
  { front: 'Cycle menstruel', back: 'Environ 28 jours ; ovulation vers le 14ᵉ jour ; règles si absence de fécondation.', skill: 'Reproduction et sexualité' },
  { front: 'Neurone', back: 'Cellule nerveuse qui transmet un message électrique ; communique par des synapses.', skill: 'Système nerveux' },
  { front: 'Trajet du message nerveux (réflexe)', back: 'Récepteur → nerf sensitif → centre nerveux (moelle épinière) → nerf moteur → muscle.', skill: 'Système nerveux' },
  { front: 'Perturbateurs du système nerveux', back: 'Alcool, drogues, manque de sommeil, bruit excessif : ils altèrent les messages nerveux.', skill: 'Système nerveux' }
];

// =====================================================================
// 4ᵉ — PHYSIQUE-CHIMIE
// =====================================================================

const phys4Chimie = [
  B('Un atome est constitué…', 'd’un noyau et d’électrons qui tournent autour', ['uniquement d’électrons', 'de molécules', 'de cellules'], 'Il y a une partie centrale et un nuage autour.', 'L’atome contient un noyau central (chargé positivement) et des électrons (chargés négativement) autour.'),
  B('La formule chimique de l’eau est…', 'H₂O', ['HO₂', 'CO₂', 'O₂'], 'Deux atomes d’un élément, un atome d’un autre.', 'Une molécule d’eau contient 2 atomes d’hydrogène et 1 atome d’oxygène : H₂O.'),
  B('Combien d’atomes contient la molécule de dioxyde de carbone CO₂ ?', '3', ['2', '1', '4'], 'Lis les indices : un C, et combien de O ?', 'CO₂ = 1 atome de carbone + 2 atomes d’oxygène = 3 atomes.'),
  B('Lors d’une transformation chimique, ce qui se conserve, c’est…', 'les atomes (et donc la masse totale)', ['les molécules', 'le volume', 'la couleur'], 'Les atomes se réarrangent, mais ne disparaissent pas.', 'Les atomes des réactifs se réorganisent pour former les produits : ils sont conservés, la masse totale aussi.'),
  B('La combustion du carbone dans le dioxygène produit…', 'du dioxyde de carbone', ['de l’eau', 'du dioxygène', 'de l’hydrogène'], 'On le détecte en troublant l’eau de chaux.', 'C + O₂ → CO₂. Le dioxyde de carbone trouble l’eau de chaux.'),
  B('Quel test permet de mettre en évidence le dioxyde de carbone ?', 'L’eau de chaux qui se trouble', ['Le sulfate de cuivre anhydre qui bleuit', 'Une allumette qui détone', 'Un aimant'], 'C’est un liquide limpide qui devient blanc laiteux.', 'Le CO₂ trouble l’eau de chaux. Le sulfate de cuivre anhydre, lui, détecte l’eau.'),
  B('Dans une combustion, le dioxygène est…', 'le comburant', ['le combustible', 'le produit', 'le catalyseur'], 'Le triangle du feu : combustible, comburant, chaleur.', 'Le combustible brûle (bois, gaz), le comburant (dioxygène) permet la combustion, une source de chaleur la déclenche.'),
  B('Une molécule de méthane CH₄ contient…', '1 atome de carbone et 4 atomes d’hydrogène', ['4 atomes de carbone et 1 d’hydrogène', '1 atome de carbone et 1 d’hydrogène', '5 atomes de carbone'], 'L’indice s’applique à l’atome qui le précède.', 'CH₄ : C (1 carbone) et H₄ (4 hydrogènes), soit 5 atomes au total.')
];

const phys4Elec = [
  B('Comment branche-t-on un voltmètre ?', 'En dérivation aux bornes du dipôle', ['En série dans le circuit', 'À la place du générateur', 'Il ne se branche jamais'], 'Il mesure une différence entre deux points.', 'Le voltmètre se branche en dérivation, entre les bornes du dipôle dont on veut la tension.'),
  B('Comment branche-t-on un ampèremètre ?', 'En série dans le circuit', ['En dérivation aux bornes d’une lampe', 'Directement aux bornes de la pile', 'À l’extérieur du circuit'], 'Le courant doit le traverser.', 'L’ampèremètre se branche en série : tout le courant de la branche doit le traverser.'),
  B('L’unité de l’intensité du courant est…', 'l’ampère (A)', ['le volt (V)', 'l’ohm (Ω)', 'le watt (W)'], 'Le nom de l’appareil de mesure t’aide.', 'L’intensité se mesure en ampères (A) avec un ampèremètre.'),
  B('Dans un circuit en série, l’intensité du courant…', 'est la même en tout point', ['est plus grande près de la pile', 'diminue après chaque lampe', 'est nulle'], 'Il n’y a qu’un seul chemin pour le courant.', 'Loi d’unicité de l’intensité : dans un circuit en série, l’intensité est la même partout.'),
  B('Dans un circuit en dérivation, la tension aux bornes de chaque branche…', 'est la même', ['s’additionne', 'est nulle', 'dépend de la longueur des fils'], 'Toutes les branches sont reliées aux mêmes deux points.', 'Loi d’unicité des tensions en dérivation : chaque branche a la même tension à ses bornes.'),
  B('Une résistance électrique…', 's’oppose au passage du courant', ['produit du courant', 'stocke de l’eau', 'augmente toujours l’intensité'], 'Plus elle est grande, moins le courant passe.', 'Une résistance limite l’intensité du courant ; elle se mesure en ohms (Ω).'),
  B('Pourquoi un court-circuit est-il dangereux ?', 'Le courant devient très intense et peut provoquer un échauffement ou un incendie', ['Parce que les lampes brillent trop peu', 'Parce que le courant s’arrête', 'Il n’est jamais dangereux'], 'Le courant passe par un chemin sans résistance.', 'En court-circuit, l’intensité devient très grande : les fils chauffent fortement, d’où le rôle des fusibles et disjoncteurs.'),
  B('La loi d’Ohm s’écrit…', 'U = R × I', ['U = R + I', 'I = R × U', 'R = U × I'], 'La tension est proportionnelle à l’intensité.', 'Pour une résistance : U (en V) = R (en Ω) × I (en A).')
];

const physique4 = [
  fromBank(phys4Chimie, 'Atomes et transformations chimiques'),
  fromBank(phys4Elec, 'Électricité'),
  // Loi d'Ohm
  () => {
    const R = pick([10, 20, 47, 50, 100, 150, 200, 220, 330, 470, 1000]);
    const I = pick([0.01, 0.02, 0.05, 0.1, 0.2, 0.5]);
    const U = R * I;
    const ask = pick(['U', 'I', 'R']);
    if (ask === 'U') {
      return inp(`Une résistance R = ${R} Ω est traversée par un courant d’intensité I = ${fr(I)} A. Calcule la tension U à ses bornes (en V).`, fr(U, 3),
        'Utilise la loi d’Ohm, avec R en ohms et I en ampères.', `Loi d’Ohm : U = R × I = ${R} × ${fr(I)} = ${fr(U, 3)} V.`, 'Loi d’Ohm');
    }
    if (ask === 'I') {
      return inp(`La tension aux bornes d’une résistance de ${R} Ω vaut ${fr(U, 3)} V. Calcule l’intensité I du courant (en A).`, fr(I, 3),
        'Pars de la loi d’Ohm U = R × I et isole I.', `U = R × I, donc I = U ÷ R = ${fr(U, 3)} ÷ ${R} = ${fr(I, 3)} A.`, 'Loi d’Ohm');
    }
    return inp(`Un dipôle ohmique a une tension de ${fr(U, 3)} V à ses bornes et il est traversé par ${fr(I)} A. Calcule sa résistance R (en Ω).`, R,
      'Pars de la loi d’Ohm U = R × I et isole R.', `U = R × I, donc R = U ÷ I = ${fr(U, 3)} ÷ ${fr(I)} = ${R} Ω.`, 'Loi d’Ohm');
  },
  // Masse volumique
  () => {
    const [nom, rho, de] = pick([['l’eau', 1, 'd’eau'], ['l’aluminium', 2.7, 'd’aluminium'], ['le fer', 7.9, 'de fer'], ['le cuivre', 8.9, 'de cuivre'], ['l’huile', 0.92, 'd’huile'], ['l’éthanol', 0.79, 'd’éthanol'], ['l’or', 19.3, 'd’or']]);
    const V = rand(2, 50);
    const m = Math.round(rho * V * 100) / 100;
    if (Math.random() < 0.5) {
      return inp(`Un échantillon ${de} a une masse de ${fr(m)} g pour un volume de ${V} cm³. Calcule sa masse volumique (en g/cm³).`, fr(rho),
        'La masse volumique, c’est la masse d’une unité de volume : quelle opération faire entre m et V ?',
        `ρ = m ÷ V = ${fr(m)} ÷ ${V} = ${fr(rho)} g/cm³.`, 'Masse volumique');
    }
    return inp(`La masse volumique de ${nom} vaut ${fr(rho)} g/cm³. Quelle est la masse (en g) de ${V} cm³ ${de} ?`, fr(m),
      'Si ρ = m ÷ V, alors m = … ?', `m = ρ × V = ${fr(rho)} × ${V} = ${fr(m)} g.`, 'Masse volumique');
  },
  // Conversion km/h <-> m/s
  () => {
    const ms = pick([5, 10, 15, 20, 25, 30, 35, 40]);
    const kmh = ms * 3.6;
    if (Math.random() < 0.5) {
      return inp(`Convertis ${fr(kmh)} km/h en m/s.`, ms,
        '1 km = 1 000 m et 1 h = 3 600 s. Pour passer de km/h à m/s, on divise par un nombre bien connu.',
        `${fr(kmh)} km/h = ${fr(kmh)} × 1 000 m ÷ 3 600 s = ${fr(kmh)} ÷ 3,6 = ${ms} m/s.`, 'Mouvement et vitesse');
    }
    return inp(`Convertis ${ms} m/s en km/h.`, fr(kmh),
      'En 1 heure, il y a 3 600 secondes, et 1 000 m = 1 km.',
      `${ms} m/s = ${ms} × 3 600 m en 1 h = ${ms * 3600} m/h = ${fr(kmh)} km/h (on multiplie par 3,6).`, 'Mouvement et vitesse');
  },
  // Additivité des tensions (série)
  () => {
    const U1 = rand(5, 60);
    const U2 = rand(5, 60);
    const UG = U1 + U2;
    return inp(`Un générateur délivre ${fr(UG / 10)} V à deux lampes montées en série. La tension aux bornes de la première lampe est ${fr(U1 / 10)} V. Quelle est la tension aux bornes de la seconde (en V) ?`, fr(U2 / 10),
      'Dans un circuit en série, comment la tension du générateur se répartit-elle entre les dipôles ?',
      `Loi d’additivité des tensions en série : U_G = U₁ + U₂.\nDonc U₂ = U_G - U₁ = ${fr(UG / 10)} - ${fr(U1 / 10)} = ${fr(U2 / 10)} V.`, 'Électricité');
  },
  // Loi des nœuds (dérivation)
  () => {
    const I1 = rand(5, 40) * 10;
    const I2 = rand(5, 40) * 10;
    return inp(`Deux lampes sont montées en dérivation. Le générateur débite ${I1 + I2} mA et la première branche est traversée par ${I1} mA. Quelle est l’intensité dans la seconde branche (en mA) ?`, I2,
      'En dérivation, le courant principal se partage entre les branches.',
      `Loi d’additivité des intensités (loi des nœuds) : I = I₁ + I₂.\nI₂ = I - I₁ = ${I1 + I2} - ${I1} = ${I2} mA.`, 'Électricité');
  },
  // Distance d'un orage
  () => {
    const t = rand(2, 15);
    return inp(`Tu vois un éclair, puis tu entends le tonnerre ${t} s plus tard. Le son se propage dans l’air à 340 m/s. À quelle distance (en m) se trouve l’orage ?`, 340 * t,
      'La lumière arrive presque instantanément. C’est le son qui met du temps : distance = vitesse × durée.',
      `d = v × t = 340 × ${t} = ${340 * t} m (environ ${fr((340 * t) / 1000, 1)} km).`, 'Signaux : son et lumière');
  }
];

const physique4Cards = [
  { front: 'Atome', back: 'Noyau central chargé positivement + électrons chargés négativement ; électriquement neutre.', skill: 'Atomes et transformations chimiques' },
  { front: 'Molécule', back: 'Assemblage d’atomes liés ; décrite par une formule chimique (H₂O, CO₂, O₂…).', skill: 'Atomes et transformations chimiques' },
  { front: 'Conservation lors d’une réaction chimique', back: 'Les atomes et la masse totale se conservent ; les molécules changent.', skill: 'Atomes et transformations chimiques' },
  { front: 'Test du dioxyde de carbone', back: 'Il trouble l’eau de chaux.', skill: 'Atomes et transformations chimiques' },
  { front: 'Loi d’Ohm', back: 'U = R × I (U en V, R en Ω, I en A).', skill: 'Loi d’Ohm' },
  { front: 'Lois du circuit série', back: 'Intensité identique partout ; les tensions s’additionnent : U_G = U₁ + U₂.', skill: 'Électricité' },
  { front: 'Lois du circuit en dérivation', back: 'Tension identique aux bornes de chaque branche ; les intensités s’additionnent : I = I₁ + I₂.', skill: 'Électricité' },
  { front: 'Branchement des appareils de mesure', back: 'Ampèremètre en série ; voltmètre en dérivation.', skill: 'Électricité' },
  { front: 'Masse volumique', back: 'ρ = m ÷ V (en g/cm³ ou kg/m³). Eau : 1 g/cm³ = 1 kg/L.', skill: 'Masse volumique' },
  { front: 'Conversion km/h ↔ m/s', back: 'km/h ÷ 3,6 = m/s ; m/s × 3,6 = km/h.', skill: 'Mouvement et vitesse' },
  { front: 'Vitesse du son / de la lumière', back: 'Son dans l’air : environ 340 m/s. Lumière dans le vide : environ 300 000 km/s.', skill: 'Signaux : son et lumière' },
  { front: 'Triangle du feu', back: 'Combustible + comburant (dioxygène) + source de chaleur.', skill: 'Atomes et transformations chimiques' }
];

// =====================================================================
// 4ᵉ — TECHNOLOGIE
// =====================================================================

const tech4Chaine = [
  B('Dans la chaîne d’information, quel élément « acquiert » l’information ?', 'Un capteur', ['Un actionneur', 'Une batterie', 'Un moteur'], 'Il mesure une grandeur physique (lumière, température…).', 'Le capteur acquiert l’information (ex. : capteur de luminosité) ; le microcontrôleur la traite ; on la communique ensuite.'),
  B('Quel composant est un actionneur ?', 'Un moteur', ['Un bouton poussoir', 'Un capteur de température', 'Un détecteur de mouvement'], 'Il agit sur la matière ou produit un mouvement.', 'Un actionneur transforme l’énergie pour agir : moteur, vérin, résistance chauffante, LED…'),
  B('Le microcontrôleur d’une carte programmable sert à…', 'traiter les informations selon le programme', ['stocker de l’énergie', 'capter la lumière', 'produire un mouvement'], 'C’est le « cerveau » du système.', 'Le microcontrôleur exécute le programme : il traite les informations venant des capteurs et commande les actionneurs.'),
  B('Dans la chaîne d’énergie, quelle fonction assure une batterie ?', 'Alimenter / stocker l’énergie', ['Transmettre le mouvement', 'Acquérir une information', 'Communiquer'], 'Elle fournit l’énergie au système.', 'La batterie stocke l’énergie et alimente le système : c’est la fonction « alimenter ».'),
  B('Un capteur « tout ou rien » (logique) donne…', 'deux états seulement : 0 ou 1', ['une valeur entre 0 et 1023', 'une image', 'un son'], 'Pense à un interrupteur de fin de course.', 'Un capteur logique ne connaît que deux états (vrai/faux, 0/1). Un capteur analogique donne une plage de valeurs.'),
  B('Dans un portail automatique, la cellule photoélectrique qui détecte un obstacle est…', 'un capteur', ['un actionneur', 'une source d’énergie', 'un transmetteur mécanique'], 'Elle « perçoit » ce qui se passe.', 'La cellule photoélectrique détecte un obstacle : elle acquiert une information, c’est un capteur.'),
  B('Un engrenage dans la chaîne d’énergie sert à…', 'transmettre et adapter le mouvement', ['acquérir une information', 'stocker l’énergie', 'afficher un message'], 'Il relie le moteur à la partie qui bouge.', 'Les engrenages transmettent le mouvement de rotation et peuvent modifier la vitesse et le couple.'),
  B('Une LED dans un système automatisé est utilisée pour…', 'communiquer une information à l’utilisateur (signal lumineux)', ['mesurer la température', 'stocker l’énergie', 'transmettre un mouvement'], 'Pense à un voyant qui s’allume.', 'Une LED de signalisation communique une information (état, alerte) à l’utilisateur.')
];

const tech4Reseau = [
  B('Une adresse IP sert à…', 'identifier un appareil sur un réseau', ['mesurer la vitesse du Wi-Fi', 'protéger contre les virus', 'nommer un fichier'], 'C’est comme une adresse postale pour les ordinateurs.', 'L’adresse IP identifie chaque appareil sur un réseau pour que les données arrivent au bon endroit.'),
  B('Quel appareil relie un réseau local à Internet ?', 'Le routeur (la box)', ['Le clavier', 'L’imprimante', 'La souris'], 'À la maison, c’est la box du fournisseur d’accès.', 'Le routeur fait passer les données entre le réseau local et Internet ; la box internet en contient un.'),
  B('Un serveur est…', 'un ordinateur qui fournit des services ou des données à d’autres ordinateurs', ['un câble réseau', 'un logiciel de dessin', 'une clé USB'], 'Il « sert » des pages web, des fichiers…', 'Un serveur répond aux demandes des clients (navigateurs, applications) en leur envoyant des données.'),
  B('Que signifie « HTTPS » au début d’une adresse web ?', 'La connexion au site est chiffrée', ['Le site est gratuit', 'Le site est forcément fiable', 'Le site est hébergé en France'], 'Le « S » signifie « secure ».', 'HTTPS chiffre les échanges entre ton navigateur et le serveur ; cela ne garantit pas que le contenu est fiable.'),
  B('Les données circulent sur Internet sous forme de…', 'paquets', ['lettres papier', 'ondes sonores', 'fichiers entiers impossibles à découper'], 'Les fichiers sont découpés pour voyager.', 'Les données sont découpées en paquets qui peuvent emprunter des chemins différents puis sont réassemblés.'),
  B('Le Wi-Fi transmet les données…', 'par ondes radio', ['par câble de cuivre', 'par fibre optique', 'par courrier'], 'Il n’y a pas de fil entre l’appareil et la box.', 'Le Wi-Fi utilise des ondes radio ; la fibre optique transporte de la lumière ; l’Ethernet utilise des câbles.'),
  B('Un nom de domaine (comme education.gouv.fr) est traduit en adresse IP par…', 'le DNS', ['le clavier', 'le pare-feu', 'l’imprimante'], 'C’est l’« annuaire » d’Internet.', 'Le DNS (système de noms de domaine) associe les noms faciles à retenir aux adresses IP.'),
  B('Un octet est composé de…', '8 bits', ['2 bits', '10 bits', '1 000 bits'], 'Un bit vaut 0 ou 1.', '1 octet = 8 bits. Avec 8 bits, on peut coder 2⁸ = 256 valeurs différentes.')
];

const techno4 = [
  fromBank(tech4Chaine, 'Chaînes d’information et d’énergie'),
  fromBank(tech4Reseau, 'Réseaux et données'),
  fromBank(tech5Prog, 'Programmation'),
  // Binaire -> décimal
  () => {
    const n = rand(1, 255);
    const bits = n.toString(2);
    const detail = bits.split('').map((b, i) => (b === '1' ? 2 ** (bits.length - 1 - i) : null)).filter((x) => x !== null);
    return inp(`Convertis le nombre binaire ${bits} en écriture décimale.`, n,
      'Chaque rang en binaire vaut une puissance de 2 : 1, 2, 4, 8, 16, 32… en partant de la droite. Additionne les valeurs des rangs où il y a un 1.',
      `Valeurs des rangs contenant un 1 : ${detail.join(' + ')} = ${n}.\nDonc ${bits} (binaire) = ${n} (décimal).`, 'Réseaux et données');
  },
  // Temps de téléchargement
  () => {
    const D = pick([8, 16, 24, 40, 80, 160]);
    const t = rand(2, 60);
    const size = (D / 8) * t;
    return inp(`Une connexion a un débit de ${D} Mbit/s. Combien de secondes faut-il pour télécharger un fichier de ${size} Mo ? (1 octet = 8 bits)`, t,
      'Convertis d’abord le débit en Mo/s (méga-octets par seconde), puis divise la taille du fichier par ce débit.',
      `Débit : ${D} Mbit/s ÷ 8 = ${D / 8} Mo/s.\nDurée = taille ÷ débit = ${size} ÷ ${D / 8} = ${t} s.`, 'Réseaux et données');
  },
  // Rapport de transmission d'engrenages
  () => {
    const [Z1, Z2] = pick([[10, 20], [10, 40], [12, 36], [15, 45], [20, 60], [40, 10], [30, 10], [24, 12], [20, 50], [16, 48]]);
    const g = gcd(Z1, Z2);
    const unit = Z2 / g;
    const m = 10 * rand(Math.max(1, Math.ceil(10 / unit)), Math.max(2, Math.floor(300 / unit)));
    const N1 = unit * m;
    const N2 = (Z1 / g) * m;
    return inp(`Un moteur tourne à ${N1} tr/min. Son pignon a ${Z1} dents et entraîne une roue de ${Z2} dents. À quelle vitesse tourne la roue (en tr/min) ?`, N2,
      'Rapport de transmission : vitesse de sortie = vitesse d’entrée × (dents de la roue menante ÷ dents de la roue menée).',
      `r = Z menante ÷ Z menée = ${Z1} ÷ ${Z2} = ${fr(Z1 / Z2, 3)}.\nN sortie = ${N1} × ${Z1} ÷ ${Z2} = ${N2} tr/min.\n${Z2 > Z1 ? 'La roue menée a plus de dents : elle tourne moins vite.' : 'La roue menée a moins de dents : elle tourne plus vite.'}`, 'Chaînes d’information et d’énergie');
  }
];

const techno4Cards = [
  { front: 'Chaîne d’information', back: 'Acquérir (capteur) → traiter (microcontrôleur) → communiquer.', skill: 'Chaînes d’information et d’énergie' },
  { front: 'Chaîne d’énergie', back: 'Alimenter → distribuer → convertir (actionneur) → transmettre.', skill: 'Chaînes d’information et d’énergie' },
  { front: 'Capteur', back: 'Composant qui mesure une grandeur physique et la transforme en information.', skill: 'Chaînes d’information et d’énergie' },
  { front: 'Actionneur', back: 'Composant qui convertit l’énergie pour agir : moteur, vérin, LED, haut-parleur.', skill: 'Chaînes d’information et d’énergie' },
  { front: 'Rapport de transmission (engrenages)', back: 'N sortie = N entrée × Z menante ÷ Z menée.', skill: 'Chaînes d’information et d’énergie' },
  { front: 'Adresse IP', back: 'Numéro qui identifie un appareil sur un réseau (ex. 192.168.1.12).', skill: 'Réseaux et données' },
  { front: 'Routeur', back: 'Appareil qui achemine les paquets entre réseaux (réseau local ↔ Internet).', skill: 'Réseaux et données' },
  { front: 'DNS', back: 'Annuaire d’Internet : traduit un nom de domaine en adresse IP.', skill: 'Réseaux et données' },
  { front: 'Bit et octet', back: 'Bit : 0 ou 1. Octet : 8 bits (256 valeurs possibles).', skill: 'Réseaux et données' },
  { front: 'Binaire → décimal', back: 'On additionne les puissances de 2 (1, 2, 4, 8, 16…) des rangs qui contiennent un 1.', skill: 'Réseaux et données' },
  { front: 'Capteur logique / analogique', back: 'Logique : 2 états (0/1). Analogique : plage de valeurs continues.', skill: 'Chaînes d’information et d’énergie' }
];

// =====================================================================
// 3ᵉ — MATHÉMATIQUES & AUTOMATISMES (DNB 2026)
// =====================================================================

const maths3 = [
  // Théorème de Thalès
  () => {
    const p = rand(1, 4);
    const q = rand(p + 1, 7);
    const m = rand(1, 4);
    const n = rand(2, 6);
    const [AD, AB, BC, DE] = [p * m, q * m, q * n, p * n];
    const askDE = Math.random() < 0.5;
    return inp(`Dans le triangle ABC, D est sur [AB] et E sur [AC], avec (DE) // (BC).\nAD = ${AD} cm, AB = ${AB} cm, ${askDE ? `BC = ${BC} cm. Calcule DE` : `DE = ${DE} cm. Calcule BC`} (en cm).`, askDE ? DE : BC,
      'Les droites (BD) et (CE) sont sécantes en A et (DE) // (BC) : écris les trois rapports égaux du théorème de Thalès, puis utilise un produit en croix.',
      `Les points A, D, B et A, E, C sont alignés et (DE) // (BC).\nD’après le théorème de Thalès : AD/AB = AE/AC = DE/BC.\nAvec les valeurs : ${AD}/${AB} = DE/BC.\n${askDE ? `DE = BC × AD ÷ AB = ${BC} × ${AD} ÷ ${AB} = ${DE} cm.` : `BC = DE × AB ÷ AD = ${DE} × ${AB} ÷ ${AD} = ${BC} cm.`}`, 'Théorème de Thalès');
  },
  // Trigonométrie : calcul de longueur
  () => {
    const k = rand(1, 4);
    const flip = Math.random() < 0.5; // côté adjacent = 4k (sinon 3k)
    const adj = (flip ? 4 : 3) * k;
    const opp = (flip ? 3 : 4) * k;
    const hyp = 5 * k;
    const f = pick(['cos', 'sin', 'tan']);
    if (f === 'tan' && !flip) return maths3[1]();
    const val = { cos: adj / hyp, sin: opp / hyp, tan: opp / adj }[f];
    const known = f === 'tan' ? `AB = ${adj} cm` : `BC = ${hyp} cm`;
    const target = f === 'cos' ? 'AB' : 'AC';
    const res = f === 'cos' ? adj : opp;
    const formula = { cos: 'cos(ABC) = AB/BC (adjacent/hypoténuse)', sin: 'sin(ABC) = AC/BC (opposé/hypoténuse)', tan: 'tan(ABC) = AC/AB (opposé/adjacent)' }[f];
    const calc = f === 'tan' ? `AC = AB × tan(ABC) = ${adj} × ${fr(val)} = ${res} cm.` : `${target} = BC × ${f}(ABC) = ${hyp} × ${fr(val)} = ${res} cm.`;
    return inp(`ABC est rectangle en A. On sait que ${known} et ${f}(ABC) = ${fr(val)}. Calcule ${target} (en cm).`, res,
      'Repère, par rapport à l’angle ABC, le côté adjacent, le côté opposé et l’hypoténuse. Moyen mnémotechnique : SOH CAH TOA.',
      `Dans le triangle ABC rectangle en A : ${formula}.\n${calc}`, 'Trigonométrie');
  },
  // Trigonométrie : choisir la bonne formule
  () => {
    const [A, B2, C] = pick(['ABC', 'EFG', 'RST', 'MNP', 'IJK', 'DEF']).split('');
    const atB = Math.random() < 0.5;
    const ang = atB ? `${A}${B2}${C}` : `${A}${C}${B2}`;
    const adj = atB ? `${A}${B2}` : `${A}${C}`;
    const opp = atB ? `${A}${C}` : `${A}${B2}`;
    const hyp = `${B2}${C}`;
    const f = pick(['cos', 'sin', 'tan']);
    const R = { cos: `${adj}/${hyp}`, sin: `${opp}/${hyp}`, tan: `${opp}/${adj}` };
    const inv = { cos: `${hyp}/${adj}`, sin: `${hyp}/${opp}`, tan: `${adj}/${opp}` };
    return q4({
      prompt: `Le triangle ${A}${B2}${C} est rectangle en ${A}. Que vaut ${f}(${ang}) ?`,
      answer: R[f],
      wrong: [...Object.keys(R).filter((g) => g !== f).map((g) => R[g]), inv[f]],
      hint: 'SOH CAH TOA : Sinus = Opposé/Hypoténuse, Cosinus = Adjacent/Hypoténuse, Tangente = Opposé/Adjacent.',
      explanation: `Pour l’angle ${ang} : l’hypoténuse est [${hyp}] (face à l’angle droit), le côté adjacent est [${adj}], le côté opposé est [${opp}].\nDonc ${f}(${ang}) = ${R[f]}.`,
      skill: 'Trigonométrie'
    });
  },
  // Fonction affine : image
  () => {
    const a = pick([-1, 1]) * rand(1, 9);
    const b = rand(-10, 10);
    const x = rand(-6, 6);
    return inp(`Soit f la fonction définie par f(x) = ${lin(a, b)}. Calcule f(${x}).`, a * x + b,
      'Remplace x par la valeur donnée (entre parenthèses si elle est négative) et respecte les priorités.',
      `f(${x}) = ${a} × ${par(x)}${b === 0 ? '' : ` + ${par(b)}`} = ${a * x}${b === 0 ? '' : ` + ${par(b)}`} = ${a * x + b}.`, 'Fonctions');
  },
  // Fonction affine : antécédent
  () => {
    const a = pick([-1, 1]) * rand(2, 9);
    const b = rand(-10, 10);
    const x = rand(-8, 8);
    const y = a * x + b;
    return inp(`Soit f(x) = ${lin(a, b)}. Quel est l’antécédent de ${y} par f ?`, x,
      'Chercher l’antécédent de y, c’est résoudre l’équation f(x) = y.',
      `On résout ${lin(a, b)} = ${y}.\n${a}x = ${y} - ${par(b)} = ${y - b}.\nx = ${y - b} ÷ ${par(a)} = ${x}.\nL’antécédent de ${y} est ${x}.`, 'Fonctions');
  },
  // Coefficient directeur
  () => {
    const a = pick([-1, 1]) * rand(1, 6);
    const b = rand(-8, 8);
    const x1 = rand(-5, 3);
    const x2 = x1 + rand(1, 5);
    const y1 = a * x1 + b;
    const y2 = a * x2 + b;
    return inp(`f est une fonction affine telle que f(${x1}) = ${y1} et f(${x2}) = ${y2}. Quel est son coefficient directeur a ?`, a,
      'Le coefficient directeur mesure la variation de f(x) quand x augmente : a = (différence des images) ÷ (différence des antécédents).',
      `a = (f(${x2}) - f(${x1})) ÷ (${x2} - ${par(x1)}) = (${y2} - ${par(y1)}) ÷ ${x2 - x1} = ${y2 - y1} ÷ ${x2 - x1} = ${a}.`, 'Fonctions');
  },
  // Identités remarquables
  () => {
    const k = rand(1, 3);
    const a = rand(1, 9);
    const kind = pick(['+', '-', '+-']);
    const sq = (s) => `${s}²`;
    const kx = k === 1 ? 'x' : `${k}x`;
    if (kind === '+') {
      return q4({ prompt: `Développe : ${sq(`(${lin(k, a)})`)}`, answer: poly(k * k, 2 * k * a, a * a),
        wrong: [poly(k * k, 0, a * a), poly(k * k, k * a, a * a), poly(k * k, -2 * k * a, a * a), poly(k * k, 2 * k * a, 2 * a)],
        hint: 'Identité remarquable : (a + b)² = a² + 2ab + b². N’oublie pas le double produit !',
        explanation: `(a + b)² = a² + 2ab + b² avec a = ${kx} et b = ${a} :\n(${kx})² + 2 × ${kx} × ${a} + ${a}² = ${poly(k * k, 2 * k * a, a * a)}.`, skill: 'Identités remarquables' });
    }
    if (kind === '-') {
      return q4({ prompt: `Développe : ${sq(`(${lin(k, -a)})`)}`, answer: poly(k * k, -2 * k * a, a * a),
        wrong: [poly(k * k, 0, -a * a), poly(k * k, 0, a * a), poly(k * k, -2 * k * a, -a * a), poly(k * k, 2 * k * a, a * a)],
        hint: 'Identité remarquable : (a - b)² = a² - 2ab + b². Le dernier terme est un carré : il est positif.',
        explanation: `(a - b)² = a² - 2ab + b² avec a = ${kx} et b = ${a} :\n(${kx})² - 2 × ${kx} × ${a} + ${a}² = ${poly(k * k, -2 * k * a, a * a)}.`, skill: 'Identités remarquables' });
    }
    return q4({ prompt: `Développe : (${lin(k, a)})(${lin(k, -a)})`, answer: poly(k * k, 0, -a * a),
      wrong: [poly(k * k, 0, a * a), poly(k * k, -2 * k * a, -a * a), poly(k * k, 2 * k * a, -a * a), poly(k * k, -2 * k * a, a * a)],
      hint: 'Identité remarquable : (a + b)(a - b) = a² - b². Les termes « croisés » s’annulent.',
      explanation: `(a + b)(a - b) = a² - b² avec a = ${kx} et b = ${a} :\n(${kx})² - ${a}² = ${poly(k * k, 0, -a * a)}.`, skill: 'Identités remarquables' });
  },
  // Factoriser
  () => {
    const kind = pick(['diff', 'commun', 'carre']);
    const a = rand(1, 9);
    if (kind === 'diff') {
      return q4({ prompt: `Factorise : x² - ${a * a}`, answer: `(x - ${a})(x + ${a})`,
        wrong: [`(x - ${a})²`, `(x + ${a})²`, `x(x - ${a * a})`],
        hint: `Reconnais une différence de deux carrés : ${a * a} = ${a}².`,
        explanation: `x² - ${a * a} = x² - ${a}², de la forme a² - b² = (a - b)(a + b).\nDonc x² - ${a * a} = (x - ${a})(x + ${a}).`, skill: 'Factorisation' });
    }
    if (kind === 'carre') {
      return q4({ prompt: `Factorise : ${poly(1, 2 * a, a * a)}`, answer: `(x + ${a})²`,
        wrong: [`(x - ${a})²`, `(x + ${a})(x - ${a})`, `(x + ${2 * a})²`],
        hint: 'Repère deux carrés (x² et un nombre au carré) et vérifie le double produit : a² + 2ab + b² = (a + b)².',
        explanation: `x² = x², ${a * a} = ${a}² et 2 × x × ${a} = ${2 * a}x : c’est a² + 2ab + b² avec a = x et b = ${a}.\nDonc ${poly(1, 2 * a, a * a)} = (x + ${a})².`, skill: 'Factorisation' });
    }
    const k = rand(2, 9);
    let m;
    let b;
    do { m = rand(1, 5); b = pick([-1, 1]) * rand(1, 9); } while (gcd(m, Math.abs(b)) !== 1);
    return q4({ prompt: `Factorise au maximum : ${lin(k * m, k * b)}`, answer: `${k}(${lin(m, b)})`,
      wrong: [`${k}(${lin(m, k * b)})`, `${k}(${lin(k * m, b)})`, `${k * m}(${lin(1, b)})`, `${k}x(${lin(m, b)})`],
      hint: 'Cherche le plus grand facteur commun aux deux termes et mets-le devant la parenthèse.',
      explanation: `${k * m}x = ${k} × ${lin(m, 0)} et ${k * b} = ${k} × ${par(b)} : le facteur commun est ${k}.\nDonc ${lin(k * m, k * b)} = ${k}(${lin(m, b)}). Vérifie en redéveloppant !`, skill: 'Factorisation' });
  },
  // Probabilités
  () => {
    if (Math.random() < 0.5) {
      const r = rand(1, 9); const b = rand(1, 9); const v = rand(1, 9);
      const T = r + b + v;
      const [nom, n] = pick([['rouge', r], ['bleue', b], ['verte', v]]);
      return inp(`Une urne contient ${r} boules rouges, ${b} boules bleues et ${v} boules vertes, indiscernables au toucher. On tire une boule au hasard. Quelle est la probabilité qu’elle soit ${nom} ? (fraction ou décimal)`, fracForms(n, T),
        'Situation d’équiprobabilité : probabilité = nombre d’issues favorables ÷ nombre total d’issues.',
        `Nombre total de boules : ${r} + ${b} + ${v} = ${T}.\nIssues favorables (boule ${nom}) : ${n}.\nP = ${n}/${T}${simp(n, T) !== `${n}/${T}` ? ` = ${simp(n, T)}` : ''}.`, 'Probabilités');
    }
    const ev = pick([
      ['un nombre pair', [2, 4, 6]], ['un multiple de 3', [3, 6]], ['un nombre premier', [2, 3, 5]], ['un nombre supérieur ou égal à 5', [5, 6]],
      ['un diviseur de 6', [1, 2, 3, 6]], ['un nombre strictement inférieur à 3', [1, 2]], ['un nombre impair', [1, 3, 5]]
    ]);
    const n = ev[1].length;
    return inp(`On lance un dé équilibré à 6 faces. Quelle est la probabilité d’obtenir ${ev[0]} ? (fraction ou décimal)`, fracForms(n, 6),
      'Liste les issues favorables parmi 1, 2, 3, 4, 5, 6, puis divise par le nombre total d’issues.',
      `Issues favorables : ${ev[1].join(', ')}, soit ${n} issue${n > 1 ? 's' : ''} sur 6.\nP = ${n}/6${simp(n, 6) !== `${n}/6` ? ` = ${simp(n, 6)}` : ''}.`, 'Probabilités');
  },
  // Statistiques : moyenne, médiane, étendue
  () => {
    const n = pick([5, 7]);
    const vals = Array.from({ length: n }, () => rand(4, 20));
    const s0 = vals.reduce((x, y) => x + y, 0);
    vals[n - 1] += (n - (s0 % n)) % n;
    const S = vals.reduce((x, y) => x + y, 0);
    const sorted = [...vals].sort((x, y) => x - y);
    const kind = pick(['moyenne', 'médiane', 'étendue']);
    const list = vals.join(' ; ');
    if (kind === 'moyenne') {
      return inp(`Voici les notes d’un élève : ${list}. Calcule la moyenne de cette série.`, S / n,
        'Moyenne = somme de toutes les valeurs ÷ nombre de valeurs.',
        `Somme : ${vals.join(' + ')} = ${S}.\nNombre de valeurs : ${n}.\nMoyenne = ${S} ÷ ${n} = ${S / n}.`, 'Statistiques');
    }
    if (kind === 'médiane') {
      const med = sorted[(n - 1) / 2];
      return inp(`Voici une série de valeurs : ${list}. Quelle est sa médiane ?`, med,
        'Range d’abord les valeurs dans l’ordre croissant. La médiane partage la série en deux groupes de même effectif.',
        `Série rangée : ${sorted.join(' ; ')}.\nIl y a ${n} valeurs : la médiane est la ${(n + 1) / 2}ᵉ, soit ${med}.`, 'Statistiques');
    }
    return inp(`Voici une série de valeurs : ${list}. Quelle est son étendue ?`, sorted[n - 1] - sorted[0],
      'L’étendue mesure l’écart entre les deux valeurs extrêmes de la série.',
      `Plus grande valeur : ${sorted[n - 1]} ; plus petite : ${sorted[0]}.\nÉtendue = ${sorted[n - 1]} - ${sorted[0]} = ${sorted[n - 1] - sorted[0]}.`, 'Statistiques');
  },
  // PGCD
  () => {
    const g = rand(2, 15);
    let p;
    let q;
    do { p = rand(2, 12); q = rand(2, 12); } while (p === q || gcd(p, q) !== 1);
    const A = g * p;
    const Bv = g * q;
    return inp(`Calcule le PGCD de ${A} et ${Bv}.`, g,
      'Liste les diviseurs de chaque nombre, ou utilise l’algorithme d’Euclide (divisions successives) ou les décompositions en facteurs premiers.',
      `${A} = ${g} × ${p} et ${Bv} = ${g} × ${q}, et ${p} et ${q} n’ont pas d’autre diviseur commun que 1.\nPGCD(${A} ; ${Bv}) = ${g}.\nApplication : on peut simplifier ${A}/${Bv} = ${p}/${q} (fraction irréductible).`, 'Arithmétique');
  },
  // Équation produit nul
  () => {
    let a;
    let b;
    do { a = rand(1, 9); b = rand(1, 9); } while (a === b);
    return q4({
      prompt: `Quelles sont les solutions de l’équation (x - ${a})(x + ${b}) = 0 ?`,
      answer: `${a} et ${-b}`,
      wrong: [`${-a} et ${b}`, `${a} et ${b}`, `${-a} et ${-b}`],
      hint: 'Un produit de facteurs est nul si et seulement si l’un au moins des facteurs est nul.',
      explanation: `(x - ${a})(x + ${b}) = 0 ⟺ x - ${a} = 0 ou x + ${b} = 0 ⟺ x = ${a} ou x = ${-b}.\nLes solutions sont ${a} et ${-b}.`,
      skill: 'Équations'
    });
  },
  // Automatisme : coefficient multiplicateur
  () => {
    const t = pick([2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 60]);
    const up = Math.random() < 0.5;
    const ans = fr(up ? 1 + t / 100 : 1 - t / 100);
    return q4({
      prompt: `${up ? 'Augmenter' : 'Diminuer'} une quantité de ${t} % revient à la multiplier par :`,
      answer: ans,
      wrong: [fr(t / 100), fr(up ? 1 - t / 100 : 1 + t / 100), fr(up ? 1 + t / 1000 : 1 - t / 1000, 3), fr(t / 10)],
      hint: `Une quantité, c’est 100 % d’elle-même. Après ${up ? 'une hausse' : 'une baisse'} de ${t} %, que représente-t-elle ?`,
      explanation: `On passe de 100 % à 100 % ${up ? '+' : '-'} ${t} % = ${up ? 100 + t : 100 - t} %.\n${up ? 100 + t : 100 - t} % = ${up ? 100 + t : 100 - t}/100 = ${ans}.\nLe coefficient multiplicateur est ${ans}.`,
      skill: 'Pourcentages'
    });
  }
];

const maths3Cards = [
  { front: 'Théorème de Thalès', back: 'Si (BD) et (CE) sont sécantes en A et (DE) // (BC), alors AD/AB = AE/AC = DE/BC.', skill: 'Théorème de Thalès' },
  { front: 'Réciproque de Thalès', back: 'Si A, D, B et A, E, C sont alignés dans le même ordre et AD/AB = AE/AC, alors (DE) // (BC).', skill: 'Théorème de Thalès' },
  { front: 'SOH CAH TOA', back: 'sin = opposé/hypoténuse ; cos = adjacent/hypoténuse ; tan = opposé/adjacent.', skill: 'Trigonométrie' },
  { front: 'Fonction affine', back: 'f(x) = ax + b ; a : coefficient directeur, b : ordonnée à l’origine. Représentation : une droite.', skill: 'Fonctions' },
  { front: 'Fonction linéaire', back: 'f(x) = ax ; elle modélise une situation de proportionnalité (droite passant par l’origine).', skill: 'Fonctions' },
  { front: 'Coefficient directeur', back: 'a = (f(x₂) - f(x₁)) ÷ (x₂ - x₁)', skill: 'Fonctions' },
  { front: '(a + b)²', back: 'a² + 2ab + b²', skill: 'Identités remarquables' },
  { front: '(a - b)²', back: 'a² - 2ab + b²', skill: 'Identités remarquables' },
  { front: '(a + b)(a - b)', back: 'a² - b²', skill: 'Identités remarquables' },
  { front: 'Équation produit nul', back: 'A × B = 0 ⟺ A = 0 ou B = 0.', skill: 'Équations' },
  { front: 'Probabilité (équiprobabilité)', back: 'P = nombre d’issues favorables ÷ nombre d’issues possibles ; 0 ≤ P ≤ 1.', skill: 'Probabilités' },
  { front: 'Médiane', back: 'Valeur qui partage la série rangée en deux groupes de même effectif.', skill: 'Statistiques' },
  { front: 'Nombre premier', back: 'Entier qui a exactement deux diviseurs : 1 et lui-même (2, 3, 5, 7, 11, 13…).', skill: 'Arithmétique' },
  { front: 'Volume d’une pyramide / d’un cône', back: 'V = (aire de la base × hauteur) ÷ 3', skill: 'Géométrie dans l’espace' },
  { front: 'Volume d’une boule', back: 'V = 4/3 × π × r³', skill: 'Géométrie dans l’espace' }
];

// =====================================================================
// 3ᵉ — SCIENCES (SVT, Physique-Chimie, Technologie)
// =====================================================================

const sci3Genetique = [
  B('Où se trouve l’information génétique dans une cellule ?', 'Dans le noyau, portée par les chromosomes', ['Dans la membrane', 'Dans le sang uniquement', 'Dans les muscles'], 'C’est le « centre de commande » de la cellule.', 'L’ADN, organisé en chromosomes, se trouve dans le noyau des cellules.'),
  B('Combien de chromosomes possède une cellule humaine (hors gamètes) ?', '46, soit 23 paires', ['23', '46 paires', '48'], 'Les chromosomes vont par paires.', 'Une cellule humaine contient 23 paires de chromosomes, soit 46 chromosomes. Les gamètes n’en ont que 23.'),
  B('Un gène est…', 'une portion d’ADN qui détermine un caractère', ['une cellule entière', 'une protéine du sang', 'un organe'], 'Il est situé à un endroit précis d’un chromosome.', 'Un gène est un segment d’ADN, situé à un emplacement précis d’un chromosome, qui contribue à un caractère.'),
  B('Les allèles sont…', 'les différentes versions d’un même gène', ['deux gènes différents', 'des chromosomes sexuels', 'des cellules reproductrices'], 'Exemple : groupe sanguin A, B ou O.', 'Un gène peut exister sous plusieurs versions : les allèles (ex. : allèles A, B, O du gène du groupe sanguin).'),
  B('La mitose produit…', 'deux cellules identiques à la cellule mère', ['quatre gamètes différents', 'une cellule-œuf', 'des cellules sans chromosomes'], 'C’est la division qui permet la croissance.', 'La mitose divise une cellule en deux cellules filles génétiquement identiques (même nombre de chromosomes).'),
  B('Pourquoi deux enfants des mêmes parents sont-ils différents (sauf vrais jumeaux) ?', 'Grâce au brassage génétique lors de la formation des gamètes et de la fécondation', ['Parce qu’ils ne mangent pas pareil', 'Parce que leurs gènes sont inventés', 'Uniquement à cause de l’environnement'], 'Chaque gamète reçoit une combinaison différente de chromosomes.', 'Chaque gamète reçoit un chromosome de chaque paire au hasard, et la fécondation réunit deux gamètes au hasard : chaque individu est unique.'),
  B('Les chromosomes sexuels d’un homme sont…', 'XY', ['XX', 'YY', 'X seul'], 'Celui de la femme est XX.', 'La 23ᵉ paire est XX chez la femme et XY chez l’homme.'),
  B('L’évolution des espèces s’explique notamment par…', 'les mutations et la sélection naturelle', ['la volonté des animaux', 'l’absence de reproduction', 'le hasard seul sans tri'], 'Les individus les mieux adaptés laissent plus de descendants.', 'Des mutations créent de la diversité ; la sélection naturelle favorise les individus les mieux adaptés à leur milieu.')
];

const sci3Immunite = [
  B('Les antibiotiques sont efficaces contre…', 'les bactéries', ['les virus', 'les champignons uniquement', 'tous les microbes'], 'Ils ne soignent pas la grippe.', 'Les antibiotiques agissent sur les bactéries, pas sur les virus. Leur usage excessif favorise des bactéries résistantes.'),
  B('La phagocytose est…', 'l’ingestion et la destruction d’un microbe par un globule blanc', ['la production d’anticorps', 'la cicatrisation', 'une vaccination'], 'C’est une réaction immédiate, non spécifique.', 'Certains globules blancs (phagocytes) englobent et digèrent les micro-organismes : c’est la phagocytose.'),
  B('Les anticorps sont produits par…', 'des lymphocytes B', ['des globules rouges', 'des plaquettes', 'des neurones'], 'Ce sont des globules blancs spécialisés.', 'Les lymphocytes B produisent des anticorps spécifiques d’un antigène, qui neutralisent le microbe.'),
  B('Un vaccin permet…', 'de créer une mémoire immunitaire sans tomber malade', ['de soigner immédiatement une infection', 'de tuer les bactéries comme un antibiotique', 'de remplacer les globules blancs'], 'On parle de lymphocytes « mémoire ».', 'Le vaccin contient un antigène inoffensif : l’organisme fabrique des lymphocytes mémoire qui réagiront vite en cas de vraie infection.'),
  B('Une réaction immunitaire spécifique cible…', 'un antigène précis', ['tous les microbes à la fois', 'uniquement les cellules saines', 'les aliments'], 'Un anticorps reconnaît une seule « forme ».', 'Les lymphocytes et les anticorps reconnaissent un antigène particulier : la réponse est spécifique.'),
  B('Quel geste limite la transmission des microbes ?', 'Se laver les mains régulièrement', ['Partager sa gourde', 'Tousser dans sa main sans la laver', 'Arrêter un traitement antibiotique avant la fin'], 'Les mains transportent beaucoup de micro-organismes.', 'Le lavage des mains, l’aération et le port du masque limitent la contamination.'),
  B('Les lymphocytes T cytotoxiques…', 'détruisent les cellules infectées par un virus', ['fabriquent des anticorps', 'transportent le dioxygène', 'digèrent les aliments'], 'Ils agissent directement au contact des cellules.', 'Les lymphocytes T cytotoxiques reconnaissent et détruisent les cellules infectées.'),
  B('La séropositivité au VIH signifie…', 'que l’organisme a produit des anticorps contre le VIH', ['que la personne est vaccinée', 'que le virus a disparu', 'que la personne est immunisée'], 'On détecte la présence d’anticorps dans le sang.', 'Être séropositif, c’est avoir des anticorps anti-VIH dans le sang : la personne est infectée par le virus.')
];

const sci3Chimie = [
  B('Un ion est…', 'un atome ou un groupe d’atomes ayant gagné ou perdu des électrons', ['une molécule neutre', 'un noyau seul', 'un électron libre'], 'Il porte une charge électrique.', 'Un ion est chargé : il a perdu des électrons (ion positif, cation) ou en a gagné (ion négatif, anion).'),
  B('Une solution de pH = 3 est…', 'acide', ['neutre', 'basique', 'impossible à classer'], 'Le pH neutre vaut 7.', 'pH < 7 : solution acide ; pH = 7 : neutre ; pH > 7 : basique.'),
  B('Quand on dilue une solution acide avec de l’eau, son pH…', 'se rapproche de 7', ['diminue vers 0', 'reste exactement le même', 'devient supérieur à 14'], 'L’eau pure est neutre.', 'Une dilution rend la solution moins acide : son pH augmente et se rapproche de 7.'),
  B('L’ion Na⁺ a…', 'perdu un électron', ['gagné un électron', 'perdu un proton', 'gagné un neutron'], 'Le signe + indique un manque de charges négatives.', 'Na⁺ : l’atome de sodium a perdu un électron, il porte donc une charge positive.'),
  B('Quel est l’ordre de grandeur de la taille d’un atome ?', '10⁻¹⁰ m', ['10⁻³ m', '10⁻¹ m', '10⁻²⁰ m'], 'C’est environ un dixième de milliardième de mètre.', 'Un atome mesure environ 10⁻¹⁰ m ; son noyau est environ 100 000 fois plus petit.'),
  B('Le noyau d’un atome contient…', 'des protons et des neutrons', ['des électrons uniquement', 'des molécules', 'des ions'], 'Les électrons sont autour.', 'Le noyau est formé de protons (charge +) et de neutrons (neutres) ; les électrons (charge -) sont autour.'),
  B('Le test à la soude qui donne un précipité bleu révèle l’ion…', 'cuivre Cu²⁺', ['fer Fe³⁺', 'chlorure Cl⁻', 'sodium Na⁺'], 'La couleur du précipité dépend de l’ion métallique.', 'Précipité bleu : Cu²⁺ ; vert : Fe²⁺ ; rouille : Fe³⁺. L’ion Cl⁻ se teste au nitrate d’argent (précipité blanc).'),
  B('Un atome est électriquement neutre car…', 'il a autant de protons que d’électrons', ['il n’a pas d’électrons', 'il n’a pas de noyau', 'ses neutrons annulent les électrons'], 'Les charges + et - se compensent.', 'Le nombre de protons (charges +) est égal au nombre d’électrons (charges -) : l’atome est neutre.')
];

const sci3Energie = [
  B('Dans une centrale thermique, l’alternateur convertit…', 'l’énergie mécanique en énergie électrique', ['l’énergie électrique en énergie chimique', 'l’énergie lumineuse en énergie thermique', 'l’énergie nucléaire en lumière'], 'Il est entraîné par la turbine qui tourne.', 'La turbine fait tourner l’alternateur, qui transforme l’énergie mécanique (de rotation) en énergie électrique.'),
  B('L’unité légale de l’énergie est…', 'le joule (J)', ['le watt (W)', 'le volt (V)', 'le newton (N)'], 'Le watt est l’unité de la puissance.', 'L’énergie s’exprime en joules (J) ; on utilise aussi le kilowattheure (1 kWh = 3,6 millions de J).'),
  B('Lors d’une conversion d’énergie, une partie est souvent perdue sous forme…', 'thermique (chaleur)', ['de masse', 'de lumière noire', 'de tension'], 'Pense à un chargeur de téléphone qui chauffe.', 'Une conversion n’est jamais parfaite : une partie de l’énergie est dissipée, le plus souvent en chaleur.'),
  B('Une pile convertit…', 'de l’énergie chimique en énergie électrique', ['de l’énergie électrique en énergie lumineuse', 'de l’énergie thermique en énergie chimique', 'de l’énergie mécanique en énergie électrique'], 'Il y a une réaction chimique à l’intérieur.', 'Dans une pile, une transformation chimique produit de l’énergie électrique.'),
  B('Un objet connecté communique avec un serveur grâce…', 'à un réseau (Wi-Fi, Bluetooth, 4G…)', ['à la chaleur', 'à un câble électrique d’alimentation', 'à un moteur'], 'Les données doivent voyager.', 'Un objet connecté envoie et reçoit des données par un réseau de communication, souvent sans fil.'),
  B('L’énergie cinétique d’un véhicule dépend…', 'de sa masse et du carré de sa vitesse', ['de sa couleur', 'uniquement de sa masse', 'de la tension de sa batterie'], 'Doubler la vitesse multiplie cette énergie par 4.', 'Ec = ½ × m × v² : elle dépend de la masse et surtout de la vitesse (au carré).'),
  B('Le poids et la masse…', 'sont deux grandeurs différentes : P = m × g', ['sont la même chose', 'ont la même unité', 'ne dépendent jamais du lieu'], 'Sur la Lune, ta masse ne change pas, mais ton poids si.', 'La masse (kg) est une quantité de matière ; le poids (N) est une force qui dépend de g : P = m × g.'),
  B('Une interaction à distance, c’est par exemple…', 'l’attraction gravitationnelle de la Terre sur la Lune', ['un pied qui frappe un ballon', 'une main qui pousse une porte', 'le frottement d’un pneu sur la route'], 'Il n’y a pas de contact entre les deux objets.', 'La gravitation (comme l’attraction magnétique) agit à distance, sans contact.')
];

const sciences3 = [
  fromBank(sci3Genetique, 'Génétique et évolution'),
  fromBank(sci3Immunite, 'Immunité'),
  fromBank(sci3Chimie, 'Atomes, ions et pH'),
  fromBank(sci3Energie, 'Énergie et interactions'),
  // Énergie électrique consommée
  () => {
    const P = pick([60, 100, 500, 800, 1000, 1500, 2000, 2500]);
    const t = pick([0.5, 1, 2, 3, 4, 5, 8]);
    const E = (P * t) / 1000;
    return inp(`Un appareil de puissance ${P} W fonctionne pendant ${fr(t)} h. Quelle énergie consomme-t-il (en kWh) ?`, fr(E, 3),
      'Énergie = puissance × durée. Pour obtenir des kWh, exprime la puissance en kW et la durée en heures.',
      `P = ${P} W = ${fr(P / 1000, 3)} kW.\nE = P × t = ${fr(P / 1000, 3)} × ${fr(t)} = ${fr(E, 3)} kWh.`, 'Énergie et puissance');
  },
  // Puissance électrique
  () => {
    if (Math.random() < 0.5) {
      const U = pick([5, 12, 24, 230]);
      const I = pick([0.5, 1, 2, 4, 5, 10]);
      return inp(`Un appareil alimenté sous ${U} V est traversé par un courant de ${fr(I)} A. Calcule sa puissance (en W).`, fr(U * I),
        'La puissance électrique reçue par un appareil se calcule avec la tension et l’intensité.',
        `P = U × I = ${U} × ${fr(I)} = ${fr(U * I)} W.`, 'Énergie et puissance');
    }
    const I = pick([2, 4, 5, 8, 10]);
    const P = 230 * I;
    return inp(`Un radiateur de ${P} W est branché sur le secteur (230 V). Quelle est l’intensité du courant qui le traverse (en A) ?`, I,
      'Pars de P = U × I et isole I.', `P = U × I, donc I = P ÷ U = ${P} ÷ 230 = ${I} A.`, 'Énergie et puissance');
  },
  // Énergie cinétique
  () => {
    const m = pick([2, 4, 10, 50, 60, 80, 1000]);
    const v = rand(1, 30);
    const Ec = (m * v * v) / 2;
    return inp(`Calcule l’énergie cinétique (en J) d’un objet de masse ${m} kg se déplaçant à ${v} m/s.`, Ec,
      'Ec = ½ × m × v², avec m en kg et v en m/s. Calcule d’abord le carré de la vitesse.',
      `v² = ${v}² = ${v * v}.\nEc = ½ × ${m} × ${v * v} = ${big(Ec)} J.`, 'Énergie et interactions');
  },
  // Poids
  () => {
    const m = rand(2, 90);
    const lune = Math.random() < 0.3;
    const g = lune ? 1.6 : 9.8;
    return inp(`Calcule le poids (en N) d’un objet de masse ${m} kg ${lune ? 'sur la Lune (g = 1,6 N/kg)' : 'sur Terre (g = 9,8 N/kg)'}.`, fr(m * g, 1),
      'Le poids est une force : P = m × g, avec m en kg et g en N/kg.',
      `P = m × g = ${m} × ${fr(g)} = ${fr(m * g, 1)} N.`, 'Énergie et interactions');
  },
  // Concentration en masse
  () => {
    const V = pick([0.1, 0.2, 0.25, 0.5, 1, 2]);
    const c = rand(2, 50);
    const m = c * V;
    return inp(`On dissout ${fr(m)} g de sel dans de l’eau pour obtenir ${fr(V)} L de solution. Quelle est la concentration en masse de sel (en g/L) ?`, c,
      'Concentration en masse = masse de soluté ÷ volume de solution (en L).',
      `c = m ÷ V = ${fr(m)} ÷ ${fr(V)} = ${c} g/L.`, 'Atomes, ions et pH');
  }
];

const sciences3Cards = [
  { front: 'Chromosome / gène / allèle', back: 'Chromosome : ADN condensé. Gène : portion d’ADN déterminant un caractère. Allèle : version d’un gène.', skill: 'Génétique et évolution' },
  { front: 'Caryotype humain', back: '23 paires de chromosomes (46) ; XX chez la femme, XY chez l’homme.', skill: 'Génétique et évolution' },
  { front: 'Mitose', back: 'Division d’une cellule en deux cellules identiques (croissance, renouvellement).', skill: 'Génétique et évolution' },
  { front: 'Sélection naturelle', back: 'Les individus les mieux adaptés au milieu survivent et se reproduisent davantage.', skill: 'Génétique et évolution' },
  { front: 'Antibiotique', back: 'Médicament efficace contre les bactéries, inefficace contre les virus.', skill: 'Immunité' },
  { front: 'Vaccination', back: 'Injection d’un antigène inoffensif qui crée une mémoire immunitaire.', skill: 'Immunité' },
  { front: 'Ion', back: 'Atome ayant perdu (ion positif) ou gagné (ion négatif) des électrons.', skill: 'Atomes, ions et pH' },
  { front: 'Échelle de pH', back: 'pH < 7 acide ; pH = 7 neutre ; pH > 7 basique.', skill: 'Atomes, ions et pH' },
  { front: 'Puissance électrique', back: 'P = U × I (P en W, U en V, I en A).', skill: 'Énergie et puissance' },
  { front: 'Énergie électrique', back: 'E = P × t (J si W et s ; kWh si kW et h). 1 kWh = 3 600 000 J.', skill: 'Énergie et puissance' },
  { front: 'Énergie cinétique', back: 'Ec = ½ × m × v² (J, kg, m/s).', skill: 'Énergie et interactions' },
  { front: 'Poids', back: 'P = m × g ; sur Terre g ≈ 9,8 N/kg ; sur la Lune g ≈ 1,6 N/kg.', skill: 'Énergie et interactions' },
  { front: 'Concentration en masse', back: 'c = m ÷ V (g/L).', skill: 'Atomes, ions et pH' }
];

// =====================================================================
// 3ᵉ — PIX & NUMÉRIQUE
// =====================================================================

const pix3Securite = [
  B('Quel mot de passe est le plus robuste ?', 'Velo!Lune7#Cactus', ['123456', 'motdepasse', 'Lucas2011'], 'Longueur, mélange de caractères, absence d’infos personnelles.', 'Un mot de passe robuste est long et mélange majuscules, minuscules, chiffres et symboles, sans prénom ni date de naissance.'),
  B('Tu reçois un mail « Ton compte va être supprimé, clique ici et donne ton mot de passe ». C’est probablement…', 'de l’hameçonnage (phishing)', ['un message officiel fiable', 'une mise à jour normale', 'un spam sans danger'], 'Aucun service sérieux ne demande ton mot de passe par mail.', 'C’est une tentative d’hameçonnage : on cherche à voler tes identifiants. Ne clique pas et signale le message.'),
  B('À quoi sert l’authentification à deux facteurs ?', 'À ajouter une vérification en plus du mot de passe', ['À supprimer le mot de passe', 'À accélérer Internet', 'À partager son compte'], 'Par exemple un code reçu sur ton téléphone.', 'La double authentification demande une 2ᵉ preuve (code SMS, application) : même si ton mot de passe est volé, ton compte reste protégé.'),
  B('Pourquoi faut-il faire les mises à jour de son système ?', 'Pour corriger des failles de sécurité', ['Pour ralentir l’ordinateur', 'Pour effacer ses fichiers', 'Ça ne sert à rien'], 'Les pirates exploitent les failles connues.', 'Les mises à jour corrigent des failles de sécurité découvertes et améliorent le fonctionnement.'),
  B('Sur un ordinateur partagé (CDI), il faut…', 'se déconnecter de ses comptes à la fin', ['enregistrer son mot de passe dans le navigateur', 'laisser sa session ouverte', 'noter son mot de passe sur un papier collé à l’écran'], 'La personne suivante pourrait accéder à tes comptes.', 'Toujours se déconnecter et ne pas mémoriser ses identifiants sur un poste partagé.'),
  B('Un logiciel malveillant qui chiffre tes fichiers et réclame de l’argent s’appelle…', 'un rançongiciel', ['un antivirus', 'un pare-feu', 'un navigateur'], 'En anglais : ransomware.', 'Un rançongiciel bloque les fichiers et demande une rançon ; les sauvegardes régulières protègent de ce risque.'),
  B('Quelle est la meilleure pratique pour sauvegarder ses données importantes ?', 'Faire des copies régulières sur un autre support', ['Garder un seul exemplaire sur son ordinateur', 'Les envoyer à des inconnus', 'Ne jamais les enregistrer'], 'Que se passe-t-il si ton ordinateur tombe en panne ?', 'On conserve des copies sur un autre support (disque externe, cloud) pour pouvoir récupérer les données.'),
  B('Utiliser le même mot de passe partout est risqué car…', 'si un site est piraté, tous tes comptes deviennent accessibles', ['cela ralentit les sites', 'c’est interdit par la loi', 'les sites le refusent toujours'], 'Pense à l’effet domino.', 'Un mot de passe volé sur un site peut être testé sur tous les autres : utilise un mot de passe différent par compte (gestionnaire de mots de passe).')
];

const pix3Droit = [
  B('Que protège le RGPD ?', 'Les données personnelles des citoyens européens', ['Les droits d’auteur des films', 'Les mots de passe Wi-Fi', 'La vitesse d’Internet'], 'Il s’agit d’un règlement européen.', 'Le RGPD (règlement général sur la protection des données) encadre la collecte et l’utilisation des données personnelles.'),
  B('Peux-tu publier la photo d’un camarade sans son accord ?', 'Non, c’est une atteinte au droit à l’image', ['Oui, si elle est jolie', 'Oui, si tu la publies en story', 'Oui, sur un compte privé'], 'Chacun décide de l’usage de son image.', 'Le droit à l’image impose de demander l’autorisation de la personne (et de ses parents si elle est mineure) avant de publier sa photo.'),
  B('Une image trouvée sur Internet est…', 'protégée par le droit d’auteur, sauf mention contraire', ['libre de droits automatiquement', 'utilisable partout sans conditions', 'la propriété de Google'], 'Quelqu’un l’a créée.', 'Toute œuvre est protégée par le droit d’auteur ; on peut utiliser des images sous licence libre (Creative Commons) en respectant leurs conditions.'),
  B('L’e-réputation, c’est…', 'l’image d’une personne construite par les traces qu’elle laisse en ligne', ['le nombre de ses abonnés uniquement', 'sa note au collège', 'la vitesse de sa connexion'], 'Pense à ce qu’on trouve en tapant ton nom.', 'L’e-réputation est formée par tout ce qui est publié sur toi (par toi ou d’autres). Les traces numériques sont durables.'),
  B('Qu’est-ce qu’un cookie sur un site web ?', 'Un petit fichier qui enregistre des informations sur ta navigation', ['Un virus', 'Un jeu en ligne', 'Un mot de passe'], 'Le site te demande souvent ton consentement.', 'Un cookie stocke des informations (préférences, suivi publicitaire) ; le RGPD impose de demander ton accord pour les cookies non essentiels.'),
  B('Face à du cyberharcèlement, que faut-il faire ?', 'En parler à un adulte de confiance et signaler (3018)', ['Répondre par des insultes', 'Garder le secret', 'Supprimer toutes les preuves'], 'Tu n’es pas seul·e, il existe un numéro national.', 'On garde les preuves (captures), on en parle à un adulte, on signale sur la plateforme et on peut appeler le 3018 (gratuit et anonyme).'),
  B('Une licence Creative Commons « BY » impose…', 'de citer l’auteur', ['de payer l’auteur', 'de ne jamais modifier l’œuvre', 'de garder l’œuvre secrète'], 'BY signifie « attribution ».', 'BY = attribution : tu dois citer l’auteur. D’autres options (NC, ND, SA) ajoutent des conditions.'),
  B('Une donnée personnelle est…', 'une information qui permet d’identifier une personne', ['uniquement son mot de passe', 'une information sur la météo', 'un fichier système'], 'Nom, photo, adresse, numéro…', 'Toute information permettant d’identifier une personne, directement ou indirectement, est une donnée personnelle.')
];

const pix3Recherche = [
  B('Pour vérifier une information trouvée en ligne, il faut…', 'croiser plusieurs sources fiables', ['croire le premier résultat', 'se fier au nombre de « j’aime »', 'demander à un inconnu sur un réseau social'], 'Une seule source ne suffit pas.', 'On compare plusieurs sources reconnues, on identifie l’auteur, la date et l’objectif du site.'),
  B('Dans l’adresse https://www.education.gouv.fr/ressources, le nom de domaine est…', 'education.gouv.fr', ['https', 'ressources', 'www'], 'C’est la partie qui identifie le site.', 'Le nom de domaine est education.gouv.fr ; « https » est le protocole et « /ressources » le chemin vers une page.'),
  B('Les premiers résultats d’un moteur de recherche marqués « Sponsorisé » sont…', 'des publicités', ['les sites les plus fiables', 'des sites officiels uniquement', 'des pages choisies par ton professeur'], 'Quelqu’un a payé pour qu’ils apparaissent en premier.', 'Les résultats sponsorisés sont des annonces payantes : ce ne sont pas forcément les plus pertinents.'),
  B('Pour chercher l’expression exacte « réchauffement climatique », on écrit…', '"réchauffement climatique" entre guillemets', ['réchauffement OU climatique', '-réchauffement climatique', 'réchauffement*climatique'], 'Un opérateur force le moteur à garder les mots ensemble.', 'Les guillemets permettent de rechercher une expression exacte.'),
  B('Une « infox » (fake news) est…', 'une information fausse ou trompeuse diffusée volontairement', ['une information récente', 'un article de presse vérifié', 'une publicité légale'], 'Elle cherche souvent à faire réagir fort.', 'Une infox est une fausse information, souvent sensationnelle, destinée à tromper ou à générer des clics.'),
  B('Qu’indique la date de publication d’une page ?', 'Si l’information est à jour', ['Si l’auteur est connu', 'Si le site est gratuit', 'La vitesse du site'], 'Une information de 2010 peut être dépassée.', 'Vérifier la date permet de savoir si l’information est récente ou dépassée.'),
  B('Une IA générative (chatbot) peut…', 'produire des réponses fausses présentées avec assurance', ['ne jamais se tromper', 'remplacer toute vérification', 'citer toujours ses sources exactes'], 'Elle génère du texte vraisemblable, pas forcément vrai.', 'Une IA générative peut « halluciner » : il faut vérifier ses réponses dans des sources fiables.'),
  B('Un moteur de recherche…', 'indexe des pages web et les classe selon des critères', ['contient tout Internet en un seul fichier', 'vérifie que chaque page est vraie', 'est la même chose qu’un navigateur'], 'Google, Qwant, Bing en sont des exemples.', 'Le moteur explore et indexe les pages, puis les classe ; le navigateur (Firefox, Chrome) sert à afficher les pages.')
];

const pix3Bureautique = [
  B('Dans un tableur, que calcule la formule =MOYENNE(B2:B6) ?', 'La moyenne des valeurs des cellules B2 à B6', ['La somme de B2 et B6', 'La moyenne de B2 et B6 seulement', 'Le nombre de cellules entre B2 et B6'], 'Les deux-points signifient « jusqu’à ».', 'B2:B6 désigne la plage B2, B3, B4, B5, B6 ; MOYENNE calcule leur moyenne.'),
  B('Dans un tableur, une formule commence toujours par…', 'le signe =', ['le signe +', 'une lettre', 'un guillemet'], 'C’est ce qui indique au logiciel qu’il doit calculer.', 'Toute formule commence par « = » (ex. : =A1+B1).'),
  B('Que se passe-t-il quand on recopie =A1*2 de la cellule B1 vers B2 ?', 'La formule devient =A2*2', ['Elle reste =A1*2', 'Elle devient =B1*2', 'Elle devient =A1*3'], 'Les références sont relatives par défaut.', 'Avec une référence relative, la formule s’adapte : en descendant d’une ligne, A1 devient A2.'),
  B('À quoi sert le symbole $ dans =$A$1 ?', 'À bloquer la référence (référence absolue)', ['À afficher des dollars', 'À supprimer la cellule', 'À faire une somme'], 'La cellule ne bouge pas lors d’une recopie.', 'Le $ fige la colonne et/ou la ligne : =$A$1 désigne toujours A1, même recopiée.'),
  B('Quel format de fichier garde la mise en page d’un document pour tous les ordinateurs ?', 'PDF', ['TXT', 'MP3', 'CSV'], 'C’est le format idéal pour envoyer un document final.', 'Le PDF fige la mise en page et s’ouvre sur tous les appareils. CSV est un format de données pour tableur.'),
  B('Un fichier « exposé.odt » a été créé avec…', 'un traitement de texte (format OpenDocument)', ['un tableur', 'un logiciel de dessin', 'un lecteur audio'], 'ODT = OpenDocument Text.', 'L’extension .odt correspond à un document texte au format libre OpenDocument (LibreOffice Writer).'),
  B('Pour structurer un long document, on utilise…', 'des styles de titres', ['beaucoup d’espaces', 'des retours à la ligne répétés', 'une police différente à chaque paragraphe'], 'Ils permettent aussi de générer une table des matières.', 'Les styles (Titre 1, Titre 2…) structurent le document et permettent une table des matières automatique.'),
  B('Quel type de graphique convient le mieux pour montrer la répartition d’un tout en parts ?', 'Un diagramme circulaire', ['Une courbe', 'Un nuage de points', 'Un histogramme empilé sur 10 ans'], 'Pense à un camembert.', 'Le diagramme circulaire montre la part de chaque catégorie dans un total (100 %).')
];

const pix3 = [
  fromBank(pix3Securite, 'Sécurité numérique'),
  fromBank(pix3Droit, 'Droit et citoyenneté numérique'),
  fromBank(pix3Recherche, 'Recherche d’information'),
  fromBank(pix3Bureautique, 'Tableur et bureautique'),
  // Formule SOMME
  () => {
    const n = rand(3, 6);
    const vals = Array.from({ length: n }, () => rand(1, 99));
    const col = pick(['A', 'B', 'C', 'D']);
    const start = rand(1, 5);
    const cells = vals.map((v, i) => `${col}${start + i} = ${v}`).join(' ; ');
    const S = vals.reduce((x, y) => x + y, 0);
    return inp(`Dans un tableur : ${cells}.\nQuel résultat affiche la formule =SOMME(${col}${start}:${col}${start + n - 1}) ?`, S,
      `La plage ${col}${start}:${col}${start + n - 1} contient toutes les cellules de ${col}${start} à ${col}${start + n - 1}.`,
      `=SOMME(${col}${start}:${col}${start + n - 1}) additionne ${n} cellules : ${vals.join(' + ')} = ${S}.`, 'Tableur et bureautique');
  },
  // Formule MOYENNE
  () => {
    const n = pick([3, 4, 5]);
    const vals = Array.from({ length: n }, () => rand(2, 20));
    const s0 = vals.reduce((x, y) => x + y, 0);
    vals[n - 1] += (n - (s0 % n)) % n;
    const S = vals.reduce((x, y) => x + y, 0);
    return inp(`Dans un tableur, les cellules B2 à B${n + 1} contiennent : ${vals.join(' ; ')}.\nQuel résultat affiche =MOYENNE(B2:B${n + 1}) ?`, S / n,
      'MOYENNE additionne les valeurs de la plage puis divise par le nombre de cellules.',
      `Somme : ${vals.join(' + ')} = ${S}. Nombre de cellules : ${n}.\nMoyenne = ${S} ÷ ${n} = ${S / n}.`, 'Tableur et bureautique');
  },
  // Unités de stockage
  () => {
    const kind = pick(['Go→Mo', 'Mo→Go', 'photos']);
    if (kind === 'Go→Mo') {
      const g = rand(1, 64) / 2;
      return inp(`Convertis ${fr(g)} Go en Mo (on prendra 1 Go = 1 000 Mo).`, g * 1000,
        'Les préfixes kilo, méga, giga avancent de 1 000 en 1 000.', `${fr(g)} Go = ${fr(g)} × 1 000 = ${g * 1000} Mo.`, 'Données et fichiers');
    }
    if (kind === 'Mo→Go') {
      const m = rand(1, 400) * 50;
      return inp(`Convertis ${big(m)} Mo en Go (on prendra 1 Go = 1 000 Mo).`, fr(m / 1000, 3),
        'Pour passer à une unité plus grande, on divise.', `${big(m)} Mo = ${big(m)} ÷ 1 000 = ${fr(m / 1000, 3)} Go.`, 'Données et fichiers');
    }
    const p = pick([2, 4, 5]);
    const g = pick([4, 8, 16, 32]);
    return inp(`Une photo pèse ${p} Mo. Combien de photos peut-on stocker au maximum sur une clé de ${g} Go (1 Go = 1 000 Mo) ?`, Math.floor((g * 1000) / p),
      'Convertis d’abord la capacité de la clé en Mo, puis divise par la taille d’une photo.',
      `${g} Go = ${big(g * 1000)} Mo.\n${big(g * 1000)} ÷ ${p} = ${big(Math.floor((g * 1000) / p))} photos.`, 'Données et fichiers');
  },
  // Nombre de codes possibles
  () => {
    const [desc, k, nmax] = pick([['chiffres (de 0 à 9)', 10, 6], ['lettres minuscules (26 possibilités)', 26, 4], ['caractères choisis parmi les 26 lettres minuscules et les 10 chiffres', 36, 4]]);
    const n = rand(2, nmax);
    return inp(`Un code secret est composé de ${n} ${desc}. Combien de codes différents existe-t-il ?`, k ** n,
      `Pour chaque position, il y a ${k} possibilités, et les choix se multiplient.`,
      `${k} possibilités pour chacune des ${n} positions : ${Array(n).fill(k).join(' × ')} = ${k}${sup(n)} = ${big(k ** n)} codes.\nPlus un code est long et plus l’alphabet est grand, plus il est difficile à deviner.`, 'Sécurité numérique');
  }
];

const pix3Cards = [
  { front: 'Mot de passe robuste', back: 'Long (12 caractères ou plus), varié (majuscules, chiffres, symboles), unique pour chaque compte, sans info personnelle.', skill: 'Sécurité numérique' },
  { front: 'Hameçonnage (phishing)', back: 'Message frauduleux imitant un service connu pour voler des identifiants ou de l’argent.', skill: 'Sécurité numérique' },
  { front: 'Double authentification', back: 'Deux preuves d’identité : mot de passe + code temporaire ou application.', skill: 'Sécurité numérique' },
  { front: 'RGPD', back: 'Règlement européen qui protège les données personnelles (droit d’accès, de rectification, d’effacement).', skill: 'Droit et citoyenneté numérique' },
  { front: 'Droit à l’image', back: 'On ne publie pas l’image d’une personne sans son autorisation.', skill: 'Droit et citoyenneté numérique' },
  { front: 'Licence Creative Commons', back: 'Licence qui autorise la réutilisation d’une œuvre sous conditions (BY : citer l’auteur, NC : pas d’usage commercial…).', skill: 'Droit et citoyenneté numérique' },
  { front: 'Évaluer une source', back: 'Qui est l’auteur ? Quelle date ? Quel objectif ? L’info est-elle confirmée ailleurs ?', skill: 'Recherche d’information' },
  { front: 'Structure d’une URL', back: 'protocole (https) :// nom de domaine (exemple.fr) / chemin (page).', skill: 'Recherche d’information' },
  { front: 'Référence absolue dans un tableur', back: '$A$1 : la référence ne change pas lors d’une recopie.', skill: 'Tableur et bureautique' },
  { front: 'Formules usuelles d’un tableur', back: '=SOMME(A1:A5), =MOYENNE(A1:A5), =MAX(…), =MIN(…), =NB(…).', skill: 'Tableur et bureautique' },
  { front: 'Unités de stockage', back: '1 octet = 8 bits ; 1 ko = 1 000 octets ; 1 Mo = 1 000 ko ; 1 Go = 1 000 Mo.', skill: 'Données et fichiers' },
  { front: 'Cyberharcèlement', back: 'Garder les preuves, en parler à un adulte, signaler, appeler le 3018.', skill: 'Droit et citoyenneté numérique' }
];

// =====================================================================
// SPRINT CHRONO — automatismes (< 10 s, saisie courte)
// =====================================================================

const sp = (prompt, ans, hint, explanation, skill) => inp(prompt, ans, hint, explanation, skill);

const SPRINT_6 = [
  () => { const a = rand(2, 10); const b = rand(2, 10); return sp(`${a} × ${b} = ?`, a * b, 'Récite ta table !', `${a} × ${b} = ${a * b}.`, 'Tables de multiplication'); },
  () => { const a = rand(11, 89); const b = rand(11, 89); return sp(`${a} + ${b} = ?`, a + b, 'Ajoute d’abord les dizaines, puis les unités.', `${a} + ${b} = ${a + b}.`, 'Calcul mental'); },
  () => { const b = rand(11, 89); return sp(`100 - ${b} = ?`, 100 - b, 'Complète jusqu’à la dizaine suivante, puis jusqu’à 100.', `${b} + ${100 - b} = 100, donc 100 - ${b} = ${100 - b}.`, 'Calcul mental'); },
  () => { const c = rand(11, 999); const p = pick([10, 100, 1000]); return sp(`${fr(c / 10)} × ${p} = ?`, fr((c * p) / 10), 'Décale la virgule vers la droite d’autant de rangs que de zéros.', `${fr(c / 10)} × ${p} = ${fr((c * p) / 10)}.`, 'Nombres décimaux'); },
  () => { const n = 2 * rand(6, 100); const half = Math.random() < 0.5; return sp(half ? `La moitié de ${n} = ?` : `Le double de ${n / 2} = ?`, half ? n / 2 : n, half ? 'Divise par 2.' : 'Multiplie par 2.', half ? `${n} ÷ 2 = ${n / 2}.` : `${n / 2} × 2 = ${n}.`, 'Calcul mental'); },
  () => { const a = rand(2, 10); const q = rand(2, 10); return sp(`${a * q} ÷ ${a} = ?`, q, `Dans la table de ${a}, quel nombre donne ${a * q} ?`, `${a} × ${q} = ${a * q}, donc ${a * q} ÷ ${a} = ${q}.`, 'Tables de multiplication'); },
  () => { const k = rand(1, 25); return sp(`Le quart de ${4 * k} = ?`, k, 'Le quart, c’est la moitié de la moitié.', `${4 * k} ÷ 4 = ${k}.`, 'Fractions'); },
  () => { const t = rand(1, 9); return sp(`0,${t} + 0,${10 - t} = ?`, 1, 'Compte les dixièmes.', `${t} dixième${t > 1 ? 's' : ''} + ${10 - t} dixième${10 - t > 1 ? 's' : ''} = 10 dixièmes = 1.`, 'Nombres décimaux'); }
];

const SPRINT_5 = [
  () => { const a = rand(-15, 15) || 3; const b = rand(-15, 15) || -5; return sp(`${par(a)} + ${par(b)} = ?`, a + b, 'Même signe : on additionne ; signes contraires : on soustrait les distances à zéro.', explAdd(a, b), 'Nombres relatifs'); },
  () => { const a = rand(1, 9); const b = rand(2, 9); const c = rand(2, 9); return sp(`${a} + ${b} × ${c} = ?`, a + b * c, 'La multiplication est prioritaire.', `${b} × ${c} = ${b * c}, puis ${a} + ${b * c} = ${a + b * c}.`, 'Priorités opératoires'); },
  () => { const d = pick([2, 3, 4, 5, 10]); const N = d * rand(2, 12); return sp(`1/${d} de ${N} = ?`, N / d, `Divise par ${d}.`, `${N} ÷ ${d} = ${N / d}.`, 'Fractions'); },
  () => { const t = pick([10, 25, 50]); const N = 4 * rand(2, 30) * (t === 10 ? 5 : 1); return sp(`${t} % de ${N} = ?`, (t * N) / 100, t === 10 ? 'Divise par 10.' : t === 25 ? 'Prends le quart.' : 'Prends la moitié.', `${t} % de ${N} = ${(t * N) / 100}.`, 'Pourcentages'); },
  () => { const n = rand(2, 15); return sp(`${n}² = ?`, n * n, `${n}², c’est ${n} × ${n}.`, `${n} × ${n} = ${n * n}.`, 'Carrés'); },
  () => { const m = rand(1, 60) * 5; return sp(`${m} cm = ? m`, fr(m / 100), '1 m = 100 cm.', `${m} ÷ 100 = ${fr(m / 100)} m.`, 'Conversions'); },
  () => { const a = rand(-12, 12) || 4; const b = rand(-12, 12) || 7; return sp(`${par(a)} - ${par(b)} = ?`, a - b, 'Soustraire, c’est ajouter l’opposé.', `${par(a)} - ${par(b)} = ${par(a)} + ${par(-b)} = ${a - b}.`, 'Nombres relatifs'); }
];

const SPRINT_4 = [
  () => { const n = rand(0, 10); return sp(`2${sup(n)} = ?`, 2 ** n, 'Double à chaque fois : 1, 2, 4, 8…', `2${sup(n)} = ${2 ** n}.`, 'Puissances'); },
  () => { const n = rand(1, 4); return sp(`10${sup(-n)} = ? (écriture décimale)`, fr(10 ** -n, 4), `10⁻ⁿ = 1/10ⁿ : la virgule se place pour que le 1 soit au ${n}ᵉ rang après la virgule.`, `10${sup(-n)} = ${fr(10 ** -n, 4)}.`, 'Puissances'); },
  () => { const a = pick([-1, 1]) * rand(2, 9); const b = pick([-1, 1]) * rand(2, 9); return sp(`${par(a)} × ${par(b)} = ?`, a * b, 'Règle des signes !', `${par(a)} × ${par(b)} = ${a * b}.`, 'Nombres relatifs'); },
  () => { const x = rand(-10, 10); const a = rand(1, 20); return sp(`x + ${a} = ${x + a}. x = ?`, x, `Soustrais ${a} des deux côtés.`, `x = ${x + a} - ${a} = ${x}.`, 'Équations'); },
  () => { const x = rand(-9, 9) || 2; const a = rand(2, 9); return sp(`${a}x = ${a * x}. x = ?`, x, `Divise les deux membres par ${a}.`, `x = ${a * x} ÷ ${a} = ${x}.`, 'Équations'); },
  () => { const n = rand(2, 15); return sp(`√${n * n} = ?`, n, 'Quel nombre positif, multiplié par lui-même, donne ce résultat ?', `${n} × ${n} = ${n * n}, donc √${n * n} = ${n}.`, 'Racines carrées'); },
  () => { const a = rand(1, 5); const b = rand(2, 6); const c = rand(1, 5); const d = rand(2, 6); return sp(`${a}/${b} × ${c}/${d} = ? (fraction)`, fracForms(a * c, b * d), 'Numérateurs ensemble, dénominateurs ensemble.', `${a * c}/${b * d}${simp(a * c, b * d) !== `${a * c}/${b * d}` ? ` = ${simp(a * c, b * d)}` : ''}.`, 'Fractions'); },
  () => { const t = pick([10, 20, 25, 50]); const P = 20 * rand(1, 15); return sp(`Un article à ${P} € est soldé à -${t} %. Nouveau prix (€) ?`, P - (P * t) / 100, `Calcule ${t} % de ${P}, puis retire-le.`, `${P} - ${(P * t) / 100} = ${P - (P * t) / 100} €.`, 'Pourcentages'); }
];

const SPRINT_3 = [
  () => { const x = rand(-10, 10); const a = pick([-1, 1]) * rand(2, 6); const b = rand(-9, 9) || 3; return sp(`${lin(a, b)} = ${a * x + b}. x = ?`, x, 'Retire le nombre, puis divise par le coefficient de x.', `${a}x = ${a * x + b} - ${par(b)} = ${a * x}, x = ${a * x} ÷ ${par(a)} = ${x}.`, 'Équations'); },
  () => { const a = pick([-1, 1]) * rand(1, 6); const b = rand(-9, 9); const x = rand(-5, 5); return sp(`f(x) = ${lin(a, b)}. f(${x}) = ?`, a * x + b, 'Remplace x.', `f(${x}) = ${a} × ${par(x)} + ${par(b)} = ${a * x + b}.`, 'Fonctions'); },
  () => { const g = rand(2, 12); let p; let q; do { p = rand(1, 6); q = rand(2, 7); } while (p === q || gcd(p, q) !== 1); return sp(`PGCD(${g * p} ; ${g * q}) = ?`, g, 'Cherche le plus grand diviseur commun.', `${g * p} = ${g} × ${p} et ${g * q} = ${g} × ${q} : PGCD = ${g}.`, 'Arithmétique'); },
  () => { const m = rand(-6, 6); const n = rand(-6, 6); return sp(`10${sup(m)} × 10${sup(n)} = 10 puissance ?`, m + n, 'Additionne les exposants.', `${m} + ${par(n)} = ${m + n}.`, 'Puissances'); },
  () => { const t = pick([5, 10, 20, 25, 30, 50]); const up = Math.random() < 0.5; return sp(`${up ? 'Hausse' : 'Baisse'} de ${t} % : coefficient multiplicateur = ?`, fr(up ? 1 + t / 100 : 1 - t / 100), `1 ${up ? '+' : '-'} ${t}/100.`, `1 ${up ? '+' : '-'} ${fr(t / 100)} = ${fr(up ? 1 + t / 100 : 1 - t / 100)}.`, 'Pourcentages'); },
  () => { const n = rand(2, 20); return sp(`√${n * n} = ?`, n, 'Pense aux carrés parfaits.', `${n}² = ${n * n}, donc √${n * n} = ${n}.`, 'Racines carrées'); },
  () => { const a = rand(1, 9); return sp(`(x + ${a})² = x² + ?x + ${a * a}. Coefficient de x ?`, 2 * a, 'Le double produit : 2 × x × b.', `2 × ${a} = ${2 * a} : (x + ${a})² = x² + ${2 * a}x + ${a * a}.`, 'Identités remarquables'); },
  () => { const n = pick([2, 4, 5, 10]); const k = rand(1, n - 1); return sp(`Urne de ${n} boules dont ${k} gagnante${k > 1 ? "s" : ""}. P(gagnante) = ? (décimal)`, fracForms(k, n), 'Issues favorables ÷ issues possibles.', `P = ${k}/${n} = ${fr(k / n, 3)}.`, 'Probabilités'); }
];

// =====================================================================
// EXPORTS
// =====================================================================

export const MATHS_SCIENCES = {
  '6eme': {
    maths: { generators: maths6, flashcards: maths6Cards },
    sciences: { generators: sciences6, flashcards: sciences6Cards }
  },
  '5eme': {
    maths: { generators: maths5, flashcards: maths5Cards },
    svt: { generators: svt5, flashcards: svt5Cards },
    physique: { generators: physique5, flashcards: physique5Cards },
    techno: { generators: techno5, flashcards: techno5Cards }
  },
  '4eme': {
    maths: { generators: maths4, flashcards: maths4Cards },
    svt: { generators: svt4, flashcards: svt4Cards },
    physique: { generators: physique4, flashcards: physique4Cards },
    techno: { generators: techno4, flashcards: techno4Cards }
  },
  '3eme': {
    maths: { generators: maths3, flashcards: maths3Cards },
    sciences: { generators: sciences3, flashcards: sciences3Cards },
    pix: { generators: pix3, flashcards: pix3Cards }
  }
};

export const SPRINT = { '6eme': SPRINT_6, '5eme': SPRINT_5, '4eme': SPRINT_4, '3eme': SPRINT_3 };
