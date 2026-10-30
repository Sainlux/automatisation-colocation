// Contenu pédagogique « Lettres, Histoire-Géo-EMC, Langues, Arts, EPS, Oral DNB »
// pour Prep'Collège 2026 (programmes des cycles 3 et 4).
// Module ES sans dépendance hors ./util.js (navigateur et Node).
//
// Organisation : 1) outils internes et moteurs combinatoires (conjugaison,
// homophones, accords, langues) ; 2) contenus regroupés par niveau puis par matière.

import { rand, pick, shuffle, qcm, input, fromBank } from './util.js';

/* ======================================================================
 * 1. OUTILS INTERNES
 * ==================================================================== */

// Flashcards compactes : [recto, verso].
const cards = (skill, rows) => rows.map(([front, back]) => ({ front, back, skill }));

// Banque QCM compacte : [question, bonne réponse, [distracteurs], explication, indice facultatif].
const bank = (skill, hint, rows) =>
  fromBank(rows.map(([q, a, w, exp, h]) => ({ q, a, w, exp, hint: h || hint })), skill);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Repères chronologiques : rows = [événement, date affichée, contexte].
function chrono(skill, rows) {
  return () => {
    const [ev, date, ctx] = pick(rows);
    const others = shuffle(rows.filter((r) => r[1] !== date));
    if (Math.random() < 0.5) {
      return qcm({
        prompt: `Repère chronologique : quelle date correspond à cet événement ?\n${ev}`,
        answer: date,
        wrong: others.map((r) => r[1]).slice(0, 3),
        hint: "Situe d'abord la période (siècle, avant ou après un grand tournant), puis élimine les dates trop anciennes ou trop récentes.",
        explanation: `${ev} : ${date}. ${ctx}`,
        skill
      });
    }
    return qcm({
      prompt: `Repère chronologique : quel événement se situe à cette date ?\n${date}`,
      answer: ev,
      wrong: others.map((r) => r[0]).slice(0, 3),
      hint: 'Rappelle-toi la frise du cours : quels événements appartiennent à la même période que cette date ?',
      explanation: `${date} : ${ev}. ${ctx}`,
      skill
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.a Moteur de conjugaison française (tables exactes)
 * -------------------------------------------------------------------- */

const T_PRES1 = ['e', 'es', 'e', 'ons', 'ez', 'ent'];
const T_IMP = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
const T_FUT = ['ai', 'as', 'a', 'ons', 'ez', 'ont'];
const T_SUBJ = ['e', 'es', 'e', 'ions', 'iez', 'ent'];
const T_PS = {
  a: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'],
  i: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'],
  u: ['us', 'us', 'ut', 'ûmes', 'ûtes', 'urent'],
  in: ['ins', 'ins', 'int', 'înmes', 'întes', 'inrent']
};

const g1 = (inf, etre = false) => {
  const r = inf.slice(0, -2);
  return { inf, grp: 1, pres: T_PRES1.map((e) => r + e), fut: inf, ps: [r, 'a'], pp: r + 'é', etre };
};
const g2 = (inf) => {
  const r = inf.slice(0, -2);
  return { inf, grp: 2, pres: ['is', 'is', 'it', 'issons', 'issez', 'issent'].map((e) => r + e), fut: inf, ps: [r, 'i'], pp: r + 'i' };
};
const irr = (inf, pres, fut, ps, pp, extra = {}) => ({
  inf, grp: 3, pres: pres.split(' '), fut, ps, pp, ...extra, subj: extra.subj ? extra.subj.split(' ') : null
});

const VERBS = {
  chanter: g1('chanter'), parler: g1('parler'), aimer: g1('aimer'), jouer: g1('jouer'),
  regarder: g1('regarder'), écouter: g1('écouter'), danser: g1('danser'), travailler: g1('travailler'),
  donner: g1('donner'), trouver: g1('trouver'),
  arriver: g1('arriver', true), tomber: g1('tomber', true), rester: g1('rester', true),
  finir: g2('finir'), choisir: g2('choisir'), grandir: g2('grandir'), réussir: g2('réussir'), remplir: g2('remplir'),
  être: irr('être', 'suis es est sommes êtes sont', 'ser', ['f', 'u'], 'été', { imp: 'ét', subj: 'sois sois soit soyons soyez soient' }),
  avoir: irr('avoir', 'ai as a avons avez ont', 'aur', ['e', 'u'], 'eu', { subj: 'aie aies ait ayons ayez aient' }),
  aller: irr('aller', 'vais vas va allons allez vont', 'ir', ['all', 'a'], 'allé', { etre: true, subj: 'aille ailles aille allions alliez aillent' }),
  faire: irr('faire', 'fais fais fait faisons faites font', 'fer', ['f', 'i'], 'fait', { subj: 'fasse fasses fasse fassions fassiez fassent' }),
  dire: irr('dire', 'dis dis dit disons dites disent', 'dir', ['d', 'i'], 'dit'),
  venir: irr('venir', 'viens viens vient venons venez viennent', 'viendr', ['v', 'in'], 'venu', { etre: true, subj: 'vienne viennes vienne venions veniez viennent' }),
  prendre: irr('prendre', 'prends prends prend prenons prenez prennent', 'prendr', ['pr', 'i'], 'pris', { subj: 'prenne prennes prenne prenions preniez prennent' }),
  pouvoir: irr('pouvoir', 'peux peux peut pouvons pouvez peuvent', 'pourr', ['p', 'u'], 'pu', { subj: 'puisse puisses puisse puissions puissiez puissent' }),
  vouloir: irr('vouloir', 'veux veux veut voulons voulez veulent', 'voudr', ['voul', 'u'], 'voulu', { subj: 'veuille veuilles veuille voulions vouliez veuillent' }),
  voir: irr('voir', 'vois vois voit voyons voyez voient', 'verr', ['v', 'i'], 'vu', { subj: 'voie voies voie voyions voyiez voient' }),
  savoir: irr('savoir', 'sais sais sait savons savez savent', 'saur', ['s', 'u'], 'su', { subj: 'sache saches sache sachions sachiez sachent' }),
  devoir: irr('devoir', 'dois dois doit devons devez doivent', 'devr', ['d', 'u'], 'dû', { subj: 'doive doives doive devions deviez doivent' }),
  mettre: irr('mettre', 'mets mets met mettons mettez mettent', 'mettr', ['m', 'i'], 'mis')
};

const V_G1 = ['chanter', 'parler', 'aimer', 'jouer', 'regarder', 'écouter', 'danser', 'travailler', 'donner', 'trouver', 'arriver', 'tomber', 'rester'];
const V_G2 = ['finir', 'choisir', 'grandir', 'réussir', 'remplir'];
const V_6 = [...V_G1, ...V_G2, 'être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'pouvoir', 'vouloir', 'voir'];
const V_ALL = Object.keys(VERBS);

const TENSES = {
  present: { name: "présent de l'indicatif", au: "au présent de l'indicatif" },
  imparfait: { name: "imparfait de l'indicatif", au: "à l'imparfait de l'indicatif" },
  futur: { name: 'futur simple', au: 'au futur simple' },
  passe_simple: { name: 'passé simple', au: 'au passé simple' },
  conditionnel: { name: 'conditionnel présent', au: 'au conditionnel présent' },
  passe_compose: { name: 'passé composé', au: 'au passé composé' },
  pqp: { name: 'plus-que-parfait', au: 'au plus-que-parfait' },
  subjonctif: { name: 'subjonctif présent', au: 'au subjonctif présent' }
};
const COMPOUND = ['passe_compose', 'pqp'];

const RULES = {
  present: 'Au présent, le 1er groupe prend -e, -es, -e, -ons, -ez, -ent ; le 2e groupe prend -is, -is, -it, -issons, -issez, -issent ; les verbes du 3e groupe sont à apprendre par cœur.',
  imparfait: "L'imparfait se forme sur le radical de « nous » au présent (sans -ons) + -ais, -ais, -ait, -ions, -iez, -aient. Seul « être » fait exception (radical ét-).",
  futur: 'Le futur simple = infinitif (ou radical irrégulier : ser-, aur-, ir-, fer-, viendr-, pourr-, voudr-, verr-, saur-, devr-…) + -ai, -as, -a, -ons, -ez, -ont.',
  passe_simple: 'Le passé simple a quatre types de terminaisons : en -a (1er groupe : -ai, -as, -a, -âmes, -âtes, -èrent), en -i (-is, -is, -it, -îmes, -îtes, -irent), en -u (-us, -us, -ut, -ûmes, -ûtes, -urent) et en -in (venir : je vins). Note l’accent circonflexe à « nous » et « vous ».',
  conditionnel: 'Le conditionnel présent = radical du futur + terminaisons de l’imparfait (-ais, -ais, -ait, -ions, -iez, -aient).',
  passe_compose: 'Le passé composé = auxiliaire « avoir » ou « être » au présent + participe passé. Avec « être », le participe s’accorde avec le sujet.',
  pqp: 'Le plus-que-parfait = auxiliaire « avoir » ou « être » à l’imparfait + participe passé. Avec « être », le participe s’accorde avec le sujet.',
  subjonctif: 'Le subjonctif présent se forme sur le radical de « ils » au présent (sans -ent) + -e, -es, -e, -ions, -iez, -ent. Les verbes être, avoir, aller, faire, pouvoir, vouloir, savoir, venir, prendre, voir, devoir ont des formes à mémoriser.'
};

const TENSE_HINT = {
  present: {
    1: 'Verbe du 1er groupe : garde le radical (l’infinitif sans -er) et choisis la terminaison qui va avec le pronom.',
    2: 'Verbe du 2e groupe : pense au « -iss- » qui apparaît au pluriel.',
    3: 'Verbe irrégulier : récite mentalement toute la conjugaison en commençant par « je ».'
  },
  imparfait: 'Pars de la forme « nous » au présent, enlève -ons et ajoute la terminaison de l’imparfait.',
  futur: 'Cherche le radical du futur (souvent l’infinitif), puis ajoute la terminaison qui va avec le pronom.',
  passe_simple: 'Demande-toi si le verbe fait son passé simple en -a, en -i, en -u ou en -in, et pense à l’accent circonflexe avec « nous » et « vous ».',
  conditionnel: 'Même radical qu’au futur, mais avec les terminaisons de l’imparfait.',
  passe_compose: 'Choisis d’abord le bon auxiliaire (avoir ou être) au présent, puis le participe passé ; avec « être », pense à l’accord.',
  pqp: 'Auxiliaire à l’imparfait + participe passé ; avec « être », pense à l’accord avec le sujet.',
  subjonctif: 'Pars de « ils … -ent » au présent pour trouver le radical, sauf si le verbe fait partie des irréguliers à connaître par cœur.'
};

// Personnes (genre précisé à la 3e personne pour l'accord du participe).
const PERS = [
  { i: 0, p: 'je' }, { i: 1, p: 'tu' }, { i: 2, p: 'il' }, { i: 2, p: 'elle' },
  { i: 3, p: 'nous' }, { i: 4, p: 'vous' }, { i: 5, p: 'ils' }, { i: 5, p: 'elles' }
];
const P6 = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

const sujet = (p, form) => (p.startsWith('je') && /^[aeiouyhâàéèêîôû]/.test(form) ? "j'" + form : p + ' ' + form);
const withQue = (s) => (/^[aeiouy]/.test(s) ? "qu'" + s : 'que ' + s);

function simple(v, t, i) {
  switch (t) {
    case 'present': return v.pres[i];
    case 'imparfait': return (v.imp || v.pres[3].slice(0, -3)) + T_IMP[i];
    case 'futur': return v.fut + T_FUT[i];
    case 'conditionnel': return v.fut + T_IMP[i];
    case 'passe_simple': return v.ps[0] + T_PS[v.ps[1]][i];
    case 'subjonctif': return v.subj ? v.subj[i] : v.pres[5].slice(0, -3) + T_SUBJ[i];
    default: throw new Error('Temps inconnu : ' + t);
  }
}

// Toutes les formes acceptées (la première est la forme de référence).
function formsOf(v, t, pers) {
  if (!COMPOUND.includes(t)) return [simple(v, t, pers.i)];
  const aux = simple(v.etre ? VERBS.être : VERBS.avoir, t === 'passe_compose' ? 'present' : 'imparfait', pers.i);
  if (!v.etre) return [aux + ' ' + v.pp];
  const endings = { il: [''], elle: ['e'], ils: ['s'], elles: ['es'], je: ['', 'e'], tu: ['', 'e'], nous: ['s', 'es'], vous: ['s', 'es', '', 'e'] }[pers.p];
  return endings.map((e) => aux + ' ' + v.pp + e);
}

const full = (t, p, form) => (t === 'subjonctif' ? withQue(sujet(p, form)) : sujet(p, form));

function tableOf(v, t) {
  return P6.map((p, i) => {
    let f;
    if (COMPOUND.includes(t)) {
      const aux = simple(v.etre ? VERBS.être : VERBS.avoir, t === 'passe_compose' ? 'present' : 'imparfait', i);
      f = aux + ' ' + v.pp + (v.etre ? ['(e)', '(e)', '(e)', '(e)s', '(e)(s)', '(e)s'][i] : '');
    } else f = simple(v, t, i);
    return full(t, p, f);
  }).join(', ');
}

function conjHint(v, t) {
  const h = TENSE_HINT[t];
  return typeof h === 'string' ? h : h[v.grp];
}

// Générateur de conjugaison (verbe × temps × personne). qcmTenses : temps proposés en QCM.
function genConj(verbs, tenses, qcmTenses = []) {
  return () => {
    const name = pick(verbs), v = VERBS[name], t = pick(tenses), pers = pick(PERS);
    const forms = formsOf(v, t, pers);
    const T = TENSES[t];
    const groupe = v.grp === 3 ? '3e groupe (irrégulier)' : v.grp + 'e groupe';
    const fullAns = full(t, pers.p, forms[0]);
    const accord = v.etre && COMPOUND.includes(t)
      ? ` « ${v.inf} » se conjugue avec l’auxiliaire « être » : le participe passé s’accorde avec le sujet (${forms.join(' ou ')}).`
      : '';
    const explanation = `« ${v.inf} » (${groupe}) ${T.au} : ${tableOf(v, t)}.\nAvec « ${pers.p} », on écrit donc « ${fullAns} ».${accord}\nRègle : ${RULES[t]}`;
    const skill = 'Conjugaison : ' + T.name;
    if (qcmTenses.includes(t) || Math.random() < 0.25) {
      const others = Object.keys(TENSES).filter((x) => x !== t && !(x === 'subjonctif' && !tenses.includes('subjonctif')));
      const pool = [
        ...shuffle(others).map((x) => formsOf(v, x, pers)[0]),
        ...shuffle([0, 1, 2, 3, 4, 5].filter((i) => i !== pers.i)).map((i) => formsOf(v, t, { ...pers, i })[0])
      ].filter((f) => !forms.includes(f));
      const wrong = shuffle([...new Set(pool)]).slice(0, 3).map((f) => full(t, pers.p, f));
      return qcm({
        prompt: `Quelle est la forme correcte du verbe « ${v.inf} » ${T.au}, avec le sujet « ${pers.p} » ?`,
        answer: fullAns, wrong, hint: conjHint(v, t), explanation, skill
      });
    }
    const answers = [];
    forms.forEach((f) => answers.push(f, full(t, pers.p, f)));
    return input({
      prompt: `Conjugue le verbe « ${v.inf} » ${T.au}, avec le sujet « ${pers.p} ».\nÉcris seulement la forme verbale${COMPOUND.includes(t) ? ' (auxiliaire + participe passé)' : ''}, sans le pronom.`,
      answer: [...new Set(answers)], hint: conjHint(v, t), explanation, skill
    });
  };
}

// « À quel temps est conjugué ce verbe ? » (on évite les formes ambiguës, ex. « je finis »).
function genTenseId(verbs, tenses) {
  return () => {
    for (let k = 0; k < 40; k++) {
      const v = VERBS[pick(verbs)], t = pick(tenses), pers = pick(PERS);
      const form = formsOf(v, t, pers)[0];
      const clash = Object.keys(TENSES).some((x) => x !== t && formsOf(v, x, pers).includes(form));
      if (clash) continue;
      const shown = t === 'subjonctif' ? `Il faut ${full(t, pers.p, form)}` : cap(sujet(pers.p, form));
      return qcm({
        prompt: `À quel temps le verbe « ${v.inf} » est-il conjugué ?\n« ${shown} »`,
        answer: TENSES[t].name,
        wrong: shuffle(tenses.filter((x) => x !== t)).map((x) => TENSES[x].name),
        hint: 'Observe la terminaison, puis demande-toi s’il y a un auxiliaire (temps composé) ou non (temps simple).',
        explanation: `« ${shown} » est ${TENSES[t].au.replace(/^au |^à l’|^à l'/, (m) => (m === 'au ' ? 'au ' : "à l'"))}.\nTable complète : ${tableOf(v, t)}.\n${RULES[t]}`,
        skill: 'Reconnaître les temps'
      });
    }
    return genTenseId(verbs, ['futur', 'imparfait'])();
  };
}

// Réécriture (type DNB) : changer le temps d'une phrase.
const REWRITE = [
  ['prendre', 'le bus pour rentrer'], ['faire', 'une promenade au parc'], ['aller', 'au marché'],
  ['voir', 'un film au cinéma'], ['finir', 'les exercices'], ['venir', 'à la fête'],
  ['chanter', 'une chanson'], ['dire', 'la vérité'], ['arriver', 'en avance'], ['mettre', 'la table'],
  ['choisir', 'un livre'], ['vouloir', 'un dessert']
];
function genRewrite(targets) {
  return () => {
    const [inf, comp] = pick(REWRITE), v = VERBS[inf], pers = pick(PERS), t = pick(targets);
    const src = cap(sujet(pers.p, formsOf(v, 'present', pers)[0])) + ' ' + comp + '.';
    const mk = (x) => cap(sujet(pers.p, formsOf(v, x, pers)[0])) + ' ' + comp + '.';
    const ans = mk(t);
    const wrong = shuffle(['imparfait', 'futur', 'passe_simple', 'conditionnel', 'passe_compose', 'pqp'].filter((x) => x !== t)).map(mk);
    return qcm({
      prompt: `Réécriture : réécris la phrase ${TENSES[t].au}.\n« ${src} »`,
      answer: ans, wrong,
      hint: `Repère le verbe conjugué, garde le même sujet et pense aux marques ${TENSES[t].au}.`,
      explanation: `Le verbe est « ${inf} ». ${cap(TENSES[t].au)}, avec « ${pers.p} » : « ${ans} »\n${RULES[t]}\nÀ l’épreuve de réécriture du DNB, chaque modification oubliée coûte des points : vérifie toujours tous les verbes et les accords.`,
      skill: 'Réécriture'
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.b Homophones grammaticaux (deux phrases à compléter → 4 combinaisons)
 * -------------------------------------------------------------------- */

const HOMO = {
  'a/à': {
    why: { a: '« a » est le verbe avoir : on peut le remplacer par « avait »', à: '« à » est une préposition : on ne peut pas le remplacer par « avait »' },
    items: [['Mon frère ___ un nouveau vélo.', 'a'], ['Nous partons ___ la montagne.', 'à'], ['Elle ___ oublié son cahier.', 'a'], ["J'ai mal ___ la tête.", 'à'], ["Il ___ dix ans aujourd'hui.", 'a'], ['C’est une machine ___ laver.', 'à'], ['Le chat ___ faim.', 'a'], ['Je pense ___ toi.', 'à']]
  },
  'et/est': {
    why: { et: '« et » est une conjonction de coordination : on peut dire « et puis »', est: '« est » est le verbe être : on peut le remplacer par « était »' },
    items: [['Le ciel ___ tout bleu.', 'est'], ["J'aime les pommes ___ les poires.", 'et'], ['Mon cousin ___ très drôle.', 'est'], ['Il prend son sac ___ il part.', 'et'], ['Cette histoire ___ passionnante.', 'est'], ['Le chien ___ le chat dorment.', 'et']]
  },
  'son/sont': {
    why: { son: '« son » est un déterminant possessif : on peut dire « mon » ou « ton »', sont: '« sont » est le verbe être : on peut le remplacer par « étaient »' },
    items: [['Les enfants ___ dans la cour.', 'sont'], ['Paul range ___ cartable.', 'son'], ['Mes amis ___ en retard.', 'sont'], ['Elle a perdu ___ parapluie.', 'son'], ['Ces gâteaux ___ délicieux.', 'sont'], ['Le chevalier saisit ___ épée.', 'son']]
  },
  'on/ont': {
    why: { on: '« on » est un pronom sujet : on peut le remplacer par « il »', ont: '« ont » est le verbe avoir : on peut le remplacer par « avaient »' },
    items: [['Mes voisins ___ un grand jardin.', 'ont'], ['Ce soir, ___ regarde un film.', 'on'], ['Les élèves ___ fini leurs exercices.', 'ont'], ['Dans ce village, ___ cultive des tomates.', 'on'], ["Ils ___ peur de l'orage.", 'ont'], ['Demain, ___ partira tôt.', 'on']]
  },
  'ou/où': {
    why: { ou: '« ou » marque un choix : on peut dire « ou bien »', où: '« où » indique le lieu ou le moment : on ne peut pas dire « ou bien »' },
    items: [['Veux-tu du thé ___ du chocolat ?', 'ou'], ['La ville ___ je suis né est petite.', 'où'], ['Tu viens ce soir ___ demain ?', 'ou'], ["Je ne sais pas ___ j'ai rangé mes clés.", 'où'], ['Le jour ___ il est arrivé, il pleuvait.', 'où'], ['Rouge ___ vert, choisis une couleur.', 'ou']]
  },
  'ces/ses': {
    why: { ces: '« ces » est un déterminant démonstratif : on peut ajouter « -là » après le nom', ses: '« ses » est un déterminant possessif : les objets sont « les siens »' },
    items: [['Lucas a rangé ___ jouets dans sa chambre.', 'ses'], ['Regarde ___ nuages noirs là-bas !', 'ces'], ['Elle a invité tous ___ amis.', 'ses'], ["Qui a laissé ___ chaussures dans l'entrée ?", 'ces'], ['Le roi parle à ___ soldats.', 'ses'], ["J'adore ___ chansons-là.", 'ces']]
  },
  "ces/ses/c'est/s'est": {
    why: {
      ces: '« ces » est un déterminant démonstratif : on peut ajouter « -là » après le nom', ses: '« ses » est un déterminant possessif : les objets sont « les siens »',
      "c'est": '« c’est » signifie « cela est » : on peut dire « c’était »', "s'est": '« s’est » appartient à un verbe pronominal au passé composé : on peut dire « je me suis »'
    },
    items: [['Je crois que ___ la bonne réponse.', "c'est"], ['Le chat ___ caché sous le lit.', "s'est"], ['Elle ___ levée très tôt.', "s'est"], ['Regarde, ___ ton tour !', "c'est"], ['Le roi parle à ___ soldats.', 'ses'], ['Regarde ___ nuages noirs là-bas !', 'ces']]
  },
  "la/là/l'a": {
    why: { la: '« la » est un déterminant ou un pronom : on peut dire « une » ou « le »', là: '« là » indique un lieu : on peut dire « ici »', "l'a": '« l’a » = pronom + verbe avoir : on peut dire « l’avait »' },
    items: [['Pose ton sac ___, près de la porte.', 'là'], ['Cette lettre, il ___ écrite hier.', "l'a"], ['Je range ___ vaisselle.', 'la'], ['Ce film, Emma ___ déjà vu.', "l'a"], ['Ton livre est ___, sur la table.', 'là'], ['Elle ouvre ___ fenêtre.', 'la']]
  },
  'ce/se': {
    why: { ce: '« ce » est un démonstratif : on peut dire « cela » ou « ce …-ci »', se: '« se » est un pronom réfléchi devant un verbe : on peut dire « me » en changeant de personne' },
    items: [['Il ___ lave les mains.', 'se'], ["J'aime beaucoup ___ dessin.", 'ce'], ['Les enfants ___ réveillent tôt.', 'se'], ['Tout ___ que tu dis est vrai.', 'ce'], ['Elle ___ promène au bord du lac.', 'se'], ['Prends ___ crayon bleu.', 'ce']]
  },
  'peu/peut/peux': {
    why: { peu: '« peu » est un adverbe qui signifie « pas beaucoup »', peut: '« peut » est le verbe pouvoir avec « il, elle, on » : on peut dire « pouvait »', peux: '« peux » est le verbe pouvoir avec « je » ou « tu »' },
    items: [['Il ___ venir avec nous.', 'peut'], ['Tu ___ m’aider ?', 'peux'], ["J'ai ___ dormi cette nuit.", 'peu'], ['Je ne ___ pas sortir ce soir.', 'peux'], ['Elle mange très ___ le matin.', 'peu'], ['On ___ commencer.', 'peut']]
  },
  'leur/leurs': {
    why: { leur: '« leur » est un pronom devant un verbe (= « à eux ») ou un déterminant devant un nom singulier', leurs: '« leurs » est un déterminant devant un nom au pluriel' },
    items: [['Je ___ ai donné mon adresse.', 'leur'], ['Les élèves rangent ___ affaires.', 'leurs'], ['Ils ont vendu ___ maison.', 'leur'], ['Les oiseaux nourrissent ___ petits.', 'leurs'], ['Dis-___ de venir.', 'leur'], ['Mes voisins promènent ___ chiens.', 'leurs']]
  },
  "quand/quant/qu'en": {
    why: { quand: '« quand » indique le temps : on peut dire « lorsque »', quant: '« quant » est toujours suivi de « à, au, aux » : il signifie « en ce qui concerne »', "qu'en": '« qu’en » = « que » + « en » : il précède un verbe ou un nom' },
    items: [['Appelle-moi ___ tu arrives.', 'quand'], ['Mes parents partent ; ___ à moi, je reste.', 'quant'], ['Elle ne parle ___ anglais avec lui.', "qu'en"], ["Je lis ___ j'ai du temps.", 'quand'], ['Il est d’accord ; ___ aux autres, ils hésitent.', 'quant'], ['Ce problème ne se résoudra ___ discutant.', "qu'en"]]
  },
  "ni/n'y": {
    why: { ni: '« ni » est une conjonction de négation qui s’emploie en série (ni… ni…)', "n'y": '« n’y » = « ne » + « y » (= « à cela », « là-bas »)' },
    items: [['Il ___ va jamais le dimanche.', "n'y"], ["Je n'aime ___ les épinards ni les endives.", 'ni'], ['Elle ___ pense plus.', "n'y"], ["Ce n'est ___ juste ni raisonnable.", 'ni'], ['Nous ___ sommes pas allés.', "n'y"], ['Il ne parle ___ anglais ni espagnol.', 'ni']]
  },
  "sans/s'en": {
    why: { sans: '« sans » est une préposition, contraire de « avec »', "s'en": '« s’en » = pronoms « se » + « en » devant un verbe : on peut dire « je m’en »' },
    items: [['Il est parti ___ son manteau.', 'sans'], ['Elle ___ va tôt.', "s'en"], ['Il ___ souvient très bien.', "s'en"], ['Je bois mon thé ___ sucre.', 'sans'], ['Ils ___ moquent.', "s'en"], ['Il a réussi ___ effort.', 'sans']]
  },
  "quel/qu'elle": {
    why: {
      quel: '« quel » est un déterminant interrogatif accordé avec un nom masculin singulier', quelle: '« quelle » est un déterminant interrogatif accordé avec un nom féminin singulier',
      quels: '« quels » s’accorde avec un nom masculin pluriel', quelles: '« quelles » s’accorde avec un nom féminin pluriel',
      "qu'elle": '« qu’elle » = « que » + « elle » : on peut le remplacer par « qu’il »', "qu'elles": '« qu’elles » = « que » + « elles » : on peut le remplacer par « qu’ils »'
    },
    items: [['Dis-moi ___ heure il est.', 'quelle'], ['Je pense ___ viendra demain.', "qu'elle"], ['Tu sais ___ livres acheter ?', 'quels'], ['Il faut ___ se repose.', "qu'elle"], ['Je me demande ___ chaussures mettre.', 'quelles'], ['Mes sœurs ? Je crois ___ sont parties.', "qu'elles"], ['À ___ moment arrives-tu ?', 'quel']]
  }
};

function genHomophones(sets) {
  return () => {
    const name = pick(sets), set = HOMO[name], opts = Object.keys(set.why);
    const [s1, s2] = shuffle(set.items);
    const answer = `${s1[1]} / ${s2[1]}`;
    const combos = [];
    opts.forEach((a) => opts.forEach((b) => combos.push(`${a} / ${b}`)));
    return qcm({
      prompt: `Homophones (${opts.join(', ')}) : complète les deux phrases.\n1) ${s1[0]}\n2) ${s2[0]}\nRéponse dans l’ordre « phrase 1 / phrase 2 ».`,
      answer,
      wrong: shuffle(combos.filter((c) => c !== answer)).slice(0, 3),
      hint: 'Fais le test du remplacement : essaie de mettre l’imparfait (avait, était…) ou un autre mot à la place du blanc.',
      explanation: `1) « ${s1[0].replace('___', s1[1])} » : ${set.why[s1[1]]}.\n2) « ${s2[0].replace('___', s2[1])} » : ${set.why[s2[1]]}.`,
      skill: 'Homophones grammaticaux'
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.c Accords (adjectif, participe passé)
 * -------------------------------------------------------------------- */

const NOUNS = [
  ['un', 'manteau', 'm', false], ['une', 'robe', 'f', false], ['les', 'pantalons', 'm', true], ['les', 'chaussures', 'f', true],
  ['un', 'vélo', 'm', false], ['une', 'voiture', 'f', false], ['les', 'sacs', 'm', true], ['les', 'chemises', 'f', true],
  ['un', 'chapeau', 'm', false], ['une', 'écharpe', 'f', false]
];
const ADJS = [
  ['grand', 'grande', 'grands', 'grandes', true, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['petit', 'petite', 'petits', 'petites', true, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['joli', 'jolie', 'jolis', 'jolies', true, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['long', 'longue', 'longs', 'longues', true, 'Attention : « long » fait « longue » au féminin (on ajoute -ue).'],
  ['vert', 'verte', 'verts', 'vertes', false, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['noir', 'noire', 'noirs', 'noires', false, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['bleu', 'bleue', 'bleus', 'bleues', false, 'Adjectif régulier : on ajoute -e au féminin et -s au pluriel.'],
  ['blanc', 'blanche', 'blancs', 'blanches', false, 'Attention : « blanc » fait « blanche » au féminin.'],
  ['neuf', 'neuve', 'neufs', 'neuves', false, 'Les adjectifs en -f font leur féminin en -ve : neuf → neuve.'],
  ['léger', 'légère', 'légers', 'légères', false, 'Les adjectifs en -er font leur féminin en -ère : léger → légère.']
];
function genAccordAdj() {
  return () => {
    const [det, noun, g, pl] = pick(NOUNS), adj = pick(ADJS);
    const k = (g === 'f' ? 1 : 0) + (pl ? 2 : 0), ans = adj[k];
    const gp = `${g === 'f' ? 'féminin' : 'masculin'} ${pl ? 'pluriel' : 'singulier'}`;
    const show = (x) => (adj[4] ? `${det} ${x} ${noun}` : `${det} ${noun} ${x}`);
    return qcm({
      prompt: `Accorde l’adjectif « ${adj[0]} » :\n« ${show('___')} »`,
      answer: ans, wrong: adj.slice(0, 4).filter((x) => x !== ans),
      hint: 'Demande-toi si le nom est masculin ou féminin, singulier ou pluriel : l’adjectif prend le même genre et le même nombre.',
      explanation: `« ${noun} » est un nom ${gp}. L’adjectif qualificatif s’accorde en genre et en nombre avec le nom qu’il qualifie : « ${show(ans)} ». ${adj[5]}`,
      skill: "Accord de l'adjectif"
    });
  };
}

const PP_ETRE = [['partir', 'parti', 'en vacances'], ['arriver', 'arrivé', 'en retard'], ['sortir', 'sorti', 'très tôt'], ['tomber', 'tombé', 'dans l’escalier'], ['venir', 'venu', 'nous voir'], ['rester', 'resté', 'à la maison'], ['entrer', 'entré', 'dans la salle'], ['descendre', 'descendu', 'à la cave']];
const PP_SUJ = [['Ma sœur', 'f', false], ['Mon frère', 'm', false], ['Les filles', 'f', true], ['Les garçons', 'm', true], ['Léa et Hugo', 'm', true], ['Mes cousines', 'f', true], ['Notre voisine', 'f', false], ['Le facteur', 'm', false]];
const PP_COD = [['les pommes', 'f', true, 'manger', 'mangé'], ['la lettre', 'f', false, 'écrire', 'écrit'], ['les films', 'm', true, 'voir', 'vu'], ['la chanson', 'f', false, 'chanter', 'chanté'], ['les livres', 'm', true, 'lire', 'lu'], ['la tarte', 'f', false, 'préparer', 'préparé'], ['les fleurs', 'f', true, 'cueillir', 'cueilli'], ['le gâteau', 'm', false, 'finir', 'fini'], ['la robe', 'f', false, 'choisir', 'choisi'], ['les exercices', 'm', true, 'réussir', 'réussi']];
const accordEnd = (g, pl) => (g === 'f' ? 'e' : '') + (pl ? 's' : '');
const gpTxt = (g, pl) => `${g === 'f' ? 'féminin' : 'masculin'} ${pl ? 'pluriel' : 'singulier'}`;

function genAccordPP(modes) {
  return () => {
    const mode = pick(modes);
    let prompt, ans, base, exp;
    if (mode === 'etre') {
      const [inf, pp, ctx] = pick(PP_ETRE), [s, g, pl] = pick(PP_SUJ);
      base = pp; ans = pp + accordEnd(g, pl);
      prompt = `Complète avec le participe passé de « ${inf} » correctement accordé :\n« ${s} ${pl ? 'sont' : 'est'} ___ ${ctx}. »`;
      exp = `Avec l’auxiliaire « être », le participe passé s’accorde avec le sujet. Le sujet « ${s} » est ${gpTxt(g, pl)}${s.includes(' et ') ? ' (un masculin et un féminin ensemble donnent un masculin pluriel)' : ''} : on écrit « ${ans} ».`;
    } else {
      const [cod, g, pl, inf, pp] = pick(PP_COD);
      base = pp;
      if (mode === 'avoir') {
        ans = pp;
        prompt = `Complète avec le participe passé de « ${inf} » correctement accordé :\n« Léa a ___ ${cod}. »`;
        exp = `Avec l’auxiliaire « avoir », le participe passé ne s’accorde jamais avec le sujet. Ici le COD « ${cod} » est placé APRÈS le verbe : pas d’accord, on écrit « ${pp} ».`;
      } else if (mode === 'que') {
        ans = pp + accordEnd(g, pl);
        prompt = `Complète avec le participe passé de « ${inf} » correctement accordé :\n« Voici ${cod} que Léa a ___. »`;
        exp = `Avec « avoir », le participe passé s’accorde avec le COD s’il est placé AVANT le verbe. Ici le COD est « que », qui reprend « ${cod} » (${gpTxt(g, pl)}) : on écrit « ${ans} ».`;
      } else {
        ans = pp + accordEnd(g, pl);
        const pron = pl ? 'les' : "l'";
        prompt = `Complète avec le participe passé de « ${inf} » correctement accordé :\n« ${cap(cod)} ? Léa ${pron}${pl ? ' ' : ''}a ___. »`;
        exp = `Avec « avoir », le participe passé s’accorde avec le COD placé AVANT le verbe. Le pronom « ${pron} » reprend « ${cod} » (${gpTxt(g, pl)}) : on écrit « ${ans} ».`;
      }
    }
    return qcm({
      prompt, answer: ans, wrong: [base, base + 'e', base + 's', base + 'es'].filter((x) => x !== ans),
      hint: 'Repère l’auxiliaire. Avec « être », regarde le sujet ; avec « avoir », cherche s’il y a un COD placé avant le verbe.',
      explanation: exp, skill: 'Accord du participe passé'
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.d Grammaire : nature, fonction, figures de style (banques filtrées par niveau)
 * -------------------------------------------------------------------- */

const NATURES = ['nom commun', 'nom propre', 'verbe', 'adjectif qualificatif', 'déterminant', 'pronom', 'adverbe', 'préposition', 'conjonction de coordination', 'conjonction de subordination'];
// [niveau mini (6 à 3), phrase, mot, nature, justification]
const NATURE_BANK = [
  [6, 'Le petit chien aboie.', 'petit', 'adjectif qualificatif', 'il précise le nom « chien » et pourrait être supprimé ou remplacé par « grand ».'],
  [6, 'Le petit chien aboie.', 'aboie', 'verbe', 'il se conjugue (il aboyait, il aboiera) : c’est un verbe.'],
  [6, 'Ulysse retourne à Ithaque.', 'Ulysse', 'nom propre', 'il désigne un personnage unique et commence par une majuscule.'],
  [6, 'Ulysse retourne à Ithaque.', 'à', 'préposition', 'ce petit mot invariable introduit le complément « Ithaque ».'],
  [6, 'Mes amis arrivent demain.', 'Mes', 'déterminant', 'il introduit le nom « amis » (déterminant possessif).'],
  [6, 'Mes amis arrivent demain.', 'demain', 'adverbe', 'mot invariable qui précise le moment de l’action.'],
  [6, 'Elle lit un roman.', 'Elle', 'pronom', 'il remplace un nom (personnel, sujet du verbe « lit »).'],
  [6, 'Elle lit un roman.', 'roman', 'nom commun', 'il est précédé d’un déterminant (« un ») et désigne une chose.'],
  [6, 'Je prends mon sac et je pars.', 'et', 'conjonction de coordination', 'il relie deux propositions de même nature (mais, ou, et, donc, or, ni, car).'],
  [6, 'Le héros avance lentement.', 'lentement', 'adverbe', 'il est invariable et précise la manière : de nombreux adverbes se terminent en -ment.'],
  [6, 'Cette forêt est sombre.', 'Cette', 'déterminant', 'c’est un déterminant démonstratif qui introduit « forêt ».'],
  [6, 'Le cyclope est terrifiant.', 'terrifiant', 'adjectif qualificatif', 'il qualifie le cyclope (ici attribut du sujet).'],
  [5, 'Le chevalier combat car il veut sauver la reine.', 'car', 'conjonction de coordination', 'il relie deux propositions indépendantes et exprime la cause.'],
  [5, 'Je pense que tu as raison.', 'que', 'conjonction de subordination', 'il introduit une proposition subordonnée complétive.'],
  [5, 'Scapin les trompe tous.', 'les', 'pronom', 'devant un verbe, « les » remplace un nom (pronom personnel COD).'],
  [5, 'Il partira quand le soleil se lèvera.', 'quand', 'conjonction de subordination', 'il introduit une subordonnée circonstancielle de temps.'],
  [5, 'Le roi, très fier, refuse.', 'très', 'adverbe', 'il modifie l’adjectif « fier » et reste invariable.'],
  [5, 'Il marche sans bruit.', 'sans', 'préposition', 'mot invariable qui introduit le complément « bruit ».'],
  [4, 'Le livre dont je parle est passionnant.', 'dont', 'pronom', 'c’est un pronom relatif : il reprend « livre » et introduit une subordonnée relative.'],
  [4, 'Bien qu’il pleuve, nous sortons.', 'Bien qu’', 'conjonction de subordination', 'locution conjonctive qui introduit une subordonnée de concession.'],
  [4, 'Personne ne répondit.', 'Personne', 'pronom', 'ici, c’est un pronom indéfini sujet (sans déterminant).'],
  [3, 'Lorsque la guerre éclata, il s’engagea.', 'Lorsque', 'conjonction de subordination', 'il introduit une subordonnée circonstancielle de temps.'],
  [3, 'Or, personne ne l’avait prévenu.', 'Or', 'conjonction de coordination', '« or » fait partie de la liste mais, ou, et, donc, or, ni, car.']
];
function genNature(level) {
  const items = NATURE_BANK.filter((x) => x[0] >= level);
  return () => {
    const [, s, w, n, why] = pick(items);
    return qcm({
      prompt: `Quelle est la nature (classe grammaticale) du mot « ${w} » dans la phrase :\n« ${s} »`,
      answer: n, wrong: shuffle(NATURES.filter((x) => x !== n)).slice(0, 3),
      hint: 'La nature d’un mot ne change pas : demande-toi s’il se conjugue, s’il varie, s’il remplace un nom ou s’il introduit quelque chose.',
      explanation: `« ${w} » est un(e) ${n} : ${why}`,
      skill: 'Nature des mots'
    });
  };
}

const FONCTIONS = ['sujet', 'COD', 'COI', 'attribut du sujet', 'complément circonstanciel de lieu', 'complément circonstanciel de temps', 'complément circonstanciel de manière', 'complément du nom', 'épithète', 'complément circonstanciel de cause', 'complément d’agent'];
const FONCTION_BANK = [
  [6, 'Le loup dévore l’agneau.', 'Le loup', 'sujet', 'c’est lui qui fait l’action ; on le trouve en posant la question « qui est-ce qui dévore ? ».'],
  [6, 'Le loup dévore l’agneau.', 'l’agneau', 'COD', 'il répond à la question « le loup dévore quoi ? », sans préposition.'],
  [6, 'Ulysse parle à ses compagnons.', 'à ses compagnons', 'COI', 'il complète le verbe avec la préposition « à » (parler à quelqu’un).'],
  [6, 'Le cyclope semble furieux.', 'furieux', 'attribut du sujet', 'il est relié au sujet par le verbe d’état « sembler ».'],
  [6, 'Les enfants jouent dans le jardin.', 'dans le jardin', 'complément circonstanciel de lieu', 'il indique où se passe l’action et peut être déplacé ou supprimé.'],
  [6, 'Le soir, la princesse s’endort.', 'Le soir', 'complément circonstanciel de temps', 'il indique quand ; il est déplaçable et supprimable.'],
  [6, 'Le renard parle avec ruse.', 'avec ruse', 'complément circonstanciel de manière', 'il indique comment le renard parle.'],
  [6, 'La maison de ma grand-mère est ancienne.', 'de ma grand-mère', 'complément du nom', 'il complète le nom « maison » grâce à la préposition « de ».'],
  [6, 'Un terrible orage éclata.', 'terrible', 'épithète', 'l’adjectif est placé directement à côté du nom « orage », sans verbe.'],
  [6, 'Cette histoire est étrange.', 'étrange', 'attribut du sujet', 'il est relié au sujet par le verbe d’état « être ».'],
  [5, 'Le chevalier offre son épée au roi.', 'au roi', 'COI', 'il est introduit par « à » (au = à le) : offrir quelque chose à quelqu’un.'],
  [5, 'Le chevalier offre son épée au roi.', 'son épée', 'COD', 'il répond à « offre quoi ? » sans préposition.'],
  [5, 'Dans la forêt, Perceval rencontre des chevaliers.', 'Dans la forêt', 'complément circonstanciel de lieu', 'il indique où, et peut être déplacé.'],
  [5, 'Le roi devint triste.', 'triste', 'attribut du sujet', '« devenir » est un verbe d’état : l’adjectif se rapporte au sujet.'],
  [4, 'Il tremblait de peur.', 'de peur', 'complément circonstanciel de cause', 'il indique pourquoi il tremblait.'],
  [4, 'Le village fut détruit par la tempête.', 'par la tempête', 'complément d’agent', 'à la voix passive, il désigne celui qui fait réellement l’action.'],
  [4, 'Le docteur leur a tout expliqué.', 'leur', 'COI', 'pronom qui signifie « à eux » : expliquer quelque chose à quelqu’un.'],
  [3, 'À cause du brouillard, le train est en retard.', 'À cause du brouillard', 'complément circonstanciel de cause', 'il explique la raison du retard.'],
  [3, 'La lettre a été écrite par Zola.', 'par Zola', 'complément d’agent', 'la phrase est au passif : Zola est celui qui a écrit.'],
  [3, 'Ce poète engagé dénonce la guerre.', 'engagé', 'épithète', 'adjectif placé directement après le nom « poète », sans verbe d’état.']
];
function genFonction(level) {
  const items = FONCTION_BANK.filter((x) => x[0] >= level);
  const allowed = level >= 5 ? FONCTIONS.slice(0, 9) : FONCTIONS;
  return () => {
    const [, s, w, f, why] = pick(items);
    return qcm({
      prompt: `Quelle est la fonction du groupe « ${w} » dans la phrase :\n« ${s} »`,
      answer: f, wrong: shuffle(allowed.filter((x) => x !== f)).slice(0, 3),
      hint: 'Repère d’abord le verbe et son sujet, puis pose les questions : quoi ? à qui ? où ? quand ? comment ? pourquoi ?',
      explanation: `« ${w} » est ${f} : ${why}`,
      skill: 'Fonctions grammaticales'
    });
  };
}

const FIG_DEF = {
  comparaison: 'rapprochement de deux éléments à l’aide d’un outil de comparaison (comme, tel, pareil à, ressembler…)',
  métaphore: 'rapprochement de deux éléments SANS outil de comparaison',
  personnification: 'attribution de caractéristiques humaines à un objet, un animal ou une idée',
  hyperbole: 'exagération volontaire pour frapper l’esprit',
  énumération: 'suite d’éléments de même nature',
  anaphore: 'répétition d’un même mot ou groupe en début de vers ou de phrase',
  antithèse: 'rapprochement de deux idées opposées dans une même phrase',
  gradation: 'suite de termes d’intensité croissante (ou décroissante)',
  périphrase: 'expression de plusieurs mots qui remplace un mot unique',
  oxymore: 'association de deux termes contradictoires dans un même groupe de mots',
  litote: 'dire moins pour suggérer plus',
  euphémisme: 'atténuation d’une réalité dure ou choquante',
  allitération: 'répétition d’un même son consonne',
  assonance: 'répétition d’un même son voyelle',
  chiasme: 'construction en miroir (A B / B A)'
};
const FIG_BANK = [
  ['Ses yeux brillent comme des étoiles.', 'comparaison', 'l’outil « comme » relie les yeux et les étoiles.'],
  ['Il est rusé comme un renard.', 'comparaison', 'l’outil « comme » rapproche l’homme et le renard.'],
  ['La mer, pareille à un miroir, reflétait le ciel.', 'comparaison', 'l’outil « pareille à » rapproche la mer et un miroir.'],
  ['Cet homme est un lion.', 'métaphore', 'on rapproche l’homme et le lion (courage) sans aucun outil de comparaison.'],
  ['La neige, manteau blanc, recouvre la ville.', 'métaphore', 'la neige est assimilée à un manteau sans outil de comparaison.'],
  ['Le vent hurlait dans la nuit.', 'personnification', 'hurler est une action humaine (ou animale) attribuée au vent.'],
  ['La ville s’éveille doucement.', 'personnification', 's’éveiller est une action humaine attribuée à la ville.'],
  ['Je te l’ai dit mille fois !', 'hyperbole', '« mille fois » exagère volontairement le nombre de répétitions.'],
  ['Ce sac pèse une tonne !', 'hyperbole', 'le sac ne pèse évidemment pas une tonne : c’est une exagération.'],
  ['Dans sa besace, il y avait du pain, du fromage, des pommes, une gourde et un couteau.', 'énumération', 'la phrase aligne une liste de noms de même nature.'],
  ['Paris outragé ! Paris brisé ! Paris martyrisé ! mais Paris libéré ! (de Gaulle, 1944)', 'anaphore', '« Paris » est répété au début de chaque segment.'],
  ['Mon bras qu’avec respect toute l’Espagne admire, / Mon bras qui tant de fois a sauvé cet empire (Corneille, Le Cid)', 'anaphore', '« Mon bras » est repris en tête de vers.'],
  ['Je vis, je meurs ; je me brûle et me noie. (Louise Labé)', 'antithèse', 'vivre/mourir et brûler/se noyer s’opposent dans la même phrase.'],
  ['Va, cours, vole, et nous venge. (Corneille, Le Cid)', 'gradation', 'les verbes vont du moins rapide au plus rapide.'],
  ['C’est un roc !… c’est un pic !… c’est un cap ! (Rostand, Cyrano de Bergerac)', 'gradation', 'les termes désignent des reliefs de plus en plus grands.'],
  ['L’astre du jour se lève sur la plaine.', 'périphrase', '« l’astre du jour » désigne le soleil en plusieurs mots.'],
  ['Paris, la Ville Lumière, attire les touristes.', 'périphrase', '« la Ville Lumière » est une autre façon de désigner Paris.'],
  ['Cette obscure clarté qui tombe des étoiles (Corneille, Le Cid)', 'oxymore', '« obscure » et « clarté » sont contradictoires et pourtant associés.'],
  ['Un silence assourdissant régnait dans la salle.', 'oxymore', 'un silence ne peut pas être « assourdissant » : les deux mots se contredisent.'],
  ['Va, je ne te hais point. (Corneille, Le Cid)', 'litote', 'Chimène dit « je ne te hais point » pour faire comprendre « je t’aime ».'],
  ['Ce n’est pas mauvais du tout !', 'litote', 'on dit moins (« pas mauvais ») pour faire entendre « c’est délicieux ».'],
  ['Notre grand-père nous a quittés l’hiver dernier.', 'euphémisme', '« nous a quittés » adoucit l’idée de la mort.'],
  ['Pour qui sont ces serpents qui sifflent sur vos têtes ? (Racine, Andromaque)', 'allitération', 'le son consonne [s] est répété et imite le sifflement des serpents.'],
  ['Les sanglots longs / Des violons / De l’automne (Verlaine)', 'assonance', 'le son voyelle [on] est répété et crée une musique mélancolique.'],
  ['Il faut manger pour vivre et non pas vivre pour manger. (Molière, L’Avare)', 'chiasme', 'les mots sont disposés en miroir : manger/vivre puis vivre/manger.']
];
const FIG_LEVEL = {
  6: ['comparaison', 'métaphore', 'personnification', 'hyperbole', 'énumération'],
  5: ['comparaison', 'métaphore', 'personnification', 'hyperbole', 'énumération', 'anaphore', 'antithèse', 'gradation', 'périphrase'],
  4: ['comparaison', 'métaphore', 'personnification', 'hyperbole', 'anaphore', 'antithèse', 'gradation', 'périphrase', 'oxymore', 'litote', 'euphémisme', 'allitération', 'assonance'],
  3: Object.keys(FIG_DEF)
};
function genFigures(level) {
  const allowed = FIG_LEVEL[level], items = FIG_BANK.filter((x) => allowed.includes(x[1]));
  return () => {
    const [s, f, why] = pick(items);
    return qcm({
      prompt: `Quelle figure de style reconnais-tu ?\n« ${s} »`,
      answer: f, wrong: shuffle(allowed.filter((x) => x !== f)).slice(0, 3),
      hint: 'Cherche un outil de comparaison, une répétition, une exagération, une opposition ou un jeu sur les sons.',
      explanation: `C’est une ${f} : ${why}\nDéfinition : ${FIG_DEF[f]}.`,
      skill: 'Figures de style'
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.e Moteurs « anglais » (verbes irréguliers, present simple, etc.)
 * -------------------------------------------------------------------- */

// [base, prétérit, participe passé, sens] — « | » sépare les variantes acceptées.
const IRREG = [
  ['be', 'was/were|was / were|were/was', 'been', 'être'], ['have', 'had', 'had', 'avoir'], ['go', 'went', 'gone', 'aller'],
  ['do', 'did', 'done', 'faire'], ['make', 'made', 'made', 'fabriquer, faire'], ['see', 'saw', 'seen', 'voir'],
  ['eat', 'ate', 'eaten', 'manger'], ['drink', 'drank', 'drunk', 'boire'], ['come', 'came', 'come', 'venir'],
  ['take', 'took', 'taken', 'prendre'], ['give', 'gave', 'given', 'donner'], ['buy', 'bought', 'bought', 'acheter'],
  ['say', 'said', 'said', 'dire'], ['know', 'knew', 'known', 'savoir, connaître'], ['write', 'wrote', 'written', 'écrire'],
  ['read', 'read', 'read', 'lire'], ['speak', 'spoke', 'spoken', 'parler'], ['swim', 'swam', 'swum', 'nager'],
  ['sing', 'sang', 'sung', 'chanter'], ['run', 'ran', 'run', 'courir'], ['get', 'got', 'got|gotten', 'obtenir, devenir'],
  ['think', 'thought', 'thought', 'penser'], ['tell', 'told', 'told', 'raconter, dire à'], ['begin', 'began', 'begun', 'commencer'],
  ['break', 'broke', 'broken', 'casser'], ['choose', 'chose', 'chosen', 'choisir'], ['fly', 'flew', 'flown', 'voler (dans les airs)'],
  ['forget', 'forgot', 'forgotten', 'oublier'], ['sleep', 'slept', 'slept', 'dormir'], ['leave', 'left', 'left', 'partir, quitter'],
  ['meet', 'met', 'met', 'rencontrer'], ['find', 'found', 'found', 'trouver'], ['win', 'won', 'won', 'gagner'],
  ['lose', 'lost', 'lost', 'perdre'], ['wear', 'wore', 'worn', 'porter (un vêtement)'], ['put', 'put', 'put', 'mettre, poser'],
  ['teach', 'taught', 'taught', 'enseigner'], ['catch', 'caught', 'caught', 'attraper'], ['bring', 'brought', 'brought', 'apporter'],
  ['build', 'built', 'built', 'construire'], ['feel', 'felt', 'felt', 'ressentir'], ['hear', 'heard', 'heard', 'entendre'],
  ['understand', 'understood', 'understood', 'comprendre'], ['become', 'became', 'become', 'devenir'], ['fall', 'fell', 'fallen', 'tomber'],
  ['drive', 'drove', 'driven', 'conduire'], ['grow', 'grew', 'grown', 'grandir, faire pousser'], ['throw', 'threw', 'thrown', 'lancer'],
  ['draw', 'drew', 'drawn', 'dessiner'], ['spend', 'spent', 'spent', 'dépenser, passer (du temps)'], ['send', 'sent', 'sent', 'envoyer'],
  ['sell', 'sold', 'sold', 'vendre'], ['keep', 'kept', 'kept', 'garder'], ['ride', 'rode', 'ridden', 'monter (à vélo, à cheval)']
];
const first = (s) => s.split('|')[0];

function genIrregular(n) {
  const list = IRREG.slice(0, n);
  return () => {
    const [b, pr, pp, fr] = pick(list), mode = rand(0, 3);
    const serie = `${b} – ${first(pr)} – ${first(pp)}`;
    const explanation = `« to ${b} » (${fr}) : base verbale « ${b} », prétérit « ${first(pr)} », participe passé « ${first(pp)} ». Les verbes irréguliers ne prennent pas -ed : il faut apprendre les trois formes par cœur (récite-les à voix haute : ${serie}).`;
    const skill = 'Verbes irréguliers';
    if (mode === 0) return input({ prompt: `🇬🇧 Donne le prétérit (past simple) du verbe irrégulier « to ${b} » (${fr}).`, answer: pr.split('|'), hint: 'Récite la série base – prétérit – participe passé : c’est la deuxième forme.', explanation, skill });
    if (mode === 1) return input({ prompt: `🇬🇧 Donne le participe passé du verbe irrégulier « to ${b} » (${fr}).`, answer: pp.split('|'), hint: 'C’est la troisième forme de la série, celle qu’on utilise avec « have » au present perfect.', explanation, skill });
    if (mode === 2) {
      const o = pick(list.filter((x) => x[0] !== b));
      const reg = b.endsWith('e') ? b + 'd' : b + 'ed';
      return qcm({
        prompt: `🇬🇧 Quelle est la bonne série pour le verbe « ${fr} » ?`, answer: serie,
        wrong: shuffle([`${b} – ${reg} – ${reg}`, `${b} – ${first(pp)} – ${first(pr)}`, `${b} – ${first(pr)} – ${first(pr)}`, `${b} – ${first(o[1])} – ${first(o[2])}`, `${b} – ${first(pr)} – ${reg}`]),
        hint: 'Les verbes irréguliers ne se terminent pas en -ed : cherche la série que tu as apprise par cœur.', explanation, skill
      });
    }
    return qcm({
      prompt: `🇬🇧 Que signifie le verbe « to ${b} » ?`, answer: fr,
      wrong: shuffle(list.filter((x) => x[3] !== fr)).slice(0, 3).map((x) => x[3]),
      hint: 'Pense à une phrase simple où tu as déjà rencontré ce verbe.', explanation, skill
    });
  };
}

// [base, 3e pers. sing., -ing, complément « habitude », complément « en ce moment »]
const EN_VERBS = [
  ['play', 'plays', 'playing', 'football on Saturdays', 'football in the garden'],
  ['watch', 'watches', 'watching', 'TV after school', 'a cartoon'],
  ['go', 'goes', 'going', 'to school by bus', 'to the park'],
  ['study', 'studies', 'studying', 'English every day', 'for the test'],
  ['wash', 'washes', 'washing', 'the dishes after dinner', 'the car'],
  ['fix', 'fixes', 'fixing', 'bikes at the weekend', 'a bike'],
  ['try', 'tries', 'trying', 'new recipes every month', 'a new recipe'],
  ['read', 'reads', 'reading', 'comics in bed', 'a comic'],
  ['swim', 'swims', 'swimming', 'in the pool on Wednesdays', 'in the lake'],
  ['finish', 'finishes', 'finishing', 'school at five', 'the homework'],
  ['buy', 'buys', 'buying', 'bread every morning', 'some bread'],
  ['eat', 'eats', 'eating', 'an apple every morning', 'an apple'],
  ['write', 'writes', 'writing', 'emails to friends', 'an email'],
  ['run', 'runs', 'running', 'in the park every Sunday', 'in the park'],
  ['dance', 'dances', 'dancing', 'at every party', 'in the living room'],
  ['have', 'has', 'having', 'lunch at the canteen', 'lunch']
];
const EN_SUBJ = [['He', 3], ['She', 3], ['My sister', 3], ['Tom', 3], ['Our teacher', 3], ['I', 1], ['You', 0], ['We', 0], ['They', 0], ['My parents', 0]];
const beFor = (k) => (k === 1 ? 'am' : k === 3 ? 'is' : 'are');

function genPresentSimple(withNeg = true) {
  return () => {
    const [b, s3, , hab] = pick(EN_VERBS), [S, k] = pick(EN_SUBJ);
    const third = k === 3;
    if (withNeg && Math.random() < 0.35) {
      const ans = third ? `doesn't ${b}` : `don't ${b}`;
      return input({
        prompt: `🇬🇧 Mets à la forme négative du present simple :\n« ${S} ___ (not / ${b}) ${hab}. »`,
        answer: [ans, third ? `does not ${b}` : `do not ${b}`],
        hint: 'À la forme négative, on utilise l’auxiliaire do/does + not, et le verbe reste à la base verbale.',
        explanation: `Au present simple négatif : sujet + don’t / doesn’t + base verbale. « ${S} » ${third ? 'est à la 3e personne du singulier : on utilise « doesn’t » et le verbe perd son -s' : 'n’est pas à la 3e personne du singulier : on utilise « don’t »'} → « ${S} ${ans} ${hab}. »`,
        skill: 'Present simple'
      });
    }
    const ans = third ? s3 : b;
    return input({
      prompt: `🇬🇧 Conjugue au present simple :\n« ${S} ___ (${b}) ${hab}. »`,
      answer: ans,
      hint: 'Le present simple sert à parler des habitudes. Demande-toi si le sujet est à la 3e personne du singulier (he, she, it).',
      explanation: `Au present simple, on ajoute -s (ou -es, -ies) seulement à la 3e personne du singulier. « ${S} » ${third ? `= he/she : « ${b} » devient « ${s3} »${s3.endsWith('es') ? ' (on ajoute -es après -s, -sh, -ch, -x, -o ou y précédé d’une consonne → -ies ; have → has)' : ''}` : `n’est pas à la 3e personne du singulier : on garde la base verbale « ${b} »`}.`,
      skill: 'Present simple'
    });
  };
}

function genPresentContinuous() {
  return () => {
    const [b, , ing, , now] = pick(EN_VERBS), [S, k] = pick(EN_SUBJ.filter((x) => x[0] !== 'You' || true));
    const be = beFor(k);
    const contr = { am: "'m", is: "'s", are: "'re" }[be];
    return input({
      prompt: `🇬🇧 Conjugue au present continuous (be + V-ing) :\n« Look! ${S} ___ (${b}) ${now} right now. »`,
      answer: [`${be} ${ing}`, `${contr} ${ing}`],
      hint: 'Pour une action en cours, il faut « be » conjugué avec le sujet + le verbe en -ing.',
      explanation: `Present continuous = be (am / is / are) + verbe-ing, pour une action en train de se dérouler (« Look! », « right now »). Avec « ${S} », be → « ${be} », et « ${b} » → « ${ing} »${/(mm|nn|pp)ing$/.test(ing) ? ' (on double la consonne finale après une voyelle courte accentuée)' : ing.endsWith('ing') && b.endsWith('e') ? ' (le -e final disparaît)' : ''}.`,
      skill: 'Present continuous'
    });
  };
}

// Prétérit régulier
const EN_PAST = [['play', 'played', 'tennis'], ['stop', 'stopped', 'the car'], ['study', 'studied', 'for the test'], ['visit', 'visited', 'the museum'], ['like', 'liked', 'the film'], ['travel', 'travelled|traveled', 'to Scotland'], ['watch', 'watched', 'a documentary'], ['plan', 'planned', 'a trip'], ['walk', 'walked', 'to the station'], ['want', 'wanted', 'a new phone'], ['clean', 'cleaned', 'the kitchen'], ['jump', 'jumped', 'into the lake'], ['cry', 'cried', 'at the end of the film'], ['help', 'helped', 'a friend']];
function genPreteritRegular() {
  return () => {
    const [b, ed, c] = pick(EN_PAST), [S] = pick(EN_SUBJ), when = pick(['Yesterday', 'Last week', 'Two days ago', 'Last summer']);
    const e = first(ed);
    let note = 'on ajoute simplement -ed';
    if (b.endsWith('e')) note = 'le verbe finit déjà par -e : on ajoute seulement -d';
    else if (b.endsWith('y')) note = 'y précédé d’une consonne devient -ied';
    else if (e.length > b.length + 2) note = 'on double la consonne finale (voyelle courte + consonne)';
    return input({
      prompt: `🇬🇧 Conjugue au prétérit (past simple) :\n« ${when}, ${S === 'I' ? 'I' : S.charAt(0).toLowerCase() + S.slice(1).replace(/^tom|^my|^our/, (m) => m)} ___ (${b}) ${c}. »`.replace(/, (tom|my sister|our teacher|my parents) /i, (m) => m.replace(/\b(tom)\b/i, 'Tom')),
      answer: ed.split('|'),
      hint: `« ${when} » indique un moment terminé du passé : pense à la terminaison des verbes réguliers.`,
      explanation: `Le prétérit des verbes réguliers se forme avec -ed, à toutes les personnes (pas de -s à la 3e personne !). Pour « ${b} », ${note} : « ${e} ».`,
      skill: 'Prétérit (past simple)'
    });
  };
}

const ED_SOUNDS = [['watched', 't'], ['liked', 't'], ['stopped', 't'], ['walked', 't'], ['jumped', 't'], ['washed', 't'], ['played', 'd'], ['cleaned', 'd'], ['lived', 'd'], ['travelled', 'd'], ['cried', 'd'], ['opened', 'd'], ['visited', 'ɪd'], ['wanted', 'ɪd'], ['needed', 'ɪd'], ['hated', 'ɪd'], ['started', 'ɪd'], ['decided', 'ɪd']];
function genEdSound() {
  return () => {
    const s = pick(['t', 'd', 'ɪd']), good = pick(ED_SOUNDS.filter((x) => x[1] === s));
    const wrong = shuffle(ED_SOUNDS.filter((x) => x[1] !== s)).slice(0, 3);
    return qcm({
      prompt: `🇬🇧 Prononciation : quel verbe au prétérit se termine par le son /${s}/ ?`,
      answer: good[0], wrong: wrong.map((x) => x[0]),
      hint: 'Prononce la base verbale à voix haute et écoute son dernier son.',
      explanation: `« ${good[0]} » se prononce avec /${s}/. Règle : -ed se dit /ɪd/ après les sons [t] et [d] (wanted, needed) ; /t/ après un son sourd comme [p], [k], [f], [s], [ʃ], [tʃ] (stopped, walked, washed, watched) ; /d/ dans les autres cas (played, lived). Les autres choix : ${wrong.map((x) => `${x[0]} /${x[1]}/`).join(', ')}.`,
      skill: 'Prononciation de -ed'
    });
  };
}

// Comparatifs / superlatifs : [adjectif, comparatif, superlatif, court ?]
const EN_ADJ = [['tall', 'taller', 'the tallest', 1], ['big', 'bigger', 'the biggest', 1], ['happy', 'happier', 'the happiest', 1], ['fast', 'faster', 'the fastest', 1], ['hot', 'hotter', 'the hottest', 1], ['easy', 'easier', 'the easiest', 1], ['nice', 'nicer', 'the nicest', 1], ['old', 'older', 'the oldest', 1], ['good', 'better', 'the best', 1], ['bad', 'worse', 'the worst', 1], ['expensive', 'more expensive', 'the most expensive', 0], ['beautiful', 'more beautiful', 'the most beautiful', 0], ['interesting', 'more interesting', 'the most interesting', 0], ['dangerous', 'more dangerous', 'the most dangerous', 0]];
function genComparatives() {
  return () => {
    const [a, c, s, short] = pick(EN_ADJ), sup = Math.random() < 0.5;
    const irr = a === 'good' || a === 'bad';
    const rule = irr ? `« ${a} » est irrégulier : ${a} → ${c} → ${s}.` : short
      ? `« ${a} » est un adjectif court : comparatif en -er + than, superlatif « the …-est »${/(gg|tt)er$/.test(c) ? ' (consonne finale doublée)' : a.endsWith('y') ? ' (y devient i)' : ''}.`
      : `« ${a} » est un adjectif long : comparatif « more … than », superlatif « the most … ».`;
    if (sup) {
      const wrong = short ? [`the most ${a}`, `the ${c}`, c] : [`the ${a}est`, `the more ${a}`, `more ${a}`];
      return qcm({ prompt: `🇬🇧 Superlatif : « This is ___ (${a}) film of the year. »`, answer: s, wrong, hint: 'Compte les syllabes de l’adjectif : court ou long ? Et y a-t-il une forme irrégulière ?', explanation: `Superlatif : ${rule}`, skill: 'Comparatifs et superlatifs' });
    }
    const wrong = short ? [`more ${a}`, `more ${c}`, s.replace('the ', '')] : [`${a}er`, `most ${a}`, `more ${a}er`];
    return qcm({ prompt: `🇬🇧 Comparatif de supériorité : « My bike is ___ (${a}) than yours. »`, answer: c, wrong, hint: 'Compte les syllabes de l’adjectif : court ou long ? Et y a-t-il une forme irrégulière ?', explanation: `Comparatif : ${rule}`, skill: 'Comparatifs et superlatifs' });
  };
}

// Nombres en anglais (0-100)
const EN_U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const enNum = (n) => (n === 100 ? 'one hundred' : n < 20 ? EN_U[n] : EN_T[Math.floor(n / 10)] + (n % 10 ? '-' + EN_U[n % 10] : ''));
function genEnNumbers() {
  return () => {
    const n = rand(13, 99), w = enNum(n);
    const expl = `${n} se dit « ${w} ». Entre 21 et 99, on relie la dizaine et l’unité par un trait d’union (forty-seven). Attention aux pièges : fourteen mais forty (sans u), thirteen/thirty, fifteen/fifty.`;
    if (Math.random() < 0.5) {
      return input({ prompt: `🇬🇧 Écris ce nombre en lettres, en anglais : ${n}`, answer: [w, w.replace('-', ' ')], hint: 'Commence par la dizaine (twenty, thirty, forty…) puis ajoute l’unité.', explanation: expl, skill: 'Les nombres' });
    }
    const sw = (n % 10) * 10 + Math.floor(n / 10);
    const cands = [sw, n + 10, n - 10, n + 1, n - 1].filter((x) => x !== n && x >= 10 && x <= 99);
    return qcm({ prompt: `🇬🇧 Quel nombre correspond à « ${w} » ?`, answer: String(n), wrong: cands.map(String), hint: 'Lis d’abord la dizaine, puis l’unité après le trait d’union.', explanation: expl, skill: 'Les nombres' });
  };
}

// Present perfect (have/has + participe passé)
const EN_PP = [['visit', 'visited', 'London three times'], ['see', 'seen', 'this film twice'], ['eat', 'eaten', 'sushi before'], ['read', 'read', 'all the Harry Potter books'], ['write', 'written', 'three emails today'], ['finish', 'finished', 'the project'], ['meet', 'met', 'a famous singer'], ['win', 'won', 'two matches this season'], ['forget', 'forgotten', 'the password again'], ['be', 'been', 'to Ireland'], ['break', 'broken', 'the record'], ['lose', 'lost', 'the keys again']];
function genPresentPerfect() {
  return () => {
    const [b, pp, c] = pick(EN_PP), [S, k] = pick(EN_SUBJ), hv = k === 3 ? 'has' : 'have';
    return input({
      prompt: `🇬🇧 Conjugue au present perfect :\n« ${S} ___ (${b}) ${c}. »`,
      answer: [`${hv} ${pp}`, `${k === 3 ? "'s" : "'ve"} ${pp}`],
      hint: 'Present perfect = have ou has + participe passé. Choisis la forme de « have » selon le sujet.',
      explanation: `Present perfect : have / has + participe passé. « ${S} » → « ${hv} » ; participe passé de « ${b} » : « ${pp} »${['visit', 'finish'].includes(b) ? ' (verbe régulier en -ed)' : ' (verbe irrégulier, 3e colonne)'}. On l’emploie pour un bilan au présent d’actions passées, sans date précise.`,
      skill: 'Present perfect'
    });
  };
}

/* ----------------------------------------------------------------------
 * 1.f Moteurs « espagnol »
 * -------------------------------------------------------------------- */

const ES_PRON = ['yo', 'tú', 'él / ella / usted', 'nosotros', 'vosotros', 'ellos / ellas / ustedes'];
const ES_END = { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] };
const ES_PRET = { ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'] };
const ES_REG = [['hablar', 'parler'], ['estudiar', 'étudier'], ['trabajar', 'travailler'], ['cantar', 'chanter'], ['bailar', 'danser'], ['escuchar', 'écouter'], ['mirar', 'regarder'], ['comer', 'manger'], ['beber', 'boire'], ['aprender', 'apprendre'], ['correr', 'courir'], ['comprender', 'comprendre'], ['vivir', 'vivre, habiter'], ['escribir', 'écrire'], ['abrir', 'ouvrir'], ['subir', 'monter'], ['recibir', 'recevoir'], ['compartir', 'partager']];
const ES_IRR = {
  ser: ['être (identité, caractère)', 'soy eres es somos sois son', 'totalement irrégulier'],
  estar: ['être (état, lieu)', 'estoy estás está estamos estáis están', '1re personne en -oy et accents sur les terminaisons'],
  tener: ['avoir, posséder', 'tengo tienes tiene tenemos tenéis tienen', '1re personne en -go et diphtongue e → ie'],
  ir: ['aller', 'voy vas va vamos vais van', 'totalement irrégulier'],
  hacer: ['faire', 'hago haces hace hacemos hacéis hacen', '1re personne en -go'],
  venir: ['venir', 'vengo vienes viene venimos venís vienen', '1re personne en -go et diphtongue e → ie'],
  decir: ['dire', 'digo dices dice decimos decís dicen', '1re personne en -go et e → i'],
  salir: ['sortir', 'salgo sales sale salimos salís salen', '1re personne en -go'],
  poner: ['mettre', 'pongo pones pone ponemos ponéis ponen', '1re personne en -go'],
  querer: ['vouloir, aimer', 'quiero quieres quiere queremos queréis quieren', 'diphtongue e → ie (sauf nosotros et vosotros)'],
  poder: ['pouvoir', 'puedo puedes puede podemos podéis pueden', 'diphtongue o → ue (sauf nosotros et vosotros)'],
  dormir: ['dormir', 'duermo duermes duerme dormimos dormís duermen', 'diphtongue o → ue (sauf nosotros et vosotros)'],
  jugar: ['jouer', 'juego juegas juega jugamos jugáis juegan', 'diphtongue u → ue (sauf nosotros et vosotros)'],
  empezar: ['commencer', 'empiezo empiezas empieza empezamos empezáis empiezan', 'diphtongue e → ie (sauf nosotros et vosotros)'],
  pedir: ['demander', 'pido pides pide pedimos pedís piden', 'affaiblissement e → i (sauf nosotros et vosotros)']
};
const esTable = (forms) => ES_PRON.map((p, i) => `${p} ${forms[i]}`).join(', ');

function esConjQcm(inf, fr, forms, i, tenseFr, note, skill) {
  return qcm({
    prompt: `🇪🇸 Espagnol : conjugue « ${inf} » (${fr}) ${tenseFr} avec « ${ES_PRON[i]} ».`,
    answer: forms[i],
    wrong: shuffle(forms.filter((f, j) => j !== i && f !== forms[i])),
    hint: 'Repère la terminaison de l’infinitif (-ar, -er, -ir), puis la personne : chaque personne a sa terminaison propre.',
    explanation: `« ${inf} » ${tenseFr} : ${esTable(forms)}. Avec « ${ES_PRON[i]} » : « ${forms[i]} ». ${note}`,
    skill
  });
}

function genEsPresent(irrList = []) {
  return () => {
    const i = rand(0, 5);
    if (irrList.length && Math.random() < 0.5) {
      const inf = pick(irrList), [fr, f, note] = ES_IRR[inf];
      return esConjQcm(inf, fr, f.split(' '), i, 'au présent', `Verbe irrégulier : ${note}.`, 'Espagnol : présent');
    }
    const [inf, fr] = pick(ES_REG), g = inf.slice(-2), r = inf.slice(0, -2);
    return esConjQcm(inf, fr, ES_END[g].map((e) => r + e), i, 'au présent', `Verbe régulier en -${g} : on remplace -${g} par -${ES_END[g].join(', -')}.`, 'Espagnol : présent');
  };
}

function genEsPreterito() {
  return () => {
    const [inf, fr] = pick(ES_REG), g = inf.slice(-2), r = inf.slice(0, -2), i = rand(0, 5);
    return esConjQcm(inf, fr, ES_PRET[g].map((e) => r + e), i, 'au passé simple (pretérito indefinido)',
      `Au pretérito indefinido, les verbes en -ar prennent -é, -aste, -ó, -amos, -asteis, -aron ; ceux en -er et -ir prennent -í, -iste, -ió, -imos, -isteis, -ieron. N’oublie pas les accents écrits à « yo » et « él ».`, 'Espagnol : pretérito indefinido');
  };
}

const ESTAR = ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'];
const SER = ['soy', 'eres', 'es', 'somos', 'sois', 'son'];
function genEsGerundio() {
  return () => {
    const [inf, fr] = pick(ES_REG), g = inf.slice(-2), r = inf.slice(0, -2), i = rand(0, 5);
    const ger = r + (g === 'ar' ? 'ando' : 'iendo'), bad = r + (g === 'ar' ? 'iendo' : 'ando');
    const ans = `${ESTAR[i]} ${ger}`;
    return qcm({
      prompt: `🇪🇸 Espagnol : traduis « être en train de ${fr.split(',')[0]} » avec « ${ES_PRON[i]} ».\n(${ES_PRON[i]}) ___ (${inf}) ahora.`,
      answer: ans, wrong: [`${SER[i]} ${ger}`, `${ESTAR[i]} ${inf}`, `${ESTAR[i]} ${bad}`],
      hint: 'L’action en cours se construit avec le verbe de l’état (pas celui de l’identité) + le gérondif.',
      explanation: `Action en cours : estar conjugué + gérondif. Le gérondif se forme avec -ando pour les verbes en -ar et -iendo pour les verbes en -er/-ir : « ${inf} » → « ${ger} ». Avec « ${ES_PRON[i]} » : « ${ans} ». On n’emploie pas « ser » ici, et on ne laisse pas l’infinitif.`,
      skill: 'Espagnol : estar + gérondif'
    });
  };
}

// Nombres en espagnol (0-100)
const ES_U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_T = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
const esNum = (n) => (n === 100 ? 'cien' : n < 30 ? ES_U[n] : ES_T[Math.floor(n / 10)] + (n % 10 ? ' y ' + ES_U[n % 10] : ''));
function genEsNumbers() {
  return () => {
    const n = rand(11, 99), sw = (n % 10) * 10 + Math.floor(n / 10);
    const cands = [sw, n + 10, n - 10, n + 1, n - 1].filter((x) => x !== n && x >= 10 && x <= 99);
    return qcm({
      prompt: `🇪🇸 Espagnol : comment écrit-on le nombre ${n} en lettres ?`,
      answer: esNum(n), wrong: cands.map(esNum),
      hint: 'Jusqu’à 29, le nombre s’écrit en un seul mot ; à partir de 31, on relie dizaine et unité par « y ».',
      explanation: `${n} = « ${esNum(n)} ». De 16 à 29, on écrit un seul mot (dieciséis, veintidós…) ; à partir de 31 : dizaine + « y » + unité (treinta y uno, cuarenta y cinco…).`,
      skill: 'Espagnol : les nombres'
    });
  };
}

/* ======================================================================
 * 2. SIXIÈME (cycle 3 — consolidation)
 * ==================================================================== */

// ---------- 6e · Français ----------
const FR6 = {
  generators: [
    genConj(V_6, ['present', 'imparfait', 'futur', 'passe_simple', 'passe_compose'], ['passe_simple']),
    genTenseId(V_6, ['present', 'imparfait', 'futur', 'passe_simple', 'passe_compose']),
    genHomophones(['a/à', 'et/est', 'son/sont', 'on/ont', 'ou/où', 'ces/ses', "la/là/l'a"]),
    genAccordAdj(),
    genAccordPP(['etre', 'avoir']),
    genNature(6),
    genFonction(6),
    genFigures(6),
    bank('Vocabulaire et étymologie', "Pense aux récits mythologiques étudiés en classe et décompose le mot (préfixe, radical, suffixe).", [
      ["Le mot « panique » vient du nom d'un dieu grec. Lequel ?", 'Pan', ['Zeus', 'Hermès', 'Apollon'], "Pan, dieu des bergers et de la nature, provoquait des peurs soudaines chez les voyageurs : d'où la « peur panique »."],
      ["Que signifie l'adjectif « herculéen » ?", "d'une force extraordinaire", ['très rapide', 'très rusé', 'très ancien'], "Hercule (Héraclès en grec) est le héros d'une force exceptionnelle qui accomplit douze travaux : un effort « herculéen » est un effort immense."],
      ["Quel mot vient du nom d'une nymphe condamnée à répéter les derniers mots qu'elle entend ?", 'écho', ['narcisse', 'méduse', 'titan'], "La nymphe Écho, punie par Héra, ne pouvait que répéter la fin des phrases : le mot « écho » désigne un son renvoyé."],
      ["Aujourd'hui, une « odyssée » désigne…", "un long voyage plein d'aventures", ['une guerre très courte', "un chant d'amour", 'un repas de fête'], "Le mot vient de l'Odyssée d'Homère, qui raconte le long retour d'Ulysse (Odysseus en grec) vers Ithaque."],
      ["Que signifie « être médusé » ?", "être figé d'étonnement", ['être piqué par une méduse', 'être très en colère', 'être très fatigué'], "La Gorgone Méduse changeait en pierre ceux qui la regardaient : être médusé, c'est rester pétrifié de surprise."],
      ["Dans « défaire », que signifie le préfixe « dé- » ?", "le contraire, l'inverse", ['à nouveau', 'avant', 'très'], "Le préfixe « dé- » (ou « dés- ») indique le contraire : faire / défaire, coller / décoller. « re- » signifie « à nouveau », « pré- » signifie « avant »."],
      ["Quel préfixe signifie « à nouveau » ?", 're-', ['dé-', 'in-', 'pré-'], "« re- » marque la répétition : refaire, relire, repartir. « in- » marque le contraire (inutile), « pré- » l'antériorité (préhistoire)."],
      ["Quel est l'antonyme (le contraire) de « courageux » ?", 'lâche', ['brave', 'téméraire', 'audacieux'], "« brave », « téméraire » et « audacieux » sont des synonymes ou des mots proches de « courageux » ; son contraire est « lâche » (ou « peureux »)."],
      ["Quel mot n'appartient PAS à la famille de « terre » ?", 'terrible', ['terrain', 'enterrer', 'atterrir'], "« terrible » vient du latin terrere (effrayer), comme « terreur ». Les autres mots sont formés sur le radical « terr- » de la terre."],
      ["Dans « Il a un cœur de pierre », le mot « pierre » est employé…", 'au sens figuré', ['au sens propre', 'comme un nom propre', 'comme un verbe'], "Le cœur n'est pas vraiment en pierre : on veut dire que la personne est insensible. C'est le sens figuré (imagé)."],
      ["Le suffixe « -eur » dans « chanteur » sert à former…", "un nom désignant celui qui fait l'action", ['un adjectif', 'un adverbe', 'un verbe'], "chanter → chanteur, nager → nageur : le suffixe « -eur » forme des noms d'agents. Le suffixe « -ment » forme souvent des adverbes (lentement)."],
      ["Quel est le synonyme de « effrayant » ?", 'terrifiant', ['rassurant', 'amusant', 'étonnant'], "« terrifiant » a le même sens que « effrayant ». « rassurant » en est le contraire."]
    ]),
    bank('Culture littéraire', "Rappelle-toi les textes lus en classe : mythes grecs, contes, fables et schéma narratif.", [
      ["Selon la tradition, qui est l'auteur de l'Odyssée ?", 'Homère', ['Virgile', 'Ovide', 'Ésope'], "L'Iliade et l'Odyssée sont attribuées à Homère (VIIIe siècle av. J.-C.). Virgile et Ovide sont des poètes latins, Ésope un fabuliste grec."],
      ["De quelle île Ulysse est-il le roi ?", 'Ithaque', ['Troie', 'Sparte', 'Athènes'], "Ulysse veut rentrer à Ithaque après la guerre de Troie ; son voyage de retour dure dix ans."],
      ["Quel nom Ulysse donne-t-il au cyclope Polyphème pour le tromper ?", 'Personne', ['Ulysse', 'Achille', 'Télémaque'], "Quand Polyphème aveuglé appelle à l'aide en criant « Personne me tue ! », les autres cyclopes ne viennent pas : la ruse fonctionne."],
      ["Comment Ulysse et ses compagnons sortent-ils de la grotte du cyclope ?", 'accrochés sous le ventre des béliers', ['en creusant un tunnel', 'en tuant le cyclope endormi', 'en se cachant dans un cheval de bois'], "Après avoir enivré et aveuglé Polyphème, ils s'accrochent sous les béliers que le cyclope fait sortir. Le cheval de bois, c'est la ruse de Troie."],
      ["Qui attend Ulysse pendant vingt ans en tissant et défaisant une toile ?", 'Pénélope', ['Circé', 'Calypso', 'Athéna'], "Pénélope, sa femme fidèle, défait la nuit la toile tissée le jour pour repousser les prétendants. Circé et Calypso sont des magiciennes/nymphes qui retiennent Ulysse."],
      ["Dans le schéma narratif, comment s'appelle l'événement qui lance l'histoire ?", "l'élément perturbateur", ['la situation finale', "l'élément de résolution", 'la situation initiale'], "Le schéma narratif : situation initiale → élément perturbateur → péripéties → élément de résolution → situation finale."],
      ["Qui a écrit les fables « Le Loup et l'Agneau » et « Le Corbeau et le Renard » ?", 'Jean de La Fontaine', ['Charles Perrault', 'Molière', 'les frères Grimm'], "Jean de La Fontaine publie ses Fables à partir de 1668. Perrault et les frères Grimm ont écrit des contes."],
      ["Qui a écrit « Le Petit Chaperon rouge » et « Cendrillon » en 1697 ?", 'Charles Perrault', ['Jean de La Fontaine', 'Victor Hugo', 'Hans Christian Andersen'], "Charles Perrault publie les Histoires ou contes du temps passé en 1697. Andersen est un conteur danois du XIXe siècle."],
      ["Comment appelle-t-on la leçon que l'on tire d'une fable ?", 'la morale', ['la rime', 'le refrain', 'la strophe'], "La morale, souvent au début ou à la fin, exprime la leçon : « La raison du plus fort est toujours la meilleure »."],
      ["Combien de travaux Héraclès (Hercule) doit-il accomplir ?", 'douze', ['sept', 'dix', 'trois'], "Héraclès accomplit douze travaux, comme vaincre le lion de Némée ou l'hydre de Lerne."],
      ["Dans la mythologie grecque, qui est le roi des dieux ?", 'Zeus', ['Poséidon', 'Hadès', 'Arès'], "Zeus règne sur l'Olympe. Poséidon est le dieu des mers, Hadès celui des Enfers, Arès celui de la guerre."],
      ["Que raconte un récit de création comme la Genèse ou la Théogonie ?", "l'origine du monde et des êtres", ["la vie d'un roi de France", 'un voyage en mer', "une enquête policière"], "Les récits de création (Genèse dans la Bible, Théogonie d'Hésiode…) expliquent comment le monde, les dieux et les humains sont apparus."]
    ])
  ],
  flashcards: cards('Français 6e', [
    ['Le schéma narratif', 'Situation initiale → élément perturbateur → péripéties → élément de résolution → situation finale.'],
    ['Présent du 1er groupe', 'Terminaisons : -e, -es, -e, -ons, -ez, -ent (je chante, nous chantons).'],
    ['Présent du 2e groupe', '-is, -is, -it, -issons, -issez, -issent (je finis, nous finissons).'],
    ['Imparfait', 'Radical de « nous » au présent + -ais, -ais, -ait, -ions, -iez, -aient (nous finissons → je finissais).'],
    ['Futur simple', 'Infinitif (ou radical irrégulier) + -ai, -as, -a, -ons, -ez, -ont (je chanterai, j’irai, je ferai).'],
    ['Passé simple à la 3e personne', 'il chanta / ils chantèrent ; il finit / ils finirent ; il fut / ils furent ; il eut / ils eurent.'],
    ['a ou à ?', '« a » = verbe avoir (on peut dire « avait ») ; « à » = préposition.'],
    ['et ou est ?', '« est » = verbe être (on peut dire « était ») ; « et » = « et puis ».'],
    ['Accord avec « être »', 'Le participe passé s’accorde avec le sujet : elles sont parties.'],
    ['Comparaison ou métaphore ?', 'Comparaison : avec un outil (comme, tel…). Métaphore : sans outil.'],
    ['Le COD', 'Complète le verbe sans préposition ; répond à « quoi ? » ou « qui ? » après le verbe.'],
    ['Ulysse', 'Héros de l’Odyssée d’Homère ; roi d’Ithaque, célèbre pour sa ruse (cheval de Troie, cyclope).']
  ])
};

// ---------- 6e · Histoire-Géographie-EMC ----------
const HG6 = {
  generators: [
    bank('Histoire : les débuts de l’humanité', "Pense à la longue histoire de l'humanité : apparition de l'Homme, Néolithique, premières écritures.", [
      ["Sur quel continent sont apparus les premiers humains ?", 'en Afrique', ['en Europe', 'en Asie', 'en Amérique'], "Les plus anciens fossiles d'hominidés (Toumaï, Lucy…) ont été découverts en Afrique. Les humains ont ensuite migré vers les autres continents."],
      ["Comment s'appelle notre espèce, apparue il y a environ 300 000 ans ?", 'Homo sapiens', ['Homo erectus', 'Homo habilis', 'Australopithèque'], "Homo sapiens apparaît en Afrique il y a environ 300 000 ans. Homo habilis et Homo erectus sont plus anciens ; Lucy est une australopithèque."],
      ["Qu'est-ce qui caractérise le Néolithique ?", "les débuts de l'agriculture et de l'élevage", ["l'invention de l'écriture", 'la découverte du feu', 'la construction des pyramides'], "Vers 10 000 av. J.-C., au Proche-Orient, les humains commencent à cultiver et à élever : ils se sédentarisent dans des villages."],
      ["Comment appelle-t-on des humains qui s'installent durablement au même endroit ?", 'des sédentaires', ['des nomades', 'des chasseurs-cueilleurs', 'des migrants'], "Avec l'agriculture, les humains deviennent sédentaires. Les nomades, eux, se déplacent pour chasser et cueillir."],
      ["Où apparaît l'écriture vers 3300 av. J.-C. ?", 'en Mésopotamie', ['en Grèce', 'en Gaule', 'à Rome'], "L'écriture apparaît en Mésopotamie (actuel Irak), entre le Tigre et l'Euphrate, pour compter et gérer les richesses."],
      ["Comment s'appelle l'écriture inventée en Mésopotamie ?", "l'écriture cunéiforme", ['les hiéroglyphes', "l'alphabet latin", "l'alphabet grec"], "Le cunéiforme est formé de signes en forme de clous gravés dans l'argile. Les hiéroglyphes sont l'écriture des Égyptiens."],
      ["Quel fleuve permet le développement de l'Égypte antique ?", 'le Nil', ['le Tigre', "l'Euphrate", 'le Gange'], "Les crues du Nil déposent un limon fertile : l'Égypte est un « don du Nil » (Hérodote)."],
      ["Comment s'appelle le souverain de l'Égypte antique ?", 'le pharaon', ["l'empereur", 'le consul', 'le tyran'], "Le pharaon, considéré comme un dieu vivant, possède tous les pouvoirs."],
      ["Pourquoi dit-on que l'écriture marque la fin de la Préhistoire ?", "les historiens disposent alors de sources écrites", ["les humains cessent de chasser", "les premières villes disparaissent", "on cesse de faire des peintures"], "La Préhistoire est la période sans écrit ; avec l'écriture, on peut étudier les sociétés à partir de textes : c'est le début de l'Histoire."],
      ["Comment appelle-t-on les grands déplacements de populations humaines ?", 'des migrations', ['des croisades', 'des colonisations', 'des invasions barbares'], "Depuis l'Afrique, Homo sapiens a peuplé tous les continents grâce à de longues migrations."]
    ]),
    bank('Histoire : le monde grec et les Hébreux', "Rappelle-toi la carte de la Méditerranée antique et le cours sur Athènes.", [
      ["Qu'est-ce qu'une cité grecque ?", 'une ville et son territoire formant un État indépendant', ['un empire gouverné par un roi', 'une province romaine', 'un village de paysans'], "Le monde grec est divisé en cités indépendantes (Athènes, Sparte, Corinthe…), chacune avec ses lois et son armée."],
      ["Qu'est-ce qui unit les Grecs malgré leurs nombreuses cités ?", 'la langue, les dieux et les grands sanctuaires', ['un roi commun', 'une capitale unique', 'une monnaie unique'], "Les Grecs partagent la même langue, les mêmes dieux, les mêmes récits (Homère) et se retrouvent dans des sanctuaires communs comme Olympie ou Delphes."],
      ["Où se déroulent les Jeux olympiques dans l'Antiquité ?", 'à Olympie', ['à Athènes', 'à Delphes', 'à Sparte'], "Les Jeux se tenaient tous les quatre ans à Olympie, en l'honneur de Zeus ; ils auraient commencé en 776 av. J.-C."],
      ["Qui réforme Athènes en 508 av. J.-C. et pose les bases de la démocratie ?", 'Clisthène', ['Périclès', 'Alexandre le Grand', 'Jules César'], "Clisthène organise la cité pour que tous les citoyens participent au pouvoir. Périclès dirige Athènes plus tard, au Ve siècle."],
      ["Qui est citoyen à Athènes au Ve siècle av. J.-C. ?", "les hommes libres nés de parents athéniens", ['tous les habitants de la cité', 'les hommes et les femmes', 'les esclaves et les étrangers'], "Les femmes, les esclaves et les métèques (étrangers) sont exclus de la citoyenneté : la démocratie athénienne est limitée."],
      ["Comment s'appelle l'assemblée des citoyens athéniens ?", "l'Ecclésia", ['le Sénat', "l'Agora", 'les comices'], "L'Ecclésia se réunit sur la colline de la Pnyx pour voter les lois. L'agora est la place publique ; le Sénat est une institution romaine."],
      ["Quel temple dédié à Athéna domine l'Acropole d'Athènes ?", 'le Parthénon', ['le Panthéon', 'le Colisée', 'le temple de Zeus à Olympie'], "Le Parthénon est construit au Ve siècle av. J.-C. sous Périclès. Le Panthéon et le Colisée sont à Rome."],
      ["Que raconte l'Iliade d'Homère ?", 'un épisode de la guerre de Troie', ["le retour d'Ulysse à Ithaque", 'la fondation de Rome', 'la création du monde'], "L'Iliade raconte la colère d'Achille pendant la guerre de Troie ; l'Odyssée raconte le retour d'Ulysse."],
      ["Les Hébreux sont parmi les premiers peuples…", "monothéistes, qui croient en un Dieu unique", ['polythéistes, qui croient en de nombreux dieux', 'à pratiquer la démocratie', 'à utiliser la monnaie'], "Les Hébreux croient en un Dieu unique (Yahvé) : c'est le monothéisme, base du judaïsme."],
      ["Comment s'appelle le livre sacré des Hébreux ?", 'la Bible hébraïque', ['le Coran', 'les Évangiles', "l'Iliade"], "La Bible hébraïque (dont la Torah) rassemble les récits fondateurs du judaïsme. Les Évangiles appartiennent au Nouveau Testament chrétien."]
    ]),
    bank('Histoire : Rome et le monde antique', "Pense aux grandes étapes de Rome : fondation, République, Empire, christianisme.", [
      ["Qui sont, selon la légende, les fondateurs de Rome ?", 'Romulus et Rémus', ['Ulysse et Pénélope', 'Jules César et Auguste', 'Castor et Pollux'], "Selon la légende, les jumeaux Romulus et Rémus, nourris par une louve, fondent Rome en 753 av. J.-C."],
      ["Qui devient le premier empereur romain en 27 av. J.-C. ?", 'Auguste', ['Jules César', 'Néron', 'Constantin'], "Octave reçoit le titre d'Auguste en 27 av. J.-C. Jules César, assassiné en 44 av. J.-C., n'a jamais été empereur."],
      ["Qu'est-ce que la « Pax romana » ?", "la longue période de paix dans l'Empire (Ier-IIe siècles)", ['un traité entre Rome et Carthage', 'une loi sur les esclaves', 'une route reliant Rome à la Gaule'], "Pendant la paix romaine, les échanges se développent dans tout l'Empire autour de la Méditerranée."],
      ["Quel monument de Rome accueillait les combats de gladiateurs ?", 'le Colisée', ['le Parthénon', 'le Forum', 'le Panthéon'], "Le Colisée (amphithéâtre flavien) pouvait accueillir environ 50 000 spectateurs."],
      ["Comment s'appelle la place centrale d'une ville romaine ?", 'le forum', ["l'agora", "l'acropole", "l'atrium"], "Le forum est le cœur politique, religieux et commercial de la ville romaine. L'agora est son équivalent grec."],
      ["Qu'est-ce que la romanisation ?", "l'adoption du mode de vie, de la langue et des lois des Romains", ['la destruction des villes conquises', 'la fuite des peuples vaincus', "l'interdiction du latin"], "Dans les provinces, les populations adoptent progressivement le latin, les lois, les dieux et l'urbanisme romains."],
      ["En 212, que décide l'empereur Caracalla ?", "il accorde la citoyenneté romaine à tous les hommes libres de l'Empire", ["il interdit le christianisme", "il fonde Constantinople", "il abolit l'esclavage"], "L'édit de Caracalla (212) fait de tous les hommes libres de l'Empire des citoyens romains."],
      ["Quel empereur autorise le culte chrétien en 313 ?", 'Constantin', ['Auguste', 'Néron', 'Caracalla'], "Par l'édit de Milan (313), Constantin met fin aux persécutions des chrétiens. Néron, lui, les avait persécutés."],
      ["Sous quel empereur le christianisme devient-il religion officielle de l'Empire ?", 'Théodose', ['Constantin', 'Auguste', 'Trajan'], "En 380, Théodose fait du christianisme la religion officielle ; en 392, il interdit les cultes païens."],
      ["Quelle dynastie gouverne la Chine à l'époque de l'Empire romain ?", 'les Han', ['les Ming', 'les Qing', 'les Tang'], "Les Han règnent de 206 av. J.-C. à 220 ap. J.-C. ; la route de la soie relie leur empire au monde romain."]
    ]),
    bank('Géographie : habiter une métropole et les espaces de faible densité', "Pense aux études de cas : centre, périphérie, mobilités, campagnes.", [
      ["Qu'est-ce qu'une métropole ?", 'une grande ville qui concentre habitants, activités et pouvoirs', ['une petite ville de campagne', 'un quartier de banlieue', 'une ville construite au bord de la mer'], "Une métropole (Paris, Londres, Tokyo…) concentre la population, les emplois, les sièges d'entreprises et les décisions."],
      ["Comment appelle-t-on l'extension de la ville sur les campagnes qui l'entourent ?", "l'étalement urbain", ["l'exode rural", 'la littoralisation', 'la désertification'], "L'étalement urbain grignote les terres agricoles ; l'exode rural est le départ des habitants des campagnes vers les villes."],
      ["Comment appelle-t-on le quartier des affaires d'une métropole, comme La Défense à Paris ?", 'un quartier d’affaires (CBD)', ['une zone industrielle', 'un bidonville', 'un lotissement'], "Le CBD (Central Business District) concentre bureaux, sièges sociaux et tours."],
      ["Comment appelle-t-on un quartier d'habitat précaire construit sans autorisation ?", 'un bidonville', ['un lotissement', 'un grand ensemble', 'un écoquartier'], "Dans de nombreuses métropoles des pays pauvres ou émergents (Mumbai, Lagos…), une partie des habitants vit dans des bidonvilles."],
      ["Que mesure la densité de population ?", "le nombre moyen d'habitants par km²", ["le nombre total d'habitants d'un pays", 'la vitesse de croissance des villes', "le nombre d'immeubles par quartier"], "Densité = population ÷ superficie. Un espace de faible densité compte peu d'habitants par km²."],
      ["Comment appelle-t-on une personne qui fait chaque jour l'aller-retour entre son domicile et son travail ?", 'un navetteur', ['un nomade', 'un migrant', 'un touriste'], "Les navetteurs (ou « pendulaires ») vivent souvent en périphérie et travaillent au centre de la métropole."],
      ["Lequel de ces espaces est un espace de faible densité ?", 'un village de montagne', ['le centre de Paris', 'le quartier de La Défense', 'une banlieue de Tokyo'], "Montagnes, campagnes, déserts et grandes forêts sont des espaces peu peuplés."],
      ["Pourquoi certaines campagnes françaises gagnent-elles des habitants ?", 'des citadins viennent y chercher un cadre de vie agréable et des logements moins chers', ['les usines y sont plus nombreuses', 'les métropoles se vident complètement', "il est interdit d'habiter en ville"], "Avec la voiture et le télétravail, des citadins s'installent à la campagne : certains espaces ruraux se repeuplent."],
      ["Quel aménagement rend une ville plus durable ?", 'développer les transports en commun et les pistes cyclables', ['construire davantage d’autoroutes urbaines', 'multiplier les centres commerciaux en périphérie', 'agrandir les parkings du centre-ville'], "Une ville durable limite la pollution et l'étalement urbain : transports en commun, vélo, écoquartiers."],
      ["Qu'appelle-t-on la périphérie d'une ville ?", "les espaces situés autour du centre (banlieues, périurbain)", ['le centre historique', 'le quartier des affaires', 'la mairie et les monuments'], "Autour du centre-ville s'étendent les banlieues puis les espaces périurbains, souvent pavillonnaires."]
    ]),
    bank('Géographie : le monde habité et les littoraux', "Pense au planisphère des densités et aux littoraux étudiés en classe.", [
      ["Combien d'habitants compte environ la Terre aujourd'hui ?", 'un peu plus de 8 milliards', ['environ 2 milliards', 'environ 5 milliards', 'environ 15 milliards'], "La population mondiale a dépassé 8 milliards d'habitants en 2022."],
      ["Quels sont les trois grands foyers de peuplement du monde ?", "l'Asie de l'Est, l'Asie du Sud et l'Europe", ["l'Amazonie, le Sahara et la Sibérie", "l'Australie, le Canada et le Groenland", "l'Afrique du Nord, l'Antarctique et l'Océanie"], "Ces trois foyers rassemblent plus de la moitié de l'humanité. Déserts et forêts denses sont au contraire très peu peuplés."],
      ["Quel pays est le plus peuplé du monde depuis 2023 ?", "l'Inde", ['la Chine', 'les États-Unis', "l'Indonésie"], "En 2023, l'Inde a dépassé la Chine ; chacun de ces deux pays compte plus de 1,4 milliard d'habitants."],
      ["Comment appelle-t-on la partie de la Terre habitée de façon permanente ?", "l'œkoumène", ["l'hémisphère", "l'équateur", 'le littoral'], "L'œkoumène désigne l'ensemble des terres habitées par l'humanité."],
      ["Comment appelle-t-on la concentration des populations et des activités sur les côtes ?", 'la littoralisation', ['la désertification', "l'exode rural", 'la déforestation'], "Une grande partie de l'humanité vit à moins de 100 km des côtes : c'est la littoralisation."],
      ["Pourquoi les littoraux attirent-ils autant ?", 'pour le commerce maritime, le tourisme et un climat souvent agréable', ['parce que le sol y est toujours plus fertile', "parce qu'il n'y a aucun risque naturel", 'parce que les terres y sont gratuites'], "Ports, plages, activités industrielles et tourisme attirent habitants et entreprises sur les littoraux."],
      ["Quel risque menace particulièrement les littoraux ?", "l'érosion et la montée du niveau de la mer", ['les avalanches', 'la sécheresse des glaciers', 'les incendies de forêt tropicale'], "Le changement climatique fait monter le niveau des mers ; tempêtes et érosion font reculer certaines côtes."],
      ["Qu'est-ce qu'une station balnéaire ?", 'une ville du littoral aménagée pour le tourisme', ['un port de pêche industriel', 'une plateforme pétrolière', 'une réserve naturelle interdite au public'], "Exemples : La Grande-Motte, Biarritz, Cancún. Leur population varie fortement selon les saisons."],
      ["Où la population mondiale est-elle la plus clairsemée ?", 'dans les déserts, les hautes montagnes et les régions polaires', ['dans les grandes plaines fertiles', 'dans les deltas des grands fleuves', 'le long des côtes tempérées'], "Les milieux aux conditions difficiles (froid, aridité, altitude) sont peu peuplés."],
      ["Quelle part de l'humanité vit aujourd'hui en ville ?", 'plus de la moitié', ['environ un dixième', 'environ un quart', 'presque 100 %'], "Depuis 2007 environ, plus de la moitié de la population mondiale est urbaine, et cette part continue d'augmenter."]
    ]),
    bank('EMC : la République et la vie au collège', "Pense aux symboles de la République et à ce que tu vis au collège.", [
      ["Quelle est la devise de la République française ?", 'Liberté, Égalité, Fraternité', ['Travail, Famille, Patrie', 'Unité, Justice, Paix', 'Liberté, Sécurité, Propriété'], "« Liberté, Égalité, Fraternité » est inscrite dans la Constitution. « Travail, Famille, Patrie » était la devise du régime de Vichy."],
      ["Qui est Marianne ?", 'une figure symbolique qui représente la République', ['la première présidente de la République', 'une reine de France', "l'inventrice du drapeau tricolore"], "Marianne est une allégorie : son buste se trouve dans les mairies et sur les timbres."],
      ["Quel est l'hymne national de la France ?", 'La Marseillaise', ['Le Chant du départ', "L'Internationale", 'La Carmagnole'], "Écrite par Rouget de Lisle en 1792, La Marseillaise est l'hymne national depuis 1879."],
      ["Que commémore la fête nationale du 14 juillet ?", 'la prise de la Bastille (1789) et la fête de la Fédération (1790)', ["l'armistice de 1918", 'la fin de la Seconde Guerre mondiale', 'le sacre de Napoléon'], "Le 14 juillet est fête nationale depuis 1880. L'armistice de 1918 est commémoré le 11 novembre."],
      ["En quelle année l'ONU adopte-t-elle la Convention internationale des droits de l'enfant ?", '1989', ['1789', '1948', '1905'], "La CIDE (1989) protège les droits des moins de 18 ans : éducation, santé, protection contre les violences. 1948 est l'année de la Déclaration universelle des droits de l'homme."],
      ["Quel document fixe les droits et les devoirs des élèves au collège ?", 'le règlement intérieur', ['le Code civil', 'la Constitution', 'le bulletin trimestriel'], "Le règlement intérieur est voté par le conseil d'administration et s'applique à tous dans l'établissement."],
      ["Comment sont désignés les délégués de classe ?", 'ils sont élus par les élèves de la classe', ['ils sont choisis par le principal', 'ils sont tirés au sort chaque semaine', 'ce sont toujours les meilleurs élèves'], "Les délégués sont élus au scrutin secret ; ils représentent la classe, notamment au conseil de classe."],
      ["Que signifie la laïcité à l'école publique ?", "l'école est neutre : elle respecte toutes les croyances et n'en impose aucune", ['toutes les religions y sont enseignées comme vraies', 'il est interdit de croire en une religion', 'chaque élève choisit les règles qu’il respecte'], "La laïcité garantit la liberté de conscience ; depuis la loi de 2004, les signes religieux ostensibles sont interdits aux élèves des écoles publiques."],
      ["Quelles sont les couleurs du drapeau français, de la hampe vers l'extérieur ?", 'bleu, blanc, rouge', ['rouge, blanc, bleu', 'blanc, bleu, rouge', 'bleu, rouge, blanc'], "Le drapeau tricolore, né pendant la Révolution, est le drapeau national selon la Constitution."],
      ["Que faire si un camarade est victime de harcèlement ?", 'en parler rapidement à un adulte de confiance', ['ne rien dire pour ne pas avoir d’ennuis', 'se moquer avec les autres', 'attendre qu’il se débrouille seul'], "Le harcèlement (violences répétées, physiques, verbales ou en ligne) est puni par la loi. Témoin, tu peux aider en alertant un adulte."]
    ]),
    chrono('Repères chronologiques 6e', [
      ["Apparition d'Homo sapiens en Afrique", 'il y a environ 300 000 ans', "Notre espèce apparaît en Afrique avant de peupler toute la planète."],
      ['Débuts du Néolithique au Proche-Orient', 'vers 10 000 av. J.-C.', "Les humains se sédentarisent et inventent l'agriculture et l'élevage."],
      ["Invention de l'écriture en Mésopotamie", 'vers 3300 av. J.-C.', "Elle marque le passage de la Préhistoire à l'Histoire."],
      ['Construction de la pyramide de Khéops', 'vers 2560 av. J.-C.', "Elle est bâtie à Gizeh, en Égypte, pour le pharaon Khéops."],
      ['Premiers Jeux olympiques (selon la tradition)', '776 av. J.-C.', "Ils se déroulent à Olympie en l'honneur de Zeus."],
      ['Fondation légendaire de Rome', '753 av. J.-C.', 'Selon la légende, Romulus fonde Rome.'],
      ['Réformes de Clisthène à Athènes', '508 av. J.-C.', 'Elles posent les bases de la démocratie athénienne.'],
      ['Auguste devient le premier empereur romain', '27 av. J.-C.', "C'est le début de l'Empire romain."],
      ['Édit de Caracalla', '212', "Tous les hommes libres de l'Empire deviennent citoyens romains."],
      ['Édit de Milan', '313', "L'empereur Constantin autorise le culte chrétien."],
      ["Le christianisme devient religion officielle de l'Empire", '380', "L'empereur Théodose impose le christianisme (édit de Thessalonique)."]
    ])
  ],
  flashcards: cards('Histoire-Géo-EMC 6e', [
    ['Néolithique', 'Vers 10 000 av. J.-C. : agriculture, élevage, sédentarisation (Proche-Orient).'],
    ['Écriture', 'Vers 3300 av. J.-C. en Mésopotamie (cunéiforme) ; fin de la Préhistoire.'],
    ['Cité grecque', 'Ville + territoire formant un État indépendant (Athènes, Sparte…).'],
    ['Démocratie athénienne', 'Pouvoir aux citoyens (hommes libres nés de parents athéniens) ; réformes de Clisthène, 508 av. J.-C.'],
    ['Monothéisme', 'Croyance en un Dieu unique (Hébreux, judaïsme).'],
    ['Fondation de Rome', '753 av. J.-C. selon la légende (Romulus et Rémus).'],
    ['Empire romain', 'Débute en 27 av. J.-C. avec Auguste, premier empereur.'],
    ['Édit de Caracalla (212)', 'Citoyenneté romaine pour tous les hommes libres de l’Empire.'],
    ['Métropole', 'Grande ville qui concentre population, activités et pouvoirs de commandement.'],
    ['Densité de population', 'Nombre moyen d’habitants par km².'],
    ['Littoralisation', 'Concentration des hommes et des activités sur les littoraux.'],
    ['Symboles de la République', 'Marianne, drapeau tricolore, Marseillaise, devise, 14 juillet.']
  ])
};

// ---------- 6e · Anglais LV1 ----------
const EN6 = {
  generators: [
    genIrregular(20),
    genPresentSimple(),
    genEnNumbers(),
    bank('Grammaire anglaise', "Repère le sujet : est-il singulier ou pluriel ? À quelle personne ?", [
      ["🇬🇧 « She ___ two brothers. »", 'has got', ['have got', 'is got', 'haves got'], "« have got » (posséder) devient « has got » à la 3e personne du singulier (he, she, it)."],
      ["🇬🇧 « They ___ from Ireland. »", 'are', ['is', 'am', 'be'], "Le verbe be au présent : I am, you are, he/she/it is, we are, they are."],
      ["🇬🇧 Comment dit-on « le vélo de Tom » ?", "Tom's bike", ['the bike of Tom', 'Tom bike', "bike's Tom"], "Le cas possessif : possesseur + 's + objet possédé (Tom's bike). On ne dit pas « the bike of Tom » pour une personne."],
      ["🇬🇧 « ___ is your birthday? » — « It's in May. »", 'When', ['Where', 'Who', 'How'], "When = quand ; Where = où ; Who = qui ; How = comment. La réponse « in May » donne un moment."],
      ["🇬🇧 « I can ___ the guitar. »", 'play', ['plays', 'playing', 'to play'], "Après le modal « can », le verbe est toujours à la base verbale, sans -s ni « to »."],
      ["🇬🇧 Quel est le pluriel de « child » ?", 'children', ['childs', 'childrens', 'childes'], "Pluriels irréguliers à connaître : child → children, man → men, woman → women, foot → feet, tooth → teeth, mouse → mice."],
      ["🇬🇧 « ___ you like chocolate? » — « Yes, I do. »", 'Do', ['Does', 'Are', 'Is'], "Au present simple, la question se forme avec do (does seulement avec he/she/it) : Do you like…?"],
      ["🇬🇧 « My sister is twelve. ___ loves music. »", 'She', ['He', 'Her', 'It'], "« She » est le pronom sujet pour une fille ou une femme. « Her » est un pronom complément ou un adjectif possessif."],
      ["🇬🇧 « There ___ three cats in the garden. »", 'are', ['is', 'am', 'be'], "There is + singulier ; There are + pluriel (three cats)."],
      ["🇬🇧 « It's half past seven. » Quelle heure est-il ?", '7 h 30', ['6 h 30', '7 h 15', '7 h 45'], "half past = et demie ; quarter past = et quart ; quarter to = moins le quart."],
      ["🇬🇧 Quel article indéfini faut-il devant « apple » ?", 'an', ['a', 'some', 'any'], "On emploie « an » devant un son voyelle (an apple, an orange) et « a » devant un son consonne (a banana)."]
    ]),
    bank('Vocabulaire anglais', "Pense aux leçons sur l'école, la famille, les jours et les couleurs.", [
      ["🇬🇧 Comment dit-on « mercredi » ?", 'Wednesday', ['Tuesday', 'Thursday', 'Monday'], "Monday lundi, Tuesday mardi, Wednesday mercredi, Thursday jeudi, Friday vendredi. En anglais, les jours prennent une majuscule."],
      ["🇬🇧 Que signifie « pencil case » ?", 'une trousse', ['un crayon', 'un cartable', 'une gomme'], "pencil case = trousse ; pencil = crayon ; schoolbag = cartable ; rubber (UK) / eraser (US) = gomme."],
      ["🇬🇧 Comment dit-on « la grand-mère » ?", 'grandmother', ['godmother', 'granddaughter', 'stepmother'], "grandmother = grand-mère ; godmother = marraine ; granddaughter = petite-fille ; stepmother = belle-mère."],
      ["🇬🇧 Quelle couleur est « yellow » ?", 'jaune', ['vert', 'violet', 'orange'], "yellow = jaune ; green = vert ; purple = violet ; orange = orange."],
      ["🇬🇧 Comment dit-on « juillet » ?", 'July', ['June', 'January', 'August'], "June = juin, July = juillet, August = août. Les mois prennent une majuscule en anglais."],
      ["🇬🇧 Comment se présenter : « Je m'appelle Léa » ?", 'My name is Léa.', ['I call Léa.', 'My name are Léa.', "I'm name Léa."], "On dit « My name is… » ou « I'm… ». « I call » signifie « j'appelle »."],
      ["🇬🇧 Quel animal est « a horse » ?", 'un cheval', ['un cochon', 'un mouton', 'une chèvre'], "horse = cheval ; pig = cochon ; sheep = mouton ; goat = chèvre."],
      ["🇬🇧 « breakfast » est le repas…", 'du matin', ['du midi', 'du soir', 'du goûter'], "breakfast = petit-déjeuner ; lunch = déjeuner ; dinner = dîner."],
      ["🇬🇧 Comment dit-on « l'oncle » ?", 'uncle', ['aunt', 'cousin', 'nephew'], "uncle = oncle ; aunt = tante ; cousin = cousin(e) ; nephew = neveu."],
      ["🇬🇧 Quel est le contraire de « tall » (grand de taille) ?", 'short', ['big', 'fat', 'old'], "tall ≠ short (pour la taille d'une personne) ; big ≠ small ; old ≠ young."]
    ]),
    bank('Compréhension écrite', "Relis la phrase en cherchant les mots-clés de la question.", [
      ["🇬🇧 « Hi! I'm Sam. I'm eleven. I live in Leeds with my mum and my two sisters. » Combien de sœurs Sam a-t-il ?", 'deux', ['une', 'trois', 'aucune'], "« my two sisters » = mes deux sœurs."],
      ["🇬🇧 « I've got a dog called Max. » Qui est Max ?", 'un chien', ['un frère', 'un chat', 'un ami'], "« a dog called Max » = un chien qui s'appelle Max."],
      ["🇬🇧 « Every morning, Emma takes the bus to school. » Comment Emma va-t-elle à l'école ?", 'en bus', ['à pied', 'à vélo', 'en voiture'], "« takes the bus » = prend le bus. À pied se dirait « walks to school »."],
      ["🇬🇧 « My favourite subject is art because I love drawing. » Pourquoi cette matière ?", 'parce que cet élève adore dessiner', ['parce que le professeur est drôle', 'parce que c’est facile', 'parce qu’il y a peu de devoirs'], "« because I love drawing » = parce que j'adore dessiner."],
      ["🇬🇧 « It's raining today, so we are playing inside. » Quel temps fait-il ?", 'il pleut', ['il fait beau', 'il neige', 'il y a du vent'], "« It's raining » = il pleut ; « it's sunny » = il fait beau ; « it's snowing » = il neige."],
      ["🇬🇧 « The museum opens at 9 a.m. and closes at 5 p.m. » À quelle heure le musée ferme-t-il ?", 'à 17 h', ['à 9 h', 'à 15 h', 'à 19 h'], "p.m. = l'après-midi : 5 p.m. = 17 h. a.m. = le matin."],
      ["🇬🇧 « Jack is good at football but he can't swim. » Que ne sait pas faire Jack ?", 'nager', ['jouer au football', 'courir', 'chanter'], "« can't swim » = ne sait pas nager. « but » (mais) introduit l'opposition."],
      ["🇬🇧 « Lily's birthday is on the 3rd of May. » Quand est l'anniversaire de Lily ?", 'le 3 mai', ['le 3 mars', 'le 13 mai', 'le 30 mai'], "the 3rd (third) of May = le 3 mai. March = mars ; thirteenth = 13e ; thirtieth = 30e."],
      ["🇬🇧 « There is a big park next to my school. » Où est le parc ?", "à côté de l'école", ["derrière l'école", "en face de l'école", "loin de l'école"], "next to = à côté de ; behind = derrière ; opposite = en face de."],
      ["🇬🇧 « I don't like carrots, but I love tomatoes. » Qu'est-ce que cette personne adore ?", 'les tomates', ['les carottes', 'les deux', 'aucun des deux'], "« I don't like carrots » = je n'aime pas les carottes ; « I love tomatoes » = j'adore les tomates."]
    ])
  ],
  flashcards: cards('Anglais 6e', [
    ['to be (présent)', 'I am, you are, he/she/it is, we are, they are.'],
    ['have got', 'I have got / she has got (= posséder). Négation : I haven’t got.'],
    ['Present simple', 'Habitudes ; -s à la 3e personne du singulier : she plays, he watches.'],
    ['Négation au present simple', 'don’t / doesn’t + base verbale : She doesn’t like fish.'],
    ['can', 'can + base verbale (sans to, sans -s) : He can swim.'],
    ['Cas possessif', 'possesseur + ’s + objet : Tom’s bike.'],
    ['Mots interrogatifs', 'What quoi, Where où, When quand, Who qui, Why pourquoi, How comment.'],
    ['There is / There are', 'Il y a + singulier / Il y a + pluriel.'],
    ['go – went – gone', 'aller (verbe irrégulier).'],
    ['see – saw – seen', 'voir (verbe irrégulier).'],
    ['Les nombres 13 à 19', 'thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen.'],
    ['L’heure', 'half past = et demie ; quarter past = et quart ; quarter to = moins le quart.']
  ])
};

// ---------- 6e · Arts plastiques & Éducation musicale ----------
const ARTS6 = {
  generators: [
    bank('Arts plastiques : couleurs et matériaux', "Pense au cercle chromatique et aux techniques essayées en classe.", [
      ["Quelles sont les trois couleurs primaires en peinture ?", 'le magenta (rouge), le cyan (bleu) et le jaune', ['le rouge, le vert et le violet', "l'orange, le vert et le violet", 'le noir, le blanc et le gris'], "Les couleurs primaires ne s'obtiennent par aucun mélange ; en les mélangeant deux à deux, on obtient les couleurs secondaires (orange, vert, violet)."],
      ["Quelle couleur obtient-on en mélangeant du bleu et du jaune ?", 'du vert', ['du violet', "de l'orange", 'du marron'], "Bleu + jaune = vert ; rouge + jaune = orange ; rouge + bleu = violet."],
      ["Quelle est la couleur complémentaire du rouge ?", 'le vert', ['le bleu', 'le jaune', "l'orange"], "La complémentaire d'une primaire est le mélange des deux autres : bleu + jaune = vert. Côte à côte, deux complémentaires se renforcent."],
      ["Laquelle de ces couleurs est une couleur chaude ?", "l'orange", ['le bleu', 'le vert', 'le violet'], "Les couleurs chaudes (rouge, orange, jaune) évoquent le feu et le soleil ; les froides (bleu, vert, violet) l'eau et la glace."],
      ["Qu'est-ce qu'un collage ?", 'une œuvre faite en assemblant et collant des éléments sur un support', 'une peinture réalisée au doigt'.split('|').concat(['une sculpture en argile', 'un dessin au crayon de papier']), "Picasso et Braque ont introduit le collage (papiers collés) vers 1912."],
      ["Comment appelle-t-on une sculpture dont on peut faire le tour ?", 'une ronde-bosse', ['un bas-relief', 'une fresque', 'une mosaïque'], "Le bas-relief reste attaché à un fond ; la ronde-bosse se regarde sous tous les angles."],
      ["En arts plastiques, qu'appelle-t-on le support ?", "la surface ou l'objet sur lequel on réalise l'œuvre", ["l'outil qui sert à peindre", 'le cadre accroché au mur', 'le titre de l’œuvre'], "Papier, toile, carton, mur, bois… le support influence le résultat."],
      ["Qu'est-ce qu'un médium en arts plastiques ?", 'la matière utilisée pour créer (gouache, encre, fusain…)', ['le musée où l’œuvre est exposée', 'le format de la feuille', 'le nom de l’artiste'], "Le médium est la matière colorante ou le matériau ; l'outil (pinceau, éponge) sert à l'appliquer."],
      ["Qu'est-ce qu'un camaïeu ?", "l'emploi de plusieurs nuances d'une même couleur", ['un mélange de toutes les couleurs', 'un dessin uniquement en noir', 'une peinture sur verre'], "Un camaïeu de bleus va du bleu très clair au bleu très foncé."]
    ]),
    bank('Éducation musicale : instruments et son', "Pense à la façon dont le son est produit : corde, souffle, frappe ?", [
      ["À quelle famille appartient le violon ?", 'les cordes frottées', ['les cordes pincées', 'les bois', 'les cuivres'], "Le violon se joue avec un archet qui frotte les cordes, comme l'alto, le violoncelle et la contrebasse."],
      ["À quelle famille appartient la trompette ?", 'les cuivres', ['les bois', 'les percussions', 'les cordes'], "Dans les cuivres (trompette, cor, trombone, tuba), le son est produit par la vibration des lèvres dans l'embouchure."],
      ["La flûte traversière appartient à la famille des…", 'bois', ['cuivres', 'cordes', 'percussions'], "Même en métal, la flûte est un « bois » : le son ne naît pas de la vibration des lèvres mais du souffle sur un biseau."],
      ["Quel paramètre du son distingue un son aigu d'un son grave ?", 'la hauteur', ["l'intensité", 'la durée', 'le timbre'], "Hauteur = aigu/grave ; intensité = fort/doux ; durée = long/court ; timbre = « couleur » propre à chaque instrument."],
      ["Que signifie « forte » sur une partition ?", 'jouer fort', ['jouer doucement', 'jouer vite', 'jouer lentement'], "Les nuances : piano (doux), forte (fort), crescendo (de plus en plus fort), decrescendo (de moins en moins fort)."],
      ["Qu'est-ce que le tempo ?", "la vitesse d'un morceau", 'le volume sonore'.split('|').concat(['le nombre de musiciens', 'la hauteur des notes']), "Le tempo peut être lent (largo, adagio), modéré (moderato) ou rapide (allegro, presto)."],
      ["Qu'est-ce qu'un ostinato ?", 'un motif musical répété en boucle', ['un solo improvisé', 'un silence', 'un changement de tempo'], "L'ostinato (« obstiné » en italien) sert souvent d'accompagnement, comme dans le Boléro de Ravel."],
      ["À quoi sert le timbre d'un son ?", "à reconnaître l'instrument ou la voix qui le produit", ['à savoir si le son est fort', 'à mesurer sa durée', 'à compter les temps'], "Une même note jouée au piano et à la flûte n'a pas le même timbre."],
      ["Qui dirige un orchestre symphonique ?", "le chef d'orchestre", ['le soliste', 'le compositeur', 'le premier violon'], "Avec sa baguette, le chef d'orchestre donne le tempo, les départs et les nuances."]
    ]),
    bank('Histoire des arts', "Pense aux œuvres écoutées et observées en classe cette année.", [
      ["Qui a composé « Pierre et le Loup » (1936) ?", 'Sergueï Prokofiev', ['Mozart', 'Vivaldi', 'Camille Saint-Saëns'], "Dans ce conte musical, chaque personnage est représenté par un instrument ou une famille d'instruments."],
      ["Dans « Pierre et le Loup », quel instrument joue l'oiseau ?", 'la flûte traversière', ['le hautbois', 'la clarinette', 'le basson'], "La flûte (aiguë et agile) est l'oiseau ; le hautbois est le canard, la clarinette le chat, le basson le grand-père, les cors le loup."],
      ["Qui a composé « Le Carnaval des animaux » ?", 'Camille Saint-Saëns', ['Prokofiev', 'Maurice Ravel', 'Georges Bizet'], "Saint-Saëns l'écrit en 1886 ; « Le Cygne » en est la pièce la plus célèbre."],
      ["Qui a composé « Les Quatre Saisons » ?", 'Antonio Vivaldi', ['Jean-Sébastien Bach', 'Mozart', 'Beethoven'], "Vivaldi, compositeur baroque vénitien, publie ces quatre concertos pour violon vers 1725."],
      ["Qui a composé « Une petite musique de nuit » ?", 'Mozart', ['Beethoven', 'Vivaldi', 'Bach'], "Wolfgang Amadeus Mozart (1756-1791), compositeur autrichien de la période classique, l'écrit en 1787."],
      ["Qui a composé « L'Apprenti sorcier » (1897) ?", 'Paul Dukas', ['Maurice Ravel', 'Claude Debussy', 'Hector Berlioz'], "Ce poème symphonique, inspiré de Goethe, est célèbre grâce au film Fantasia de Disney."],
      ["La grotte de Lascaux est célèbre pour…", "ses peintures d'animaux préhistoriques", ['ses pyramides', 'ses temples grecs', 'ses mosaïques romaines'], "Les peintures de Lascaux (Dordogne) ont été réalisées il y a environ 18 000 ans."],
      ["Où se trouvent les pyramides de Khéops, Khéphren et Mykérinos ?", 'à Gizeh, en Égypte', ['à Louxor, en Égypte', 'à Athènes, en Grèce', 'à Rome, en Italie'], "Ces pyramides, tombeaux de pharaons, ont été construites il y a plus de 4 500 ans."],
      ["Qu'est-ce qu'une mosaïque romaine ?", 'une image faite de petits cubes de pierre ou de verre assemblés', 'une statue en bronze'.split('|').concat(['une peinture sur toile', 'un vase décoré']), "Les tesselles colorées décoraient les sols et les murs des villas romaines."]
    ]),
    bank('Pratiques artistiques', "Pense à ce que tu as pratiqué en classe : chant, dessin, image.", [
      ["Qu'est-ce qu'un canon en chant ?", 'une même mélodie reprise en décalé par plusieurs groupes', ['un chant très fort', 'un chant sans paroles', 'une chanson militaire'], "Exemple : « Frère Jacques ». Les voix se superposent en entrant l'une après l'autre."],
      ["Que signifie chanter « a cappella » ?", 'chanter sans accompagnement instrumental', ['chanter en solo', 'chanter très aigu', 'chanter dans une église uniquement'], "« A cappella » signifie « à la manière de la chapelle » : seulement des voix."],
      ["Comment appelle-t-on la partie d'une chanson qui revient entre les couplets ?", 'le refrain', ['le couplet', "l'introduction", 'le pont'], "Les couplets changent de paroles ; le refrain revient à l'identique."],
      ["Qu'est-ce qu'une esquisse ?", 'un dessin rapide qui prépare une œuvre', ['une œuvre terminée et encadrée', 'une sculpture en marbre', 'une photographie retouchée'], "L'esquisse permet de chercher la composition avant de réaliser l'œuvre."],
      ["Qu'est-ce qu'un autoportrait ?", "un portrait de l'artiste par lui-même", "le portrait d'une voiture".split('|').concat(['un paysage', 'une nature morte']), "Van Gogh et Frida Kahlo ont peint de nombreux autoportraits."],
      ["Que représente une nature morte ?", 'des objets inanimés (fruits, vases, objets du quotidien)', ['des animaux sauvages', 'un paysage de montagne', 'une scène de bataille'], "La nature morte est un genre pictural, très pratiqué au XVIIe siècle."],
      ["Qu'est-ce que le cadrage d'une image ?", "le choix de ce que l'on montre dans les limites de l'image", ['la couleur du cadre', 'le prix de l’œuvre', 'la signature de l’artiste'], "Cadrer, c'est choisir ce qui entre dans l'image et ce qui reste hors-champ."],
      ["Dans un paysage, qu'appelle-t-on le premier plan ?", 'la partie la plus proche du spectateur', ["la ligne d'horizon", 'le ciel', 'la partie la plus éloignée'], "Premier plan (proche), second plan, arrière-plan (lointain) : cette organisation crée la profondeur."]
    ])
  ],
  flashcards: cards('Arts 6e', [
    ['Couleurs primaires', 'Magenta (rouge), cyan (bleu), jaune.'],
    ['Couleurs secondaires', 'Orange (rouge + jaune), vert (bleu + jaune), violet (rouge + bleu).'],
    ['Couleurs complémentaires', 'Rouge/vert, bleu/orange, jaune/violet.'],
    ['Ronde-bosse', 'Sculpture dont on peut faire le tour.'],
    ['Médium', 'Matière utilisée pour créer (gouache, encre, fusain, pastel…).'],
    ['Familles d’instruments', 'Cordes (frottées, pincées, frappées), bois, cuivres, percussions.'],
    ['Paramètres du son', 'Hauteur, durée, intensité, timbre.'],
    ['Nuances', 'piano = doux ; forte = fort ; crescendo = de plus en plus fort.'],
    ['Tempo', 'Vitesse d’un morceau (largo, moderato, allegro…).'],
    ['Ostinato', 'Motif répété en boucle.'],
    ['Pierre et le Loup', 'Prokofiev, 1936 : un personnage = un instrument.'],
    ['Lascaux', 'Grotte ornée de peintures préhistoriques (environ 18 000 ans).']
  ])
};

// ---------- 6e · EPS ----------
const EPS6 = {
  generators: [
    bank('Santé et effort', "Pense à ce que ressent ton corps avant, pendant et après une séance de sport.", [
      ["À quoi sert l'échauffement ?", "à préparer le corps à l'effort et à limiter les blessures", ['à se fatiguer avant le match', 'à remplacer les étirements', 'à perdre du temps'], "L'échauffement élève progressivement la température des muscles et la fréquence cardiaque."],
      ["Quand faut-il boire lors d'une activité physique ?", "avant, pendant et après l'effort, par petites gorgées", ["uniquement à la fin de la séance", "jamais pendant l'effort", 'seulement quand on a très soif'], "La soif est déjà un signe de déshydratation : il faut boire régulièrement de l'eau."],
      ["Où peut-on prendre facilement son pouls ?", 'au poignet ou au cou', ['au genou', 'à la cheville', 'au coude'], "On place l'index et le majeur sur l'artère du poignet ou du cou et on compte les battements pendant 15 secondes (× 4)."],
      ["Combien de temps d'activité physique par jour recommande-t-on aux jeunes ?", 'au moins 60 minutes', ['10 minutes', '30 minutes par semaine', 'aucune recommandation'], "L'Organisation mondiale de la santé recommande au moins 60 minutes d'activité physique modérée à intense par jour pour les 5-17 ans."],
      ["Que fait la fréquence cardiaque pendant un effort intense ?", 'elle augmente', ['elle diminue', 'elle reste identique', "elle s'arrête"], "Le cœur bat plus vite pour apporter plus d'oxygène aux muscles, puis il ralentit pendant la récupération."],
      ["Qu'est-ce que le retour au calme ?", "des exercices légers et des étirements doux après l'effort", 'un sprint final'.split('|').concat(['une sieste pendant le cours', 'un match supplémentaire']), "Il aide le corps à récupérer progressivement."],
      ["Que faire si tu ressens une douleur pendant le sport ?", "t'arrêter et prévenir l'enseignant", ['continuer pour ne pas perdre', 'prendre un médicament seul', 'ne rien dire'], "Une douleur est un signal d'alerte : il faut s'arrêter pour éviter d'aggraver une blessure."],
      ["Pourquoi le sommeil est-il important pour un sportif ?", 'il permet au corps de récupérer et de progresser', 'il augmente la soif'.split('|').concat(['il remplace l’entraînement', 'il n’a aucun effet']), "Pendant le sommeil, les muscles se réparent et la mémoire des apprentissages se consolide."]
    ]),
    bank('Sports collectifs et de raquette', "Rappelle-toi les règles vues en cours d'EPS.", [
      ["Combien de joueurs par équipe sont sur le terrain au handball ?", '7 (dont le gardien)', ['5', '6', '11'], "Au handball : 6 joueurs de champ + 1 gardien."],
      ["Combien de joueurs par équipe sont sur le terrain au basket-ball ?", '5', ['6', '7', '11'], "Au basket, chaque équipe a 5 joueurs sur le terrain."],
      ["Au volley-ball, combien de touches de balle maximum une équipe peut-elle faire avant de renvoyer ?", '3', ['2', '4', '5'], "Trois touches maximum (souvent manchette, passe, attaque) ; un même joueur ne peut pas toucher deux fois de suite."],
      ["Au basket, comment s'appelle la faute qui consiste à faire plus de deux pas ballon en main ?", 'le marcher', ['la reprise de dribble', 'le hors-jeu', 'le carton jaune'], "Le marcher fait perdre le ballon. La reprise de dribble, c'est dribbler, s'arrêter puis redribbler."],
      ["Au handball, quelle zone est réservée au gardien ?", 'la zone des 6 mètres', ['la zone des 9 mètres', 'le rond central', 'la ligne de touche'], "Les joueurs de champ ne peuvent pas poser le pied dans la zone des 6 mètres."],
      ["Au football, combien de joueurs par équipe sont sur le terrain ?", '11', ['7', '9', '15'], "11 joueurs dont un gardien. Le rugby à XV compte 15 joueurs."],
      ["Au rugby, dans quelle direction fait-on les passes à la main ?", "vers l'arrière ou à plat", "vers l'avant".split('|').concat(['uniquement vers la droite', 'dans n’importe quelle direction']), "Une passe vers l'avant est un « en-avant » : c'est une faute."],
      ["Au badminton, comment s'appelle l'objet que l'on frappe ?", 'le volant', ['la balle', 'le palet', 'le ballon'], "Le volant est frappé avec une raquette par-dessus un filet."]
    ]),
    bank('Athlétisme et natation', "Pense aux consignes de sécurité et aux règles des épreuves.", [
      ["Au relais, que se transmettent les coureurs ?", 'un témoin', ['un ballon', 'un drapeau', 'un dossard'], "Le témoin est un petit tube passé d'un coureur à l'autre."],
      ["Où doit se faire la transmission du témoin ?", 'dans la zone de transmission', ["n'importe où sur la piste", 'après la ligne d’arrivée', 'dans le couloir voisin'], "Si le témoin est transmis hors de la zone, l'équipe est disqualifiée."],
      ["En saut en longueur, d'où le saut est-il mesuré ?", "de la planche d'appel jusqu'à la marque la plus proche dans le sable", ['du point de départ de la course', 'du milieu du bac à sable', 'de l’endroit où le pied décolle, même avant la planche'], "Il faut prendre l'appel sans mordre la planche, sinon le saut est nul."],
      ["Qu'est-ce qu'un faux départ ?", 'partir avant le signal du starter', 'tomber pendant la course'.split('|').concat(['changer de couloir', 'arriver dernier']), "Le coureur doit attendre le signal (coup de pistolet ou « Partez ! »)."],
      ["En course de durée, quelle allure faut-il choisir ?", 'une allure régulière que l’on peut tenir longtemps', 'partir le plus vite possible'.split('|').concat(['alterner sprint et marche sans arrêt', 'courir le plus lentement possible']), "Une allure régulière évite l'essoufflement et permet de tenir jusqu'au bout."],
      ["Que permet l'ASNS (attestation du savoir-nager en sécurité) ?", "d'attester qu'un élève sait se déplacer dans l'eau en sécurité", ['de devenir maître-nageur', 'de participer aux Jeux olympiques', 'de plonger du plongeoir de 10 m'], "L'ASNS valide des compétences : entrer dans l'eau, se déplacer, s'immerger, se maintenir en surface, se repérer."],
      ["Quelle nage se pratique sur le ventre avec des mouvements de bras alternés ?", 'le crawl', ['la brasse', 'le dos crawlé', 'le papillon'], "En brasse et en papillon, les bras agissent en même temps ; le dos crawlé se nage sur le dos."],
      ["En course de haies, quel est l'objectif ?", 'franchir les haies sans casser sa vitesse', 'sauter le plus haut possible au-dessus de chaque haie'.split('|').concat(['s’arrêter devant chaque haie', 'faire tomber les haies']), "On attaque la haie avec la jambe tendue et on la franchit au plus près pour garder sa vitesse."]
    ]),
    bank('Rôles et valeurs du sport', "Pense aux rôles que tu as tenus en cours : arbitre, juge, coach, pareur.", [
      ["Qu'est-ce que le fair-play ?", "respecter les règles, l'adversaire, l'arbitre et ses partenaires", 'gagner à tout prix'.split('|').concat(['contester chaque décision', 'jouer seul sans passer le ballon']), "Le fair-play, c'est l'esprit sportif : on peut vouloir gagner tout en restant respectueux."],
      ["Quel est le rôle d'un arbitre ?", 'faire respecter les règles et prendre les décisions', 'encourager une équipe'.split('|').concat(['marquer des points', 'choisir les joueurs']), "L'arbitre est neutre : ses décisions doivent être respectées."],
      ["Que fait un juge en gymnastique ou en acrosport ?", 'il observe et note la prestation selon des critères', ['il fait la démonstration', 'il chronomètre les coureurs', 'il arbitre un match'], "Le juge s'appuie sur une grille de critères (difficulté, exécution, tenue)."],
      ["Que fait un chronométreur ?", 'il mesure les temps des coureurs', 'il donne les cartons'.split('|').concat(['il compte les buts', 'il porte le témoin']), "Il déclenche le chronomètre au signal de départ et l'arrête au passage de la ligne."],
      ["En acrosport, comment appelle-t-on l'élève qui porte ses partenaires ?", 'le porteur', ['le voltigeur', 'le pareur', 'le juge'], "Le porteur soutient ; le voltigeur est porté ; le pareur assure la sécurité."],
      ["En acrosport, quel est le rôle du pareur ?", 'sécuriser la figure pour éviter les chutes', 'noter la figure'.split('|').concat(['faire le plus de figures possible', 'porter le voltigeur seul']), "Le pareur reste à proximité, prêt à amortir une chute."],
      ["En course d'orientation, que signifie « orienter sa carte » ?", 'la tourner dans le même sens que le terrain', ['la plier en quatre', 'écrire le nord dessus', 'la tenir à l’envers'], "Une carte orientée correspond à ce que tu vois : les éléments sont dans la même direction."],
      ["Comment bien réagir quand on perd un match ?", "féliciter l'adversaire et analyser ce qui peut être amélioré", ['quitter le terrain sans saluer', "accuser l'arbitre", "abandonner l'activité"], "Perdre fait partie du sport : on apprend de ses erreurs et on respecte le vainqueur."]
    ])
  ],
  flashcards: cards('EPS 6e', [
    ['Échauffement', 'Prépare muscles, articulations et cœur à l’effort ; limite les blessures.'],
    ['Hydratation', 'Boire de l’eau avant, pendant et après l’effort.'],
    ['Pouls', 'Au poignet ou au cou ; battements en 15 s × 4 = battements par minute.'],
    ['Handball', '7 joueurs dont un gardien ; zone des 6 m réservée au gardien.'],
    ['Basket-ball', '5 joueurs ; fautes : marcher, reprise de dribble.'],
    ['Volley-ball', '6 joueurs ; 3 touches maximum par équipe.'],
    ['Relais', 'Transmission du témoin dans la zone de transmission.'],
    ['ASNS', 'Attestation du savoir-nager en sécurité.'],
    ['Acrosport', 'Porteur, voltigeur, pareur (sécurité), juge.'],
    ['Fair-play', 'Respect des règles, de l’adversaire, de l’arbitre et des partenaires.'],
    ['Course de durée', 'Choisir une allure régulière et la tenir.'],
    ['Course d’orientation', 'Orienter sa carte dans le même sens que le terrain.']
  ])
};

/* ======================================================================
 * 3. CINQUIÈME (cycle 4 — vers l'autonomie)
 * ==================================================================== */

// ---------- 5e · Français ----------
const T5 = ['present', 'imparfait', 'futur', 'passe_simple', 'conditionnel', 'passe_compose'];
const FR5 = {
  generators: [
    genConj(V_ALL, T5, ['passe_simple']),
    genTenseId(V_ALL, T5),
    genHomophones(['a/à', 'et/est', 'son/sont', 'on/ont', "ces/ses/c'est/s'est", "la/là/l'a", 'ce/se', 'peu/peut/peux', 'leur/leurs']),
    genAccordAdj(),
    genAccordPP(['etre', 'avoir', 'que']),
    genNature(5),
    genFonction(5),
    genFigures(5),
    bank('Vocabulaire et étymologie', "Pense au vocabulaire de la chevalerie et décompose le mot.", [
      ["Qu'est-ce qu'un suzerain ?", 'un seigneur qui a des vassaux', ['un paysan non libre', 'un moine copiste', 'un marchand de la ville'], "Le suzerain donne un fief à son vassal ; en échange, le vassal lui doit fidélité, aide militaire et conseil."],
      ["Comment appelle-t-on la cérémonie où un jeune noble devient chevalier ?", "l'adoubement", "l'hommage".split('|').concat(['le sacre', 'le baptême']), "Lors de l'adoubement, le jeune homme reçoit ses armes. L'hommage est la cérémonie où le vassal jure fidélité au seigneur."],
      ["Qu'est-ce qu'un fief ?", "une terre confiée par un seigneur à son vassal", ['un château fort', "l'impôt payé à l'Église", 'un tournoi de chevaliers'], "Le fief (souvent une terre) est remis lors de la cérémonie de l'hommage."],
      ["Que désigne le mot « destrier » ?", 'le cheval de bataille du chevalier', "l'épée du chevalier".split('|').concat(['le serviteur du seigneur', 'le bouclier décoré']), "Le destrier est un cheval puissant, mené de la main droite (dextre) par l'écuyer : d'où son nom."],
      ["Qu'est-ce qu'un écuyer ?", "un jeune noble au service d'un chevalier", ['un paysan qui cultive la terre', 'un moine', 'un troubadour'], "L'écuyer porte l'écu (le bouclier) du chevalier et apprend le métier des armes avant son adoubement."],
      ["Qu'appelle-t-on l'amour courtois ?", "un amour raffiné où le chevalier se met au service de sa dame", ['un mariage arrangé par le roi', 'un amour entre paysans', 'une chanson à boire'], "Le mot « courtois » vient de « cour » : le chevalier courtois est loyal, généreux et dévoué à sa dame."],
      ["Que signifie le préfixe latin « bene- » (bénéfique, bienveillant) ?", 'bien', ['mal', 'deux', 'avant'], "bene = bien (bénédiction, bienfaiteur) ; male = mal (malveillant, malhonnête)."],
      ["Dans quel registre de langue est la phrase « J'ai bouffé avec mes potes » ?", 'familier', ['courant', 'soutenu', 'poétique'], "Registre courant : « J'ai mangé avec mes amis ». Registre soutenu : « J'ai dîné en compagnie de mes amis »."],
      ["« Je vous prie de bien vouloir m'excuser » appartient au registre…", 'soutenu', ['familier', 'courant', 'argotique'], "Le registre soutenu utilise un vocabulaire recherché et des tournures polies, à l'écrit ou dans des situations formelles."],
      ["Quel est le contraire de « loyal » ?", 'déloyal', ['fidèle', 'honnête', 'sincère'], "Le préfixe « dé- » forme le contraire. Fidèle, honnête et sincère sont proches de « loyal »."],
      ["Le mot « merveilleux » vient du latin mirabilia, qui signifie…", 'choses étonnantes', ['choses ordinaires', 'choses effrayantes', 'choses anciennes'], "Le merveilleux désigne ce qui provoque l'admiration et l'étonnement : fées, enchanteurs, objets magiques."]
    ]),
    bank('Culture littéraire', "Rappelle-toi les romans de chevalerie, les comédies de Molière et le vocabulaire du théâtre.", [
      ["Qui a écrit Perceval ou le Conte du Graal ?", 'Chrétien de Troyes', ['Molière', 'Marie de France', 'Rabelais'], "Chrétien de Troyes (XIIe siècle) a écrit des romans de chevalerie : Yvain, Lancelot, Perceval. Marie de France a écrit des lais."],
      ["Comment s'appelle le roi des chevaliers de la Table ronde ?", 'Arthur', ['Charlemagne', 'Lancelot', 'Perceval'], "Le roi Arthur règne à Camelot ; Lancelot et Perceval sont des chevaliers de la Table ronde."],
      ["Dans le Roman de Renart, comment s'appelle le loup, ennemi favori de Renart ?", 'Ysengrin', ['Chantecler', 'Tibert', 'Noble'], "Chantecler est le coq, Tibert le chat et Noble le lion, roi des animaux."],
      ["Qui a écrit Les Fourberies de Scapin (1671) ?", 'Molière', ['Corneille', 'Racine', 'Marivaux'], "Molière (1622-1673) est le grand auteur de comédies du XVIIe siècle : Le Médecin malgré lui, L'Avare, Le Bourgeois gentilhomme."],
      ["Au théâtre, comment appelle-t-on les indications de mise en scène écrites par l'auteur ?", 'les didascalies', ['les répliques', 'les tirades', 'les apartés'], "Les didascalies (souvent en italique) précisent les gestes, les décors, le ton. Elles ne sont pas prononcées."],
      ["Qu'est-ce qu'un aparté ?", "une réplique dite pour le public, que les autres personnages sont censés ne pas entendre", ['une longue réplique', 'un personnage seul en scène', 'la fin de la pièce'], "L'aparté crée une complicité avec le spectateur. Un personnage seul qui parle fait un monologue."],
      ["Qu'est-ce qu'une tirade ?", "une longue réplique d'un personnage", ['une indication de mise en scène', 'un dialogue très rapide', 'un changement de décor'], "Une tirade est une longue prise de parole, comme la tirade du nez dans Cyrano de Bergerac."],
      ["Selon Molière, quel est le devoir de la comédie ?", 'corriger les hommes en les divertissant', ['faire pleurer le public', 'raconter la vie des rois', 'enseigner le latin'], "Dans la préface du Tartuffe, Molière écrit que « le devoir de la comédie [est] de corriger les hommes en les divertissant »."],
      ["Dans Le Médecin malgré lui, qui est Sganarelle ?", 'un bûcheron forcé de se faire passer pour médecin', ['un vrai médecin célèbre', 'un roi déguisé', 'un valet amoureux'], "Sa femme Martine, pour se venger, fait croire qu'il est un grand médecin qui n'avoue son talent que sous les coups de bâton."],
      ["Qui a raconté son voyage jusqu'en Chine dans Le Devisement du monde ?", 'Marco Polo', ['Christophe Colomb', 'Ulysse', 'Jules Verne'], "Marco Polo, marchand vénitien, dicte ce récit vers 1298 après des années passées en Asie."],
      ["Qui a écrit Robinson Crusoé (1719) ?", 'Daniel Defoe', ['Jules Verne', 'Jonathan Swift', 'Michel Tournier'], "Michel Tournier en a écrit une réécriture : Vendredi ou la vie sauvage (1971)."]
    ])
  ],
  flashcards: cards('Français 5e', [
    ['Conditionnel présent', 'Radical du futur + terminaisons de l’imparfait : je chanterais, nous ferions.'],
    ['Passé simple (types)', '-a (chanta), -i (finit, prit), -u (fut, put), -in (vint).'],
    ['Accord avec « avoir »', 'Pas d’accord avec le sujet ; accord avec le COD s’il est placé avant : les pommes que j’ai mangées.'],
    ['ces / ses / c’est / s’est', 'ces = démonstratif ; ses = possessif ; c’est = cela est ; s’est = verbe pronominal.'],
    ['peu / peut / peux', 'peu = pas beaucoup ; peut/peux = verbe pouvoir (pouvait).'],
    ['Didascalie', 'Indication de mise en scène, non prononcée.'],
    ['Aparté', 'Réplique adressée au public, que les autres personnages n’entendent pas.'],
    ['Monologue / tirade', 'Monologue : personnage seul. Tirade : longue réplique devant d’autres personnages.'],
    ['Roman de chevalerie', 'Chrétien de Troyes (XIIe s.) : Perceval, Yvain, Lancelot.'],
    ['Antithèse', 'Rapprochement de deux idées opposées.'],
    ['Gradation', 'Suite de termes d’intensité croissante : « Va, cours, vole ».'],
    ['Registres de langue', 'Familier, courant, soutenu.']
  ])
};

// ---------- 5e · Histoire-Géographie-EMC ----------
const HG5 = {
  generators: [
    bank('Histoire : chrétientés et islam (VIe-XIIIe s.)', "Pense aux trois grandes civilisations : Byzance, l'Occident carolingien, le monde musulman.", [
      ["Quelle est la capitale de l'Empire byzantin ?", 'Constantinople', ['Rome', 'Aix-la-Chapelle', 'Bagdad'], "Constantinople (aujourd'hui Istanbul), fondée par Constantin, est la capitale de l'Empire romain d'Orient jusqu'en 1453."],
      ["En quelle année Charlemagne est-il couronné empereur ?", '800', ['622', '987', '1095'], "Le jour de Noël 800, Charlemagne est couronné empereur à Rome par le pape Léon III."],
      ["Où Charlemagne est-il couronné empereur ?", 'à Rome, par le pape', ['à Aix-la-Chapelle, par un évêque', 'à Reims, par un abbé', 'à Constantinople, par le patriarche'], "Aix-la-Chapelle est sa capitale ; Reims est le lieu du sacre des rois de France."],
      ["Qu'est-ce que l'Hégire (622) ?", 'le départ de Mahomet de La Mecque vers Médine', ['la mort de Mahomet', 'la construction de la Kaaba', 'la prise de Jérusalem'], "L'Hégire marque l'an 1 du calendrier musulman."],
      ["Comment s'appelle le livre sacré des musulmans ?", 'le Coran', ['la Bible', 'la Torah', 'les Évangiles'], "Pour les musulmans, le Coran rassemble la parole de Dieu (Allah) révélée à Mahomet."],
      ["Comment appelle-t-on le successeur de Mahomet à la tête de la communauté musulmane ?", 'le calife', ['le pape', "l'empereur", 'le patriarche'], "Le calife détient le pouvoir politique et religieux. Les califes omeyyades règnent à Damas, puis les Abbassides à Bagdad."],
      ["Quelle ville est fondée en 762 pour devenir la capitale des califes abbassides ?", 'Bagdad', ['Damas', 'Cordoue', 'Le Caire'], "Bagdad devient un grand centre de savoir (Maison de la sagesse) et de commerce."],
      ["Quel empereur byzantin du VIe siècle est célèbre pour son code de lois ?", 'Justinien', ['Charlemagne', 'Constantin', 'Théodose'], "Justinien fait rassembler le droit romain et construire la basilique Sainte-Sophie."],
      ["En quelle année se séparent l'Église d'Orient (orthodoxe) et l'Église d'Occident (catholique) ?", '1054', ['800', '1095', '1453'], "Le schisme de 1054 sépare les chrétiens orthodoxes (patriarche de Constantinople) et catholiques (pape de Rome)."],
      ["En 1095, à quoi le pape Urbain II appelle-t-il les chrétiens ?", 'à partir en croisade pour Jérusalem', ['à construire des cathédrales', 'à élire un empereur', 'à traduire la Bible'], "La première croisade aboutit à la prise de Jérusalem en 1099."]
    ]),
    bank('Histoire : société, Église et pouvoir dans l’Occident féodal', "Pense aux liens entre seigneurs, vassaux, paysans, et au pouvoir du roi.", [
      ["Qu'est-ce qu'un vassal ?", "un noble qui a juré fidélité à un seigneur en échange d'un fief", ['un paysan libre', 'un moine', 'un marchand'], "Le vassal doit à son seigneur l'aide militaire et le conseil."],
      ["Comment s'appelle la cérémonie où le vassal jure fidélité à son seigneur ?", "l'hommage", ["l'adoubement", 'le sacre', 'la croisade'], "Lors de l'hommage, le vassal place ses mains dans celles du seigneur et reçoit un fief."],
      ["Comment s'appellent les paysans non libres attachés à la terre du seigneur ?", 'les serfs', ['les vilains', 'les bourgeois', 'les vassaux'], "Les serfs ne peuvent ni quitter la seigneurie ni se marier sans autorisation. Les vilains sont des paysans libres."],
      ["Quelles sont les trois catégories de la société médiévale selon les clercs ?", 'ceux qui prient, ceux qui combattent, ceux qui travaillent', ['les rois, les empereurs, les papes', 'les riches, les pauvres, les marchands', 'les Grecs, les Romains, les Francs'], "C'est la société des trois ordres : clergé, noblesse, paysans (tiers état)."],
      ["Qui fonde la dynastie des Capétiens en 987 ?", 'Hugues Capet', ['Charlemagne', 'Philippe Auguste', 'Louis IX'], "Hugues Capet est élu roi par les grands seigneurs ; ses descendants régneront pendant des siècles."],
      ["Quelle victoire de Philippe Auguste renforce le pouvoir royal en 1214 ?", 'Bouvines', ['Poitiers', 'Azincourt', 'Hastings'], "À Bouvines, Philippe Auguste bat l'empereur germanique et ses alliés."],
      ["Quel roi de France, mort en croisade en 1270, est appelé Saint Louis ?", 'Louis IX', ['Louis XIV', 'Philippe le Bel', 'Hugues Capet'], "Louis IX est réputé pour sa piété et sa justice ; il est canonisé en 1297."],
      ["Quel style architectural se caractérise par l'arc brisé, la croisée d'ogives et de grands vitraux ?", 'le gothique', ['le roman', 'le baroque', 'le classique'], "Le gothique apparaît au XIIe siècle (basilique de Saint-Denis) ; le roman, plus ancien, a des murs épais et des arcs en plein cintre."],
      ["Quand se déroule la guerre de Cent Ans ?", 'de 1337 à 1453', ['de 1095 à 1099', 'de 1494 à 1559', 'de 1562 à 1598'], "Elle oppose les rois de France et d'Angleterre pendant 116 ans, entrecoupés de trêves."],
      ["Quelle jeune femme contribue à libérer Orléans assiégée par les Anglais en 1429 ?", "Jeanne d'Arc", ["Aliénor d'Aquitaine", 'Blanche de Castille', 'Catherine de Médicis'], "Jeanne d'Arc fait sacrer Charles VII à Reims ; capturée, elle est brûlée à Rouen en 1431."]
    ]),
    bank('Histoire : transformations de l’Europe (XVe-XVIIe s.)', "Pense aux grandes découvertes, à la Renaissance, aux Réformes et au pouvoir absolu du roi.", [
      ["Quel navigateur atteint l'Amérique en 1492 ?", 'Christophe Colomb', ['Vasco de Gama', 'Magellan', 'Jacques Cartier'], "Financé par les rois d'Espagne, Colomb pense avoir atteint les Indes."],
      ["Quel navigateur portugais atteint l'Inde en contournant l'Afrique (1498) ?", 'Vasco de Gama', ['Christophe Colomb', 'Magellan', 'Hernán Cortés'], "Il ouvre la route maritime des épices par le cap de Bonne-Espérance."],
      ["Qui met au point l'imprimerie à caractères mobiles vers 1450 ?", 'Gutenberg', ['Léonard de Vinci', 'Luther', 'Érasme'], "À Mayence, Gutenberg imprime la Bible : les livres se diffusent beaucoup plus vite."],
      ["Qu'est-ce que l'humanisme ?", "un mouvement qui place l'homme au centre et redécouvre les textes antiques", ['une religion nouvelle', 'un style de château fort', 'une guerre de religion'], "Les humanistes (Érasme, Rabelais, Montaigne) ont confiance dans l'éducation et l'esprit critique."],
      ["Qui publie ses 95 thèses en 1517 et lance la Réforme protestante ?", 'Martin Luther', ['Jean Calvin', 'Érasme', 'Henri IV'], "Luther critique la vente des indulgences ; Calvin développera plus tard sa propre Réforme à Genève."],
      ["Que permet l'édit de Nantes signé par Henri IV en 1598 ?", 'la liberté de culte pour les protestants, dans certaines limites', ["l'interdiction du protestantisme", "l'indépendance des Pays-Bas", 'la fin de la guerre de Cent Ans'], "L'édit met fin aux guerres de Religion ; Louis XIV le révoquera en 1685."],
      ["Quel conquistador s'empare de l'Empire aztèque (1519-1521) ?", 'Hernán Cortés', ['Francisco Pizarro', 'Christophe Colomb', 'Magellan'], "Pizarro, lui, conquiert l'Empire inca."],
      ["Qu'est-ce que la monarchie absolue ?", "un régime où le roi concentre tous les pouvoirs, qu'il tient de Dieu", ['une république où le peuple vote', 'un royaume partagé entre seigneurs', 'un régime dirigé par le pape'], "Louis XIV incarne la monarchie absolue de droit divin."],
      ["En quelle année Louis XIV installe-t-il la cour à Versailles ?", '1682', ['1598', '1643', '1715'], "Versailles devient le siège du pouvoir et un instrument de contrôle de la noblesse. Louis XIV règne de 1643 à 1715."],
      ["Quel roi de France accueille Léonard de Vinci à Amboise ?", 'François Ier', ['Louis XIV', 'Henri IV', 'Charles VII'], "François Ier, roi de 1515 à 1547, est un grand protecteur des artistes de la Renaissance."]
    ]),
    bank('Géographie : population et développement', "Pense aux indicateurs (IDH, espérance de vie, natalité) et aux contrastes entre pays.", [
      ["Qu'est-ce que l'IDH ?", "un indicateur qui combine santé, éducation et niveau de vie", ['le nombre d’habitants d’un pays', 'la richesse totale d’un pays', 'le taux de chômage'], "L'indice de développement humain va de 0 à 1 : il combine espérance de vie, durée de scolarisation et revenu par habitant."],
      ["Qu'est-ce que l'espérance de vie à la naissance ?", "le nombre moyen d'années qu'un nouveau-né peut espérer vivre", "l'âge du plus vieil habitant".split('|').concat(['l’âge moyen de la population', 'l’âge de la retraite']), "Elle dépasse 80 ans en France mais reste inférieure à 60 ans dans certains pays d'Afrique."],
      ["Que mesure le taux de natalité ?", 'le nombre de naissances pour 1 000 habitants en un an', ['le nombre moyen d’enfants par femme', 'le nombre de décès par an', 'le nombre de mariages'], "Le nombre moyen d'enfants par femme s'appelle l'indice de fécondité."],
      ["Quel continent connaît aujourd'hui la plus forte croissance démographique ?", "l'Afrique", "l'Europe".split('|').concat(["l'Amérique du Nord", "l'Océanie"]), "La natalité y reste élevée alors que la mortalité baisse : la population africaine augmente rapidement."],
      ["Qu'est-ce que la transition démographique ?", "le passage d'une natalité et d'une mortalité fortes à une natalité et une mortalité faibles", ['le départ des habitants des campagnes', 'la baisse continue de la population mondiale', 'l’arrivée de migrants dans un pays'], "Pendant la transition, la mortalité baisse avant la natalité : la population augmente fortement."],
      ["Que signifie le vieillissement de la population ?", 'la part des personnes âgées augmente', 'les habitants meurent plus jeunes'.split('|').concat(['la natalité augmente fortement', 'la population double en dix ans']), "C'est le cas en Europe et au Japon, où la natalité est faible et l'espérance de vie élevée."],
      ["Lequel de ces pays a l'un des IDH les plus élevés du monde ?", 'la Norvège', ['le Niger', 'le Tchad', 'Haïti'], "La Norvège et la Suisse sont en tête du classement ; le Niger et le Tchad sont parmi les derniers."],
      ["Comment définit-on le développement durable ?", 'un développement qui répond aux besoins présents sans compromettre ceux des générations futures', ['une croissance économique la plus rapide possible', 'l’arrêt de toute activité industrielle', 'un développement réservé aux pays riches'], "Définition du rapport Brundtland (1987). Ses trois piliers : économique, social, environnemental."],
      ["Qu'est-ce qu'un pays émergent ?", "un pays en forte croissance qui s'intègre à la mondialisation", ['un pays qui vient d’être créé', 'un pays sans industrie', 'un pays insulaire'], "Exemples : le Brésil, l'Inde, la Chine, l'Afrique du Sud."],
      ["Quels sont les trois piliers du développement durable ?", 'économique, social et environnemental', ['politique, militaire et religieux', 'agricole, industriel et touristique', 'local, national et mondial'], "Un projet durable doit être viable économiquement, équitable socialement et respectueux de l'environnement."]
    ]),
    bank('Géographie : ressources, risques et changement climatique', "Pense à l'eau, à l'énergie, à l'alimentation et aux risques étudiés.", [
      ["Qu'est-ce qu'une ressource renouvelable ?", "une ressource qui se reconstitue rapidement à l'échelle humaine", ['une ressource qui finira par s’épuiser', 'une ressource uniquement souterraine', 'une ressource importée'], "Le soleil, le vent et l'eau sont renouvelables ; le pétrole, le gaz et le charbon ne le sont pas."],
      ["Laquelle est une énergie fossile ?", 'le pétrole', ["l'énergie solaire", "l'énergie éolienne", "l'hydroélectricité"], "Les énergies fossiles (pétrole, gaz, charbon) proviennent de la décomposition d'êtres vivants pendant des millions d'années ; leur combustion émet du CO2."],
      ["Qu'est-ce que le stress hydrique ?", 'une situation où la demande en eau dépasse les ressources disponibles', ['une pollution de l’eau par le plastique', 'une inondation soudaine', 'une pluie acide'], "Il touche notamment le Moyen-Orient et l'Afrique du Nord."],
      ["Qu'est-ce que la sécurité alimentaire ?", "l'accès de tous, à tout moment, à une nourriture suffisante et saine", ['la vérification des dates de péremption', 'l’interdiction des OGM', 'la production uniquement locale'], "Plusieurs centaines de millions de personnes souffrent encore de la faim dans le monde."],
      ["Quel gaz est le principal responsable du réchauffement climatique d'origine humaine ?", 'le dioxyde de carbone (CO2)', ["l'oxygène", "l'azote", "l'hélium"], "Le CO2 provient surtout de la combustion des énergies fossiles et de la déforestation."],
      ["En géographie, qu'est-ce qu'un risque ?", "la rencontre entre un aléa et des enjeux (habitants, biens)", ['un phénomène naturel dans un désert vide', 'un accident sans victimes possibles', 'une assurance'], "Un séisme dans une région déserte est un aléa, mais pas un risque majeur pour les hommes."],
      ["Lequel est un risque technologique ?", "l'explosion d'une usine chimique", 'un séisme'.split('|').concat(['un cyclone', 'un tsunami']), "Exemple : l'explosion de l'usine AZF à Toulouse en 2001. Séismes, cyclones et tsunamis sont des aléas naturels."],
      ["Quel groupe international d'experts étudie le changement climatique ?", 'le GIEC', ["l'OMS", "l'UNESCO", "l'OTAN"], "Le GIEC (Groupe d'experts intergouvernemental sur l'évolution du climat) publie des rapports scientifiques de référence."],
      ["Qu'est-ce que la vulnérabilité ?", "la fragilité d'une population face à un risque", ['la puissance d’un séisme', 'la vitesse du vent', 'le nombre de volcans actifs'], "Une population pauvre, sans constructions adaptées ni secours, est plus vulnérable."],
      ["Quel est l'objectif principal de l'accord de Paris sur le climat (2015) ?", 'limiter le réchauffement nettement en dessous de 2 °C', ['interdire les voitures', 'supprimer toute industrie', 'augmenter la production de pétrole'], "Les pays signataires s'engagent à réduire leurs émissions de gaz à effet de serre."]
    ]),
    bank('EMC : égalité, droits et libertés', "Pense aux valeurs de la République et aux droits de chacun.", [
      ["Qu'est-ce qu'une discrimination ?", "traiter une personne de façon inégale à cause de son origine, son sexe, son handicap…", ['donner son avis dans un débat', 'choisir ses amis', 'respecter le règlement'], "Les discriminations sont interdites et punies par la loi."],
      ["Quelle autorité indépendante peut-on saisir en cas de discrimination ?", 'le Défenseur des droits', 'le Conseil de classe'.split('|').concat(['le maire du village', 'le Premier ministre']), "Le Défenseur des droits défend aussi les droits des enfants."],
      ["Que proclame l'article 1er de la Déclaration des droits de l'homme et du citoyen (1789) ?", '« Les hommes naissent et demeurent libres et égaux en droits. »', ['« Le roi est souverain de droit divin. »', '« Chacun doit obéir à son seigneur. »', '« La loi est faite par le roi seul. »'], "Ce principe d'égalité en droits fonde la République."],
      ["Qu'est-ce qu'un préjugé ?", "une opinion toute faite, sans connaissance réelle", ['une loi votée par le Parlement', 'un jugement d’un tribunal', 'une preuve scientifique'], "Les préjugés et les stéréotypes peuvent mener à des discriminations."],
      ["Qu'est-ce que la liberté d'expression ?", "le droit d'exprimer ses opinions dans les limites fixées par la loi", ['le droit de tout dire, même des insultes', 'l’obligation de donner son avis', 'le droit de publier sans auteur'], "L'injure, la diffamation, l'incitation à la haine sont punies par la loi."],
      ["Laquelle de ces paroles est punie par la loi ?", 'une injure raciste', ['une critique argumentée d’un livre', 'un désaccord exprimé poliment', 'une blague sur soi-même'], "Le racisme n'est pas une opinion : c'est un délit."],
      ["Que garantit la loi de 2005 sur le handicap ?", "l'égalité des droits et des chances, notamment l'accessibilité", 'la création de classes séparées obligatoires'.split('|').concat(['la gratuité des transports pour tous', 'l’interdiction du sport pour les personnes handicapées']), "La loi du 11 février 2005 impose notamment l'accessibilité des lieux publics et la scolarisation des élèves handicapés."],
      ["Que faire avant de partager une information choquante vue sur un réseau social ?", 'vérifier sa source', ['la partager vite pour prévenir tout le monde', 'ajouter des détails inventés', 'la croire si elle a beaucoup de « likes »'], "Une fausse information (infox) peut se répandre très vite : on vérifie l'auteur, la date et d'autres sources."],
      ["Qu'est-ce que la solidarité ?", "le fait de s'entraider et de soutenir ceux qui en ont besoin", ['le fait de rester seul', 'le fait de gagner une compétition', 'le fait d’obéir sans réfléchir'], "La fraternité, inscrite dans la devise, se traduit par la solidarité (associations, impôts, Sécurité sociale)."],
      ["Que signifie l'égalité entre les filles et les garçons ?", 'avoir les mêmes droits et les mêmes chances', ['faire exactement les mêmes choix', 'être séparés en classe', 'avoir les mêmes goûts'], "L'égalité est un droit : aucun métier, sport ou loisir n'est réservé à un sexe."]
    ]),
    chrono('Repères chronologiques 5e', [
      ["L'Hégire : départ de Mahomet pour Médine", '622', "C'est l'an 1 du calendrier musulman."],
      ['Couronnement de Charlemagne', '800', "Il est sacré empereur à Rome par le pape."],
      ['Hugues Capet devient roi des Francs', '987', 'Début de la dynastie capétienne.'],
      ["Schisme entre l'Église d'Orient et l'Église d'Occident", '1054', 'Séparation des orthodoxes et des catholiques.'],
      ['Appel à la première croisade', '1095', "Le pape Urbain II appelle à délivrer Jérusalem."],
      ['Bataille de Bouvines', '1214', "Victoire de Philippe Auguste qui renforce le pouvoir royal."],
      ['Début de la guerre de Cent Ans', '1337', "Elle oppose la France et l'Angleterre jusqu'en 1453."],
      ['Prise de Constantinople par les Ottomans', '1453', "Fin de l'Empire byzantin (et, la même année, fin de la guerre de Cent Ans)."],
      ["Christophe Colomb atteint l'Amérique", '1492', 'Début des grandes découvertes européennes.'],
      ['Luther publie ses 95 thèses', '1517', 'Début de la Réforme protestante.'],
      ['Édit de Nantes', '1598', "Henri IV accorde la liberté de culte aux protestants."],
      ['Louis XIV installe la cour à Versailles', '1682', 'Symbole de la monarchie absolue.']
    ])
  ],
  flashcards: cards('Histoire-Géo-EMC 5e', [
    ['Charlemagne', 'Couronné empereur à Rome en 800.'],
    ['Hégire', '622 : départ de Mahomet de La Mecque pour Médine.'],
    ['Seigneurie', 'Domaine d’un seigneur qui exerce son pouvoir sur les paysans.'],
    ['Vassal / suzerain', 'Le vassal jure fidélité (hommage) au suzerain contre un fief.'],
    ['Trois ordres', 'Ceux qui prient, ceux qui combattent, ceux qui travaillent.'],
    ['Hugues Capet', '987 : début des Capétiens.'],
    ['1492', 'Christophe Colomb atteint l’Amérique.'],
    ['Humanisme', 'L’homme au centre, retour aux textes antiques (Érasme, Rabelais).'],
    ['Réforme', '1517 : Luther conteste l’Église catholique.'],
    ['Monarchie absolue', 'Le roi détient tous les pouvoirs, de droit divin (Louis XIV).'],
    ['IDH', 'Indice de développement humain : santé, éducation, niveau de vie.'],
    ['Risque', 'Aléa + enjeux ; aggravé par la vulnérabilité.']
  ])
};

// ---------- 5e · Anglais LV1 ----------
const EN5 = {
  generators: [
    genIrregular(35),
    genPresentContinuous(),
    genPreteritRegular(),
    genComparatives(),
    genEdSound(),
    bank('Grammaire anglaise', "Repère les indices de temps (yesterday, now, every day) et la nature du nom (dénombrable ou non).", [
      ["🇬🇧 « Yesterday, I ___ at home. » (be)", 'was', ['were', 'am', 'been'], "Prétérit de be : I/he/she/it was ; you/we/they were."],
      ["🇬🇧 « ___ you go to the cinema last week? »", 'Did', ['Do', 'Were', 'Have'], "Au prétérit, la question se forme avec did + sujet + base verbale : Did you go…?"],
      ["🇬🇧 « We didn't ___ the match. »", 'watch', ['watched', 'watching', 'watches'], "Après didn't, le verbe reste à la base verbale : la marque du passé est déjà portée par did."],
      ["🇬🇧 « How ___ sugar do you want? »", 'much', ['many', 'lot', 'long'], "much + indénombrable (sugar, water, money) ; many + dénombrable pluriel (apples, friends)."],
      ["🇬🇧 « How ___ brothers have you got? »", 'many', ['much', 'lot', 'long'], "brothers est dénombrable pluriel : on emploie many."],
      ["🇬🇧 « There ___ a lot of people at the concert yesterday. »", 'were', ['was', 'are', 'is'], "Yesterday → prétérit ; a lot of people est pluriel → there were."],
      ["🇬🇧 « Whose bag is it? » — « It's ___. » (à moi)", 'mine', ['my', 'me', 'I'], "Pronoms possessifs : mine, yours, his, hers, ours, theirs. « my » doit être suivi d'un nom."],
      ["🇬🇧 « He was ___ TV when the phone rang. »", 'watching', ['watched', 'watch', 'watches'], "Prétérit en be + -ing (was watching) : action en cours dans le passé, interrompue par une action courte (rang)."],
      ["🇬🇧 « I usually ___ to school, but today I'm taking the bus. »", 'walk', ['walking', 'am walking', 'walks'], "usually = habitude → present simple (walk). today… I'm taking → action exceptionnelle en cours."],
      ["🇬🇧 Que signifie « You must wear a helmet » ?", 'Tu dois porter un casque.', ['Tu peux porter un casque.', 'Tu ne dois pas porter de casque.', 'Tu portais un casque.'], "must exprime l'obligation ; mustn't, l'interdiction ; can, la capacité ou la permission."]
    ]),
    bank('Vocabulaire anglais', "Pense aux thèmes : vêtements, météo, maison, ville, fêtes.", [
      ["🇬🇧 Que signifie « a jacket » ?", 'une veste', ['une chemise', 'une jupe', 'une écharpe'], "jacket = veste ; shirt = chemise ; skirt = jupe ; scarf = écharpe."],
      ["🇬🇧 Que signifie « It's foggy » ?", 'Il y a du brouillard.', ['Il neige.', 'Il y a du vent.', 'Il y a de l’orage.'], "foggy = brouillard ; snowy = neige ; windy = vent ; stormy = orage."],
      ["🇬🇧 Que signifie « the kitchen » ?", 'la cuisine', ['la chambre', 'la salle de bains', 'le grenier'], "kitchen = cuisine ; bedroom = chambre ; bathroom = salle de bains ; attic = grenier."],
      ["🇬🇧 Que signifie « a bakery » ?", 'une boulangerie', ['une boucherie', 'une librairie', 'une pharmacie'], "bakery = boulangerie ; butcher's = boucherie ; bookshop = librairie (library = bibliothèque !)."],
      ["🇬🇧 Que signifie « Turn left » ?", 'Tourne à gauche.', ['Tourne à droite.', 'Va tout droit.', 'Fais demi-tour.'], "left = gauche ; right = droite ; go straight on = va tout droit."],
      ["🇬🇧 Que signifie « trainers » (anglais britannique) ?", 'des baskets', ['des entraîneurs', 'des pantalons', 'des lacets'], "trainers (UK) = sneakers (US) = baskets. Un entraîneur se dit « a coach »."],
      ["🇬🇧 Que désigne « Christmas Eve » ?", 'le 24 décembre (la veille de Noël)', ['le 25 décembre', 'le 31 décembre', 'le 1er janvier'], "Christmas Day = 25 décembre ; New Year's Eve = 31 décembre."],
      ["🇬🇧 Quand fête-t-on Thanksgiving aux États-Unis ?", 'le quatrième jeudi de novembre', ['le 4 juillet', 'le 31 octobre', 'le 17 mars'], "Le 4 juillet est l'Independence Day ; le 31 octobre, Halloween ; le 17 mars, la Saint-Patrick."],
      ["🇬🇧 Que commémore Bonfire Night (5 novembre) au Royaume-Uni ?", "l'échec de la Conspiration des poudres de Guy Fawkes (1605)", ['la naissance de la reine', 'la fin de la Seconde Guerre mondiale', "l'arrivée du printemps"], "En 1605, Guy Fawkes voulait faire exploser le Parlement ; on allume des feux de joie et des feux d'artifice."],
      ["🇬🇧 Que signifie « I'm into video games » ?", "Je suis passionné(e) de jeux vidéo.", ['Je suis dans un jeu vidéo.', 'Je déteste les jeux vidéo.', 'Je fabrique des jeux vidéo.'], "to be into something = être fan de quelque chose (familier)."]
    ]),
    bank('Compréhension écrite', "Repère les verbes au prétérit et les mots-clés de la question.", [
      ["🇬🇧 « Last weekend, Mia went to Brighton with her cousins. They swam in the sea and ate fish and chips. » Avec qui Mia est-elle partie ?", 'avec ses cousins', ['avec ses parents', 'avec ses amis', 'seule'], "« with her cousins » = avec ses cousins."],
      ["🇬🇧 Même texte : qu'ont-ils mangé ?", 'du poisson et des frites', ['des sandwichs', 'une pizza', 'des glaces'], "« ate fish and chips » : ate est le prétérit de eat ; fish and chips est un plat britannique typique."],
      ["🇬🇧 « When I was six, I lived in Canada. Now I live in Paris. » Où cette personne vit-elle aujourd'hui ?", 'à Paris', ['au Canada', 'à Londres', 'à Montréal'], "« Now I live in Paris » : now = maintenant. « lived » au prétérit parle du passé."],
      ["🇬🇧 « Ben was late because he missed the bus. » Pourquoi Ben était-il en retard ?", 'il a raté le bus', ['il était malade', 'il a oublié son sac', 'il s’est réveillé tard'], "« because he missed the bus » = parce qu'il a raté le bus."],
      ["🇬🇧 « The film was boring, so we left before the end. » Qu'ont-ils fait ?", 'ils sont partis avant la fin', ['ils ont regardé le film deux fois', 'ils se sont endormis', 'ils ont applaudi'], "left est le prétérit de leave (partir) ; so = donc."],
      ["🇬🇧 « It's colder in Edinburgh than in London. » Quelle ville est la plus froide ?", 'Édimbourg', ['Londres', 'les deux sont pareilles', 'on ne sait pas'], "colder than = plus froid que."],
      ["🇬🇧 « Sorry, I can't come to your party. I have to look after my little brother. » Pourquoi ne peut-il pas venir ?", "il doit garder son petit frère", 'il est malade'.split('|').concat(['il n’aime pas les fêtes', 'il part en vacances']), "to look after = s'occuper de, garder ; have to = devoir."],
      ["🇬🇧 « Emma is the tallest girl in the class. » Que sait-on d'Emma ?", 'elle est la plus grande de la classe', ['elle est la plus petite', 'elle est la plus âgée', 'elle est nouvelle'], "the tallest = la plus grande (superlatif de tall)."]
    ])
  ],
  flashcards: cards('Anglais 5e', [
    ['Prétérit régulier', 'base + -ed à toutes les personnes : played, watched, studied.'],
    ['Prétérit : question/négation', 'Did + sujet + base ? / didn’t + base.'],
    ['Present continuous', 'be + V-ing : action en cours (Look! She is running).'],
    ['Past continuous', 'was/were + V-ing : action en cours dans le passé.'],
    ['Comparatif court', 'adjectif + -er + than : taller than.'],
    ['Comparatif long', 'more + adjectif + than : more expensive than.'],
    ['Irréguliers', 'good → better → the best ; bad → worse → the worst.'],
    ['much / many', 'much + indénombrable ; many + dénombrable pluriel.'],
    ['Pronoms possessifs', 'mine, yours, his, hers, ours, theirs.'],
    ['must / mustn’t', 'Obligation / interdiction.'],
    ['Prononciation de -ed', '/ɪd/ après t, d ; /t/ après son sourd ; /d/ sinon.'],
    ['buy – bought – bought', 'acheter (verbe irrégulier).']
  ])
};

// ---------- 5e · LV2 (espagnol, allemand, italien) ----------
const LV2_5 = {
  generators: [
    genEsPresent(['ser', 'estar', 'tener', 'ir', 'hacer']),
    genEsNumbers(),
    bank('Espagnol : vocabulaire', "Pense aux premières leçons : saluer, se présenter, la famille, les couleurs.", [
      ["🇪🇸 Espagnol : comment dit-on « bonjour » le matin ?", 'Buenos días', ['Buenas noches', 'Buenas tardes', 'Hasta luego'], "Buenos días = bonjour (le matin) ; buenas tardes = bonjour/bonsoir l'après-midi ; buenas noches = bonsoir/bonne nuit ; hasta luego = à plus tard."],
      ["🇪🇸 Espagnol : que signifie « ¿Cómo te llamas? » ?", "Comment t'appelles-tu ?", 'Quel âge as-tu ?'.split('|').concat(['Où habites-tu ?', 'Comment vas-tu ?']), "Réponse : « Me llamo… ». Quel âge as-tu ? = ¿Cuántos años tienes? ; comment vas-tu ? = ¿Qué tal?"],
      ["🇪🇸 Espagnol : que signifie « el hermano » ?", 'le frère', ['la sœur', "l'oncle", 'le cousin'], "el hermano = le frère ; la hermana = la sœur ; el tío = l'oncle ; el primo = le cousin."],
      ["🇪🇸 Espagnol : que signifie « Tengo doce años » ?", "J'ai douze ans.", ["J'ai deux ans.", 'Il a douze ans.', "J'ai douze frères."], "En espagnol, l'âge s'exprime avec tener (avoir) : tengo = j'ai ; doce = douze ; dos = deux."],
      ["🇪🇸 Espagnol : comment dit-on « rouge » ?", 'rojo', ['azul', 'verde', 'amarillo'], "rojo = rouge ; azul = bleu ; verde = vert ; amarillo = jaune."],
      ["🇪🇸 Espagnol : que signifie « el lunes » ?", 'lundi', ['mardi', 'mercredi', 'dimanche'], "lunes = lundi, martes = mardi, miércoles = mercredi, domingo = dimanche. Les jours ne prennent pas de majuscule."],
      ["🇪🇸 Espagnol : comment dit-on « au revoir » ?", 'adiós', ['hola', 'gracias', 'por favor'], "hola = salut ; gracias = merci ; por favor = s'il te plaît."],
      ["🇪🇸 Espagnol : que signifie « el perro » ?", 'le chien', ['le chat', "l'oiseau", 'le cheval'], "el perro = le chien ; el gato = le chat ; el pájaro = l'oiseau ; el caballo = le cheval."],
      ["🇪🇸 Espagnol : comment dit-on « merci beaucoup » ?", 'muchas gracias', ['de nada', 'por favor', 'perdón'], "de nada = de rien ; perdón = pardon."],
      ["🇪🇸 Espagnol : que signifie « Vivo en Madrid » ?", "J'habite à Madrid.", 'Je visite Madrid.'.split('|').concat(["J'aime Madrid.", 'Il habite à Madrid.']), "vivir = vivre, habiter ; vivo = je vis / j'habite (1re personne du singulier)."]
    ]),
    bank('Espagnol : grammaire', "Demande-toi : identité ou état passager ? singulier ou pluriel ?", [
      ["🇪🇸 Espagnol : « Mi hermana ___ simpática. » (caractère)", 'es', ['está', 'son', 'hay'], "On emploie ser pour l'identité et les caractéristiques durables (es simpática) ; estar pour un état passager ou un lieu."],
      ["🇪🇸 Espagnol : « Hoy ___ cansado. » (état passager, je)", 'estoy', ['soy', 'es', 'tengo'], "La fatigue est un état passager : estar → estoy cansado."],
      ["🇪🇸 Espagnol : « Madrid ___ en España. »", 'está', ['es', 'son', 'hay'], "Pour situer un lieu, on emploie estar : Madrid está en España."],
      ["🇪🇸 Espagnol : « Me ___ el chocolate. »", 'gusta', ['gustan', 'gusto', 'gustas'], "gustar s'accorde avec ce qui plaît : el chocolate (singulier) → me gusta."],
      ["🇪🇸 Espagnol : « Me ___ los videojuegos. »", 'gustan', ['gusta', 'gusto', 'gustamos'], "los videojuegos est pluriel → me gustan."],
      ["🇪🇸 Espagnol : quel est le pluriel de « el libro » ?", 'los libros', ['las libros', 'el libros', 'los libro'], "Article masculin pluriel : los ; le nom terminé par une voyelle prend -s."],
      ["🇪🇸 Espagnol : comment dit-on « Je ne parle pas anglais » ?", 'No hablo inglés.', ['Hablo no inglés.', 'No hablas inglés.', 'Yo hablo inglés no.'], "La négation « no » se place juste devant le verbe ; le pronom yo est souvent omis."],
      ["🇪🇸 Espagnol : quel article défini placer devant « mesa » (table, féminin) ?", 'la', ['el', 'los', 'lo'], "Articles définis : el (m. sing.), la (f. sing.), los (m. pl.), las (f. pl.)."],
      ["🇪🇸 Espagnol : que signifie « hay » ?", 'il y a', ['il est', 'il a', 'il fait'], "« Hay » est invariable : hay un gato, hay dos gatos."],
      ["🇪🇸 Espagnol : pourquoi écrit-on « ¿ » au début de « ¿Dónde vives? » ?", "en espagnol, une question s'ouvre et se ferme par un point d'interrogation", ['c’est une faute de frappe', 'pour marquer une exclamation', 'pour indiquer le futur'], "On fait de même avec l'exclamation : ¡Hola!"]
    ]),
    bank('Allemand : premiers pas', "Rappelle-toi les salutations, les articles der/die/das et les verbes sein et haben.", [
      ["🇩🇪 Allemand : comment dit-on « bonjour » ?", 'Guten Tag', ['Gute Nacht', 'Tschüss', 'Danke'], "Guten Tag = bonjour ; Gute Nacht = bonne nuit ; Tschüss = salut (au revoir) ; Danke = merci."],
      ["🇩🇪 Allemand : que signifie « Ich heiße Paul » ?", "Je m'appelle Paul.", "J'habite chez Paul.".split('|').concat(['Je suis Paul ?', "Paul s'appelle Ich."]), "heißen = s'appeler : ich heiße, du heißt, er heißt."],
      ["🇩🇪 Allemand : conjugue « sein » (être) avec « ich ».", 'bin', ['bist', 'ist', 'sind'], "sein : ich bin, du bist, er/sie/es ist, wir sind, ihr seid, sie sind."],
      ["🇩🇪 Allemand : conjugue « haben » (avoir) avec « du ».", 'hast', ['habe', 'hat', 'habt'], "haben : ich habe, du hast, er hat, wir haben, ihr habt, sie haben."],
      ["🇩🇪 Allemand : quel est l'article de « Mädchen » (jeune fille) ?", 'das', ['der', 'die', 'den'], "Les noms en -chen sont toujours neutres : das Mädchen."],
      ["🇩🇪 Allemand : quel est l'article de « Sonne » (soleil) ?", 'die', ['der', 'das', 'den'], "die Sonne est féminin (alors que « le soleil » est masculin en français)."],
      ["🇩🇪 Allemand : comment dit-on « trois » ?", 'drei', ['zwei', 'vier', 'zehn'], "eins, zwei, drei, vier, fünf… zehn = dix."],
      ["🇩🇪 Allemand : que signifie « Wie geht's? » ?", 'Comment ça va ?', "Comment t'appelles-tu ?".split('|').concat(['Où vas-tu ?', 'Quelle heure est-il ?']), "Réponse possible : « Gut, danke! » (Bien, merci !)."],
      ["🇩🇪 Allemand : quelle particularité ont tous les noms communs ?", 'ils prennent une majuscule', ['ils sont tous masculins', 'ils n’ont pas de pluriel', 'ils finissent par -en'], "der Hund, die Katze, das Haus : majuscule obligatoire."]
    ]),
    bank('Italien : premiers pas', "Rappelle-toi les salutations et les verbes essere et avere.", [
      ["🇮🇹 Italien : que signifie « Ciao » ?", 'salut (pour dire bonjour ou au revoir)', ['merci', "s'il te plaît", 'bonne nuit'], "Ciao s'emploie entre proches ; plus poli : Buongiorno (bonjour), Arrivederci (au revoir)."],
      ["🇮🇹 Italien : que signifie « Mi chiamo Giulia » ?", "Je m'appelle Giulia.", "J'appelle Giulia.".split('|').concat(['Giulia est mon amie.', 'Elle appelle Giulia.']), "chiamarsi = s'appeler : mi chiamo, ti chiami, si chiama."],
      ["🇮🇹 Italien : conjugue « essere » (être) avec « io ».", 'sono', ['sei', 'è', 'siamo'], "essere : io sono, tu sei, lui/lei è, noi siamo, voi siete, loro sono."],
      ["🇮🇹 Italien : conjugue « avere » (avoir) avec « tu ».", 'hai', ['ho', 'ha', 'avete'], "avere : io ho, tu hai, lui/lei ha, noi abbiamo, voi avete, loro hanno (le h ne se prononce pas)."],
      ["🇮🇹 Italien : que signifie « Grazie » ?", 'merci', ["s'il te plaît", 'pardon', 'bonjour'], "per favore = s'il te plaît ; scusa = pardon ; buongiorno = bonjour."],
      ["🇮🇹 Italien : comment dit-on « bonsoir » ?", 'Buonasera', ['Buongiorno', 'Buonanotte', 'Arrivederci'], "Buonasera = bonsoir ; Buonanotte = bonne nuit."],
      ["🇮🇹 Italien : comment dit-on « cinq » ?", 'cinque', ['sei', 'quattro', 'sette'], "uno, due, tre, quattro, cinque, sei, sette."],
      ["🇮🇹 Italien : quel est le pluriel de « libro » (livre) ?", 'libri', ['libros', 'libre', 'libra'], "Les noms masculins en -o font leur pluriel en -i : il libro → i libri."],
      ["🇮🇹 Italien : que signifie « la scuola » ?", "l'école", ['la classe', 'le professeur', 'le cahier'], "la scuola = l'école ; la classe = la classe ; il professore = le professeur ; il quaderno = le cahier."]
    ])
  ],
  flashcards: cards('LV2 5e', [
    ['🇪🇸 Saluer', 'Hola, buenos días, buenas tardes, buenas noches, adiós, hasta luego.'],
    ['🇪🇸 Se présenter', 'Me llamo… Tengo … años. Vivo en…'],
    ['🇪🇸 Présent -ar', 'hablo, hablas, habla, hablamos, habláis, hablan.'],
    ['🇪🇸 Présent -er / -ir', 'como, comes, come, comemos, coméis, comen / vivo, vives, vive, vivimos, vivís, viven.'],
    ['🇪🇸 ser', 'soy, eres, es, somos, sois, son (identité, caractère).'],
    ['🇪🇸 estar', 'estoy, estás, está, estamos, estáis, están (état, lieu).'],
    ['🇪🇸 tener', 'tengo, tienes, tiene, tenemos, tenéis, tienen.'],
    ['🇪🇸 gustar', 'me gusta + singulier ; me gustan + pluriel.'],
    ['🇩🇪 sein', 'ich bin, du bist, er ist, wir sind, ihr seid, sie sind.'],
    ['🇩🇪 Articles', 'der (masculin), die (féminin), das (neutre).'],
    ['🇮🇹 essere', 'sono, sei, è, siamo, siete, sono.'],
    ['🇮🇹 avere', 'ho, hai, ha, abbiamo, avete, hanno.']
  ])
};

// ---------- 5e · Arts plastiques & Éducation musicale ----------
const ARTS5 = {
  generators: [
    bank('Art roman et art gothique', "Compare : murs épais et petites fenêtres, ou murs légers et grands vitraux ?", [
      ["Quel style d'église a des murs épais, de petites fenêtres et des arcs en plein cintre ?", "l'art roman", "l'art gothique".split('|').concat(["l'art baroque", "l'art classique"]), "L'art roman (XIe-XIIe s.) : voûte en berceau, murs épais, intérieur sombre. Le gothique ouvre de grandes baies."],
      ["À quoi servent les arcs-boutants des cathédrales gothiques ?", "à soutenir les murs de l'extérieur pour ouvrir de grandes fenêtres", ['à décorer la façade', 'à porter les cloches', "à évacuer l'eau de pluie"], "Ils reportent le poids des voûtes vers l'extérieur : les murs peuvent accueillir de vastes vitraux."],
      ["Comment appelle-t-on les panneaux de verre coloré des cathédrales ?", 'des vitraux', ['des fresques', 'des mosaïques', 'des tapisseries'], "Les vitraux racontent des épisodes de la Bible et font entrer une lumière colorée (Sainte-Chapelle, Chartres)."],
      ["Qu'est-ce qu'une enluminure ?", "une peinture décorant un manuscrit", ['une sculpture de portail', 'un vitrail rond', 'une tapisserie murale'], "Les moines copistes ornaient les manuscrits de lettrines et de miniatures colorées."],
      ["Que raconte la Tapisserie de Bayeux ?", "la conquête de l'Angleterre par Guillaume le Conquérant (1066)", ['la vie de Jeanne d’Arc', 'la première croisade', 'le couronnement de Charlemagne'], "Cette broderie de près de 70 mètres est une véritable « bande dessinée » du XIe siècle."],
      ["Qu'est-ce que le tympan d'une église ?", "l'espace sculpté au-dessus du portail", ['le clocher', 'l’orgue', 'la crypte'], "Le tympan représente souvent le Jugement dernier, pour enseigner aux fidèles."],
      ["Qu'est-ce qu'une gargouille ?", "une gouttière sculptée qui évacue l'eau de pluie", ['une statue de saint', 'une cloche', 'un vitrail'], "Les gargouilles prennent souvent la forme de monstres ou d'animaux fantastiques."],
      ["Quelle cathédrale gothique parisienne a rouvert en 2024 après l'incendie de 2019 ?", 'Notre-Dame de Paris', ['Notre-Dame de Chartres', 'Notre-Dame de Reims', 'Notre-Dame d’Amiens'], "Commencée en 1163, Notre-Dame de Paris est un chef-d'œuvre du gothique ; sa flèche a été reconstruite à l'identique."]
    ]),
    bank('Renaissance et image', "Pense à la perspective, aux grands peintres italiens et au vocabulaire de l'image.", [
      ["Qui a peint La Joconde ?", 'Léonard de Vinci', ['Michel-Ange', 'Raphaël', 'Botticelli'], "Léonard de Vinci la peint au début du XVIe siècle ; elle est exposée au Louvre."],
      ["Qui a peint le plafond de la chapelle Sixtine ?", 'Michel-Ange', ['Léonard de Vinci', 'Raphaël', 'Titien'], "Michel-Ange le réalise entre 1508 et 1512 ; on y trouve La Création d'Adam."],
      ["Qui a peint La Naissance de Vénus ?", 'Botticelli', ['Raphaël', 'Michel-Ange', 'Léonard de Vinci'], "Sandro Botticelli, peintre florentin, la réalise vers 1485."],
      ["Quelle ville italienne est le berceau de la Renaissance ?", 'Florence', ['Naples', 'Milan', 'Turin'], "Grâce aux Médicis, Florence attire artistes et savants dès le XVe siècle."],
      ["Dans la perspective linéaire, vers où convergent les lignes de fuite ?", 'vers le point de fuite', ['vers le cadre', 'vers le premier plan', 'vers la signature'], "Le point de fuite, placé sur la ligne d'horizon, donne l'illusion de la profondeur."],
      ["Où se situe le point de fuite ?", "sur la ligne d'horizon", ['en bas de l’image', 'toujours dans un coin', 'en dehors de la feuille obligatoirement'], "La ligne d'horizon correspond à la hauteur des yeux du spectateur."],
      ["Qu'est-ce que le sfumato de Léonard de Vinci ?", 'un effet vaporeux qui adoucit les contours', ['une peinture très colorée', 'un dessin au trait noir', 'une sculpture en marbre'], "Le sfumato (« enfumé ») crée des transitions douces entre ombre et lumière, comme sur le sourire de la Joconde."],
      ["Qu'est-ce que la perspective atmosphérique ?", 'les éléments lointains paraissent plus clairs, plus bleutés et plus flous', ['les objets proches sont plus petits', 'on peint uniquement le ciel', 'on dessine avec une règle'], "Elle imite l'effet de l'air entre le spectateur et le lointain."],
      ["Qu'est-ce qu'un clair-obscur ?", 'un fort contraste entre zones éclairées et zones sombres', ['un dessin sans ombre', 'un tableau tout blanc', 'une peinture en camaïeu de gris'], "Caravage, au début du XVIIe siècle, en est un grand maître."]
    ]),
    bank('Musique médiévale et baroque', "Compte les voix et pense à l'époque de l'œuvre.", [
      ["Qu'est-ce que le chant grégorien ?", 'un chant religieux en latin, à une seule voix, sans accompagnement', ['une chanson de troubadour', 'un chant à plusieurs voix accompagné d’orgue', 'une danse de cour'], "Il est chanté par les moines dans les monastères ; c'est une monodie."],
      ["Comment appelle-t-on une musique à une seule ligne mélodique ?", 'une monodie', ['une polyphonie', 'une symphonie', 'un concerto'], "Monodie : une seule voix (même chantée par plusieurs personnes à l'unisson). Polyphonie : plusieurs voix différentes en même temps."],
      ["Qu'est-ce que la polyphonie ?", 'plusieurs voix différentes chantées en même temps', ['une seule voix', 'un chant sans paroles', 'une musique uniquement instrumentale'], "La polyphonie se développe à partir du XIIe siècle (école de Notre-Dame)."],
      ["Qui étaient les troubadours ?", 'des poètes-musiciens du sud de la France au Moyen Âge', ['des soldats de l’armée royale', 'des moines copistes', 'des compositeurs d’opéra'], "Ils chantaient l'amour courtois en langue d'oc ; au nord, on les appelait trouvères."],
      ["Quel compositeur baroque allemand a écrit les Concertos brandebourgeois ?", 'Jean-Sébastien Bach', ['Vivaldi', 'Mozart', 'Beethoven'], "Bach (1685-1750) est l'un des plus grands compositeurs de la période baroque."],
      ["Qu'est-ce qu'un concerto ?", 'une œuvre pour un ou plusieurs solistes et orchestre', ['un chant à une voix', 'une pièce pour piano seul', 'une danse médiévale'], "Exemple : Les Quatre Saisons de Vivaldi sont des concertos pour violon."],
      ["Que signifie une forme ABA ?", 'une partie A, une partie contrastante B, puis le retour de A', ['trois parties identiques', 'une seule partie répétée', 'un morceau sans structure'], "Le retour de A donne une impression d'équilibre."],
      ["Quel compositeur de Louis XIV a écrit la Marche pour la cérémonie des Turcs ?", 'Jean-Baptiste Lully', ['Jean-Philippe Rameau', 'Jean-Sébastien Bach', 'Hector Berlioz'], "Lully la compose pour Le Bourgeois gentilhomme de Molière (1670)."],
      ["Qu'est-ce qu'un clavecin ?", 'un instrument à clavier dont les cordes sont pincées', ['un instrument à vent', 'un tambour', 'un piano électrique'], "Très utilisé à l'époque baroque, il a précédé le piano (cordes frappées)."]
    ]),
    bank('Lire une œuvre', "Utilise le vocabulaire précis de l'analyse d'image.", [
      ["Qu'est-ce que la composition d'une image ?", "l'organisation des éléments dans l'image", ['le prix de l’œuvre', 'la date de création', 'le nom du musée'], "On repère les lignes de force, les plans, les masses et le centre d'intérêt."],
      ["Qu'est-ce que le hors-champ ?", "ce qui n'est pas visible dans l'image mais que l'on imagine", ['le cadre doré', 'le premier plan', 'la signature'], "Le hors-champ fait travailler l'imagination du spectateur (au cinéma comme en peinture)."],
      ["Qu'est-ce qu'un triptyque ?", 'une œuvre composée de trois panneaux', ['une sculpture à trois têtes', 'un tableau peint par trois artistes', 'une fresque de trois mètres'], "Les retables médiévaux sont souvent des triptyques."],
      ["Qu'est-ce qu'une ligne de force ?", "une ligne qui structure l'image et guide le regard", ['le contour du cadre', 'la ligne d’horizon toujours', 'une erreur de dessin'], "Diagonales, verticales et horizontales organisent l'image."],
      ["Que signifie « figuratif » ?", 'qui représente des éléments reconnaissables du réel', ['qui ne représente rien de reconnaissable', 'qui utilise uniquement le noir', 'qui est en trois dimensions'], "L'art abstrait, au contraire, ne cherche pas à représenter le réel."],
      ["Qu'est-ce qu'un contraste ?", 'une opposition forte (clair/foncé, couleurs complémentaires…)', ['un mélange de couleurs identiques', 'une ligne courbe', 'un cadre ancien'], "Le contraste attire l'œil et met en valeur certains éléments."],
      ["Qu'est-ce qu'un retable ?", "un ensemble peint ou sculpté placé derrière l'autel", ['une table de cuisine sculptée', 'un vitrail', 'une gargouille'], "Exemple : le retable d'Issenheim (Grünewald, XVIe siècle)."],
      ["Qu'est-ce qu'une vue en plongée ?", "une vue prise d'en haut vers le bas", ["une vue prise d'en bas vers le haut", 'une vue de face', 'une vue sous l’eau'], "La plongée écrase le sujet ; la contre-plongée (de bas en haut) le grandit."]
    ])
  ],
  flashcards: cards('Arts 5e', [
    ['Art roman', 'Murs épais, petites fenêtres, arc en plein cintre, voûte en berceau.'],
    ['Art gothique', 'Arc brisé, croisée d’ogives, arcs-boutants, grands vitraux.'],
    ['Enluminure', 'Peinture qui décore un manuscrit.'],
    ['Perspective linéaire', 'Lignes de fuite convergeant vers un point de fuite sur la ligne d’horizon.'],
    ['Léonard de Vinci', 'La Joconde ; sfumato.'],
    ['Michel-Ange', 'Plafond de la chapelle Sixtine (1508-1512).'],
    ['Monodie / polyphonie', 'Une seule voix / plusieurs voix différentes simultanées.'],
    ['Chant grégorien', 'Chant religieux monodique en latin, a cappella.'],
    ['Concerto', 'Soliste(s) + orchestre (Vivaldi, Bach).'],
    ['Forme ABA', 'A, contraste B, retour de A.'],
    ['Plongée / contre-plongée', 'Vue de haut en bas / de bas en haut.'],
    ['Clair-obscur', 'Fort contraste lumière/ombre (Caravage).']
  ])
};

/* ======================================================================
 * 4. QUATRIÈME (cycle 4 — analyse et approfondissement)
 * ==================================================================== */

// ---------- 4e · Français ----------
const T_ALL = ['present', 'imparfait', 'futur', 'passe_simple', 'conditionnel', 'passe_compose', 'pqp', 'subjonctif'];
const HOMO_ALL = Object.keys(HOMO).filter((k) => k !== 'ces/ses');
const FR4 = {
  generators: [
    genConj(V_ALL, T_ALL, ['passe_simple', 'subjonctif']),
    genTenseId(V_ALL, T_ALL),
    genHomophones(HOMO_ALL),
    genAccordAdj(),
    genAccordPP(['etre', 'avoir', 'que', 'pronom']),
    genNature(4),
    genFonction(4),
    genFigures(4),
    bank('Syntaxe : voix passive, discours rapporté, propositions', "Repère le sujet, le verbe et ce qui change de place quand on transforme la phrase.", [
      ["Quelle est la voix passive de « Le chat mange la souris » ?", 'La souris est mangée par le chat.', ['La souris mange le chat.', 'Le chat est mangé par la souris.', 'La souris a mangé le chat.'], "À la voix passive, le COD devient sujet, le verbe se construit avec « être » au même temps + participe passé accordé, et l'ancien sujet devient complément d'agent (par…)."],
      ["« Le pont a été construit par les Romains » : à quel temps est ce verbe passif ?", 'passé composé', ['présent', 'imparfait', 'plus-que-parfait'], "Le temps d'un verbe passif est celui de l'auxiliaire « être » : « a été » est le passé composé de « être »."],
      ["Mets au discours indirect : Il dit : « Je suis fatigué. »", "Il dit qu'il est fatigué.", ['Il dit que je suis fatigué.', "Il dit qu'il était fatigué.", 'Il dit : il est fatigué.'], "Le verbe introducteur est au présent : pas de changement de temps. Mais « je » devient « il » et on ajoute « que »."],
      ["Mets au discours indirect : Elle a dit : « Je viendrai demain. »", "Elle a dit qu'elle viendrait le lendemain.", ["Elle a dit qu'elle viendra demain.", 'Elle a dit que je viendrais demain.', "Elle a dit qu'elle venait la veille."], "Verbe introducteur au passé → concordance des temps : le futur devient conditionnel, et « demain » devient « le lendemain »."],
      ["Quelle phrase contient une proposition subordonnée relative ?", 'Le livre que je lis est passionnant.', ["Je pense qu'il viendra.", 'Quand il pleut, je lis.', 'Il lit et il écrit.'], "« que je lis » complète le nom « livre » : c'est une relative introduite par un pronom relatif. « qu'il viendra » est une complétive ; « Quand il pleut » une circonstancielle."],
      ["Dans « Je sais que tu mens », la proposition « que tu mens » est…", 'une subordonnée complétive', ['une subordonnée relative', 'une subordonnée circonstancielle de temps', 'une proposition indépendante'], "Elle est COD du verbe « sais » et introduite par la conjonction « que » : c'est une complétive."],
      ["Dans « Le village est traversé par une rivière », quel est le complément d'agent ?", 'par une rivière', ['le village', 'est traversé', 'une rivière seule, sans « par »'], "Le complément d'agent, introduit par « par » ou « de », désigne celui qui fait l'action à la voix passive."],
      ["Quel mode emploie-t-on après « il faut que » ?", 'le subjonctif', ["l'indicatif", "l'impératif", 'le participe'], "Le subjonctif exprime un fait envisagé, souhaité ou nécessaire : il faut que tu viennes."],
      ["Dans « Si j'avais le temps, je voyagerais », « voyagerais » est au…", 'conditionnel présent', ['futur simple', 'imparfait', 'subjonctif présent'], "Si + imparfait → conditionnel présent dans la principale. Le futur serait « voyagerai » (sans -s)."],
      ["Combien de propositions compte la phrase « Quand il arriva, tout le monde se tut et la fête commença » ?", 'trois', ['deux', 'quatre', 'une'], "Il y a autant de propositions que de verbes conjugués : arriva, se tut, commença."],
      ["Quelle phrase est à la voix active ?", "Les pompiers ont éteint l'incendie.", ["L'incendie a été éteint par les pompiers.", "L'incendie est éteint par les pompiers.", "L'incendie sera éteint par les pompiers."], "À la voix active, le sujet (les pompiers) fait l'action. Les trois autres phrases sont au passif (être + participe passé)."]
    ]),
    bank('Vocabulaire : racines grecques et latines', "Décompose le mot et pense à d'autres mots formés avec la même racine.", [
      ["Que signifie la racine grecque « bio » (biologie, biographie) ?", 'la vie', ['la terre', "l'eau", 'la lumière'], "bios = vie. La biologie est la science du vivant ; une biographie raconte la vie de quelqu'un."],
      ["Que signifie la racine grecque « graph » (orthographe, géographie) ?", 'écrire, dessiner', ['parler', 'voir', 'mesurer'], "graphein = écrire. La géographie « décrit » la Terre."],
      ["Que signifie la racine grecque « chrono » (chronologie, chronomètre) ?", 'le temps', ["l'espace", 'la couleur', 'la vitesse'], "chronos = temps. Un chronomètre mesure le temps."],
      ["Que signifie la racine grecque « hydro » (hydraulique, déshydrater) ?", "l'eau", ['le feu', 'la terre', "l'air"], "hydor = eau. Se déshydrater, c'est perdre de l'eau."],
      ["Que signifie la racine grecque « phil- » (philosophie, cinéphile) ?", 'qui aime', ['qui craint', 'qui déteste', 'qui écrit'], "philein = aimer. Un cinéphile aime le cinéma ; la philosophie est « l'amour de la sagesse »."],
      ["Que signifie la racine grecque « therm » (thermomètre, thermique) ?", 'la chaleur', ['le froid', 'la mesure', 'la vitesse'], "thermos = chaud. Le thermomètre mesure la chaleur."],
      ["Quel mot désigne une personne hostile aux étrangers ?", 'xénophobe', ['philanthrope', 'misanthrope', 'francophile'], "xénos = étranger, phobos = peur. Un philanthrope aime les hommes, un misanthrope les fuit."],
      ["Un misanthrope est quelqu'un qui…", 'fuit et déteste le genre humain', ['aime tous les hommes', 'étudie les insectes', 'parle plusieurs langues'], "misein = haïr, anthropos = homme. Le Misanthrope est une comédie de Molière (1666)."],
      ["Que signifie « polyglotte » ?", 'qui parle plusieurs langues', ['qui a beaucoup d’amis', 'qui voyage beaucoup', 'qui écrit des poèmes'], "poly = plusieurs, glôtta = langue."],
      ["Le mot « fantastique » vient du grec phantasia, qui signifie…", 'apparition, imagination', ['peur', 'mort', 'nuit'], "Le fantastique joue sur les apparitions et l'imagination du narrateur."],
      ["Que signifie la racine grecque « logie » (biologie, zoologie) ?", 'la science, l’étude', ['la maladie', 'la peur', 'la mesure'], "logos = parole, discours, raison. La zoologie est l'étude des animaux."]
    ]),
    bank('Culture littéraire', "Rappelle-toi les textes du XIXe siècle étudiés : nouvelles réalistes, récits fantastiques, poésie.", [
      ["Quelle est la caractéristique principale du récit fantastique ?", "l'hésitation entre une explication rationnelle et une explication surnaturelle", ['la présence de fées et de magie acceptées par tous', 'un récit situé dans le futur', 'une enquête policière résolue'], "Dans le fantastique, l'étrange surgit dans le réel et le lecteur hésite. Dans le merveilleux (contes), la magie est acceptée."],
      ["Qui a écrit Le Horla (1887) ?", 'Guy de Maupassant', ['Prosper Mérimée', 'Émile Zola', 'Honoré de Balzac'], "Le narrateur du Horla tient un journal où il décrit une présence invisible qui le hante."],
      ["Qui a écrit La Vénus d'Ille (1837) ?", 'Prosper Mérimée', ['Guy de Maupassant', 'Théophile Gautier', 'Victor Hugo'], "Une statue de Vénus semble prendre vie et provoquer la mort d'Alphonse le soir de ses noces."],
      ["Combien de vers compte un sonnet ?", '14', ['12', '10', '16'], "Le sonnet compte deux quatrains (4 vers) et deux tercets (3 vers) : 4 + 4 + 3 + 3 = 14."],
      ["Combien de syllabes compte un alexandrin ?", '12', ['8', '10', '14'], "L'alexandrin a 12 syllabes, souvent coupées en deux hémistiches de 6 (césure). L'octosyllabe en a 8, le décasyllabe 10."],
      ["Comment appelle-t-on des rimes disposées ABAB ?", 'des rimes croisées', ['des rimes embrassées', 'des rimes suivies', 'des rimes libres'], "ABAB = croisées ; ABBA = embrassées ; AABB = suivies (ou plates)."],
      ["Quel écrivain a écrit le cycle des Rougon-Macquart (Germinal, L'Assommoir) ?", 'Émile Zola', ['Honoré de Balzac', 'Gustave Flaubert', 'Victor Hugo'], "Zola est le chef de file du naturalisme ; Balzac a écrit La Comédie humaine."],
      ["Que cherche à faire le réalisme ?", 'représenter la réalité avec précision, y compris la vie quotidienne et sociale', ['décrire des mondes imaginaires', 'exprimer uniquement les sentiments du poète', 'imiter les tragédies antiques'], "Balzac, Flaubert et Maupassant décrivent la société de leur temps avec précision."],
      ["Comment appelle-t-on un roman composé de lettres échangées par les personnages ?", 'un roman épistolaire', ['un roman d’aventures', 'une autobiographie', 'une nouvelle'], "Exemple : Les Liaisons dangereuses de Laclos (1782)."],
      ["Qui a écrit Les Contemplations et Les Misérables ?", 'Victor Hugo', ['Charles Baudelaire', 'Émile Zola', 'Guy de Maupassant'], "Victor Hugo (1802-1885), poète, romancier et dramaturge, est la grande figure du romantisme."],
      ["Qui a écrit Le Cid (1637) ?", 'Pierre Corneille', ['Jean Racine', 'Molière', 'Victor Hugo'], "Rodrigue doit choisir entre son amour pour Chimène et l'honneur de sa famille : c'est le « dilemme cornélien »."]
    ])
  ],
  flashcards: cards('Français 4e', [
    ['Subjonctif présent', 'Radical de « ils » au présent + -e, -es, -e, -ions, -iez, -ent : que je finisse.'],
    ['Subjonctifs irréguliers', 'que je sois, que j’aie, que j’aille, que je fasse, que je puisse, que je sache, que je veuille.'],
    ['Plus-que-parfait', 'Auxiliaire à l’imparfait + participe passé : j’avais fini, elle était partie.'],
    ['Voix passive', 'Sujet subit l’action : être + participe passé + complément d’agent (par…).'],
    ['Discours indirect', 'Verbe introducteur au passé : présent → imparfait, futur → conditionnel, demain → le lendemain.'],
    ['Proposition relative', 'Introduite par un pronom relatif (qui, que, dont, où), complète un nom.'],
    ['Proposition complétive', 'Introduite par « que », souvent COD du verbe principal.'],
    ['Fantastique', 'Hésitation entre explication rationnelle et surnaturelle (Maupassant, Mérimée).'],
    ['Sonnet', '14 vers : 2 quatrains + 2 tercets.'],
    ['Alexandrin', '12 syllabes, césure à l’hémistiche (6/6).'],
    ['Oxymore', 'Deux mots contradictoires associés : « cette obscure clarté ».'],
    ['Litote', 'Dire moins pour suggérer plus : « Va, je ne te hais point ».']
  ])
};

// ---------- 4e · Histoire-Géographie-EMC ----------
const HG4 = {
  generators: [
    bank('Histoire : le XVIIIe siècle, expansions et Lumières', "Pense au commerce atlantique, aux philosophes des Lumières et à la révolution américaine.", [
      ["Qu'est-ce que le commerce triangulaire ?", "un commerce entre l'Europe, l'Afrique et l'Amérique fondé sur la traite des esclaves", ['un commerce de la soie entre la Chine et Rome', 'un échange de blé entre trois villes françaises', 'un commerce maritime en Méditerranée'], "Les navires partent d'Europe avec des marchandises, achètent des captifs en Afrique, les vendent en Amérique et reviennent avec du sucre, du café ou du coton."],
      ["Quels ports français s'enrichissent grâce à la traite atlantique ?", 'Nantes et Bordeaux', ['Lyon et Strasbourg', 'Lille et Metz', 'Toulouse et Dijon'], "Nantes est le premier port négrier français au XVIIIe siècle ; Bordeaux, La Rochelle et Le Havre y participent aussi."],
      ["Qu'est-ce que le Code noir (1685) ?", "un texte royal qui réglemente l'esclavage dans les colonies françaises", ['une loi abolissant l’esclavage', 'un code de navigation', 'une déclaration des philosophes'], "Le Code noir fait de l'esclave un « bien meuble » appartenant à son maître."],
      ["Qui dirige l'Encyclopédie ?", "Diderot et d'Alembert", ['Voltaire et Rousseau', 'Montesquieu et Voltaire', 'Louis XV et Colbert'], "Publiée de 1751 à 1772, l'Encyclopédie diffuse les savoirs et les idées des Lumières."],
      ["Quel philosophe défend la séparation des pouvoirs dans De l'esprit des lois (1748) ?", 'Montesquieu', ['Voltaire', 'Rousseau', 'Diderot'], "Montesquieu distingue le pouvoir législatif, exécutif et judiciaire pour éviter la tyrannie."],
      ["Quel philosophe écrit Du contrat social (1762) ?", 'Jean-Jacques Rousseau', ['Voltaire', 'Montesquieu', "d'Alembert"], "Rousseau affirme que la souveraineté appartient au peuple."],
      ["Quel philosophe combat l'intolérance religieuse, notamment lors de l'affaire Calas ?", 'Voltaire', ['Rousseau', 'Montesquieu', 'Diderot'], "Voltaire obtient la réhabilitation de Jean Calas, protestant exécuté injustement en 1762 (Traité sur la tolérance, 1763)."],
      ["Que défendent les philosophes des Lumières ?", 'la raison, la liberté et le progrès', ['le pouvoir absolu du roi', 'l’obéissance aveugle à l’Église', 'le retour au Moyen Âge'], "Ils critiquent l'absolutisme, l'intolérance et l'esclavage, et veulent éclairer les esprits."],
      ["En quelle année les treize colonies américaines déclarent-elles leur indépendance ?", '1776', ['1789', '1783', '1804'], "La Déclaration d'indépendance est adoptée le 4 juillet 1776 ; l'indépendance est reconnue par le traité de Paris en 1783."],
      ["Qui est le premier président des États-Unis ?", 'George Washington', ['Thomas Jefferson', 'Abraham Lincoln', 'La Fayette'], "Washington, chef de l'armée pendant la guerre d'indépendance, est président de 1789 à 1797."]
    ]),
    bank('Histoire : la Révolution française et l’Empire', "Situe chaque événement entre 1789 et 1815.", [
      ["Que s'ouvre-t-il à Versailles le 5 mai 1789 ?", 'les états généraux', ["l'Assemblée législative", 'le Sénat', 'le Directoire'], "Louis XVI convoque les états généraux (clergé, noblesse, tiers état) pour résoudre la crise financière."],
      ["Que jurent les députés lors du serment du Jeu de paume (20 juin 1789) ?", "de ne pas se séparer avant d'avoir donné une constitution à la France", ['de rester fidèles au roi absolu', 'de déclarer la guerre à l’Autriche', 'de rétablir les privilèges'], "Les députés du tiers état, proclamés Assemblée nationale, refusent de se séparer."],
      ["Que se passe-t-il le 14 juillet 1789 ?", 'la prise de la Bastille', ["l'exécution du roi", 'la proclamation de la République', 'le sacre de Napoléon'], "Le peuple parisien s'empare de la Bastille, symbole de l'arbitraire royal."],
      ["Que décide l'Assemblée dans la nuit du 4 août 1789 ?", "l'abolition des privilèges", ["l'abolition de l'esclavage", 'la condamnation du roi', 'le droit de vote des femmes'], "Les privilèges et les droits féodaux sont supprimés : tous sont égaux devant la loi et l'impôt."],
      ["Quand la Déclaration des droits de l'homme et du citoyen est-elle adoptée ?", 'le 26 août 1789', ['le 14 juillet 1789', 'le 21 septembre 1792', 'le 2 décembre 1804'], "La DDHC proclame la liberté, l'égalité en droits et la souveraineté de la nation."],
      ["Quand la République est-elle proclamée pour la première fois en France ?", 'en septembre 1792', ['en juillet 1789', 'en janvier 1793', 'en novembre 1799'], "Après la chute de la monarchie (10 août 1792), la Convention proclame la République le 21-22 septembre 1792."],
      ["En quelle année Louis XVI est-il guillotiné ?", '1793', ['1789', '1792', '1799'], "Jugé pour trahison par la Convention, Louis XVI est exécuté le 21 janvier 1793."],
      ["Qui rédige la Déclaration des droits de la femme et de la citoyenne (1791) ?", 'Olympe de Gouges', ['Marie-Antoinette', 'Madame Roland', 'Joséphine de Beauharnais'], "Olympe de Gouges réclame l'égalité entre hommes et femmes ; elle est guillotinée en 1793."],
      ["Comment Napoléon Bonaparte prend-il le pouvoir en 1799 ?", "par un coup d'État (18 Brumaire)", ['par une élection au suffrage universel', 'par héritage', 'par un vote des femmes'], "Bonaparte devient Premier consul, puis empereur en 1804."],
      ["Quel texte de 1804, toujours en vigueur, rassemble les lois civiles françaises ?", 'le Code civil', ['la DDHC', 'le Concordat', 'la Constitution de 1958'], "Le Code civil consacre l'égalité devant la loi et la propriété, mais soumet la femme à son mari."],
      ["Quelle défaite met fin à l'Empire de Napoléon en 1815 ?", 'Waterloo', ['Austerlitz', 'Iéna', 'Trafalgar'], "Austerlitz (1805) et Iéna (1806) sont des victoires ; Trafalgar (1805) est une défaite navale."]
    ]),
    bank('Histoire : l’Europe et le monde au XIXe siècle', "Pense à l'industrialisation, à la condition ouvrière et à la colonisation.", [
      ["Quelle invention symbolise la première révolution industrielle ?", 'la machine à vapeur', ["l'ordinateur", 'le moteur électrique', "l'avion"], "Perfectionnée par James Watt, elle actionne usines, locomotives et bateaux."],
      ["Quelle énergie alimente la première industrialisation ?", 'le charbon', ['le pétrole', "l'électricité", 'le nucléaire'], "Le charbon alimente les machines à vapeur ; le pétrole et l'électricité se développent à la fin du XIXe siècle."],
      ["Qu'est-ce que l'exode rural ?", 'le départ des habitants des campagnes vers les villes', ['le départ des citadins vers la campagne', 'l’émigration vers l’Amérique', 'la fuite pendant une guerre'], "Les paysans viennent travailler dans les usines des villes industrielles."],
      ["Qu'est-ce que le prolétariat ?", "l'ensemble des ouvriers qui ne possèdent que leur force de travail", ['les propriétaires d’usines', 'les nobles', 'les paysans propriétaires'], "Les ouvriers vivent souvent dans la misère : longues journées, salaires bas, travail des enfants."],
      ["Qui publie le Manifeste du parti communiste en 1848 ?", 'Karl Marx et Friedrich Engels', ['Jules Ferry et Gambetta', 'Victor Hugo et Zola', 'Napoléon III et Bismarck'], "Ils appellent les prolétaires à s'unir pour renverser le capitalisme."],
      ["En quelle année l'esclavage est-il définitivement aboli dans les colonies françaises ?", '1848', ['1794', '1789', '1905'], "Une première abolition a lieu en 1794 ; Bonaparte rétablit l'esclavage en 1802 ; l'abolition définitive date du 27 avril 1848."],
      ["Quel homme politique est à l'origine du décret d'abolition de 1848 ?", 'Victor Schœlcher', ['Jules Ferry', 'Napoléon III', 'Léon Gambetta'], "Victor Schœlcher, sous-secrétaire d'État aux colonies, fait adopter le décret du 27 avril 1848."],
      ["Quand commence la conquête de l'Algérie par la France ?", '1830', ['1848', '1870', '1885'], "La prise d'Alger en 1830 ouvre une longue conquête marquée par de violentes résistances (Abd el-Kader)."],
      ["Que décide la conférence de Berlin (1884-1885) ?", "les règles du partage de l'Afrique entre puissances européennes", ['la fin de la guerre franco-prussienne', 'la création de l’ONU', "l'indépendance des colonies"], "Les Européens se répartissent l'Afrique sans consulter les populations."],
      ["Qu'est-ce qu'un syndicat ?", 'une association qui défend les intérêts des travailleurs', ['une usine d’État', 'un parti royaliste', 'une banque'], "Les syndicats sont autorisés en France par la loi Waldeck-Rousseau de 1884."]
    ]),
    bank('Histoire : la France au XIXe siècle (société et politique)', "Pense à la conquête de la démocratie : suffrage, République, école, laïcité.", [
      ["En quelle année le suffrage universel masculin est-il instauré en France ?", '1848', ['1789', '1870', '1944'], "En 1848, tous les hommes de 21 ans et plus obtiennent le droit de vote. Les femmes votent seulement à partir de 1944."],
      ["Quel empereur règne sur la France de 1852 à 1870 ?", 'Napoléon III', ['Napoléon Ier', 'Louis-Philippe', 'Charles X'], "Le Second Empire prend fin avec la défaite de Sedan contre la Prusse en 1870."],
      ["Quand la IIIe République est-elle proclamée ?", 'le 4 septembre 1870', ['le 14 juillet 1789', 'le 22 septembre 1792', 'le 4 octobre 1958'], "Elle est proclamée après la capture de Napoléon III à Sedan et dure jusqu'en 1940."],
      ["Qu'est-ce que la Commune de Paris (1871) ?", "une insurrection parisienne écrasée lors de la « Semaine sanglante »", ['une victoire de Napoléon III', 'une fête nationale', 'une loi sur l’école'], "Les communards refusent la défaite et veulent une république sociale ; la répression fait des milliers de morts."],
      ["Que rendent les lois Ferry (1881-1882) ?", "l'école primaire gratuite, obligatoire et laïque", ['le collège payant', 'l’université réservée aux nobles', 'l’enseignement religieux obligatoire'], "Jules Ferry veut former des citoyens attachés à la République."],
      ["Que prévoit la loi de 1905 ?", "la séparation des Églises et de l'État", ['le droit de vote des femmes', 'la création de la Sécurité sociale', "l'abolition de l'esclavage"], "La République garantit la liberté de conscience et ne reconnaît ni ne finance aucun culte."],
      ["Quel capitaine est accusé à tort de trahison à partir de 1894 ?", 'Alfred Dreyfus', ['Philippe Pétain', 'Charles de Gaulle', 'Georges Clemenceau'], "Victime de l'antisémitisme, Dreyfus est réhabilité en 1906. L'affaire divise profondément la France."],
      ["Quel écrivain publie « J'accuse… ! » en 1898 pour défendre Dreyfus ?", 'Émile Zola', ['Victor Hugo', 'Guy de Maupassant', 'Jean Jaurès'], "Zola publie sa lettre au président de la République dans le journal L'Aurore."],
      ["Sous quelle République la Marseillaise devient-elle hymne national et le 14 juillet fête nationale ?", 'la IIIe République', ['la Ire République', 'la IIe République', 'la Ve République'], "La IIIe République enracine ses symboles : hymne (1879), fête nationale (1880), devise sur les frontons."],
      ["Les femmes votent-elles en France au XIXe siècle ?", "non, elles n'obtiennent le droit de vote qu'en 1944", 'oui, depuis 1848'.split('|').concat(['oui, depuis 1789', 'oui, mais seulement à Paris']), "Le suffrage « universel » de 1848 est en réalité masculin."]
    ]),
    bank('Géographie : urbanisation et mobilités', "Pense aux grandes villes du monde et aux raisons des migrations.", [
      ["Qu'est-ce que l'urbanisation ?", "l'augmentation de la part de la population vivant en ville", ['la construction d’une seule ville nouvelle', 'le départ des citadins vers la campagne', 'la destruction des bidonvilles'], "Plus de la moitié de l'humanité vit aujourd'hui en ville."],
      ["Qu'est-ce qu'une mégapole (ou mégacité) ?", "une agglomération de plus de 10 millions d'habitants", ['une ville de plus de 100 000 habitants', 'une capitale', 'une ville très ancienne'], "Exemples : Tokyo, Delhi, Shanghai, Lagos, São Paulo."],
      ["Laquelle de ces agglomérations est l'une des plus peuplées du monde ?", 'Tokyo', ['Lyon', 'Genève', 'Bruxelles'], "L'agglomération de Tokyo compte environ 37 millions d'habitants."],
      ["Qu'est-ce qu'une ville mondiale ?", 'une ville qui exerce des fonctions de commandement à l’échelle mondiale', 'une ville très peuplée mais isolée'.split('|').concat(['une ville située sur l’équateur', 'une ville où vivent des touristes']), "New York, Londres, Tokyo et Paris concentrent sièges d'entreprises, bourses et institutions internationales."],
      ["Qu'est-ce que la périurbanisation ?", "l'extension de l'habitat urbain dans les campagnes proches des villes", ['la rénovation du centre-ville', 'la construction de gratte-ciel', 'le retour à l’agriculture'], "Elle entraîne de longs trajets quotidiens en voiture."],
      ["Qu'est-ce qu'un réfugié ?", 'une personne qui fuit son pays à cause de la guerre ou de persécutions et bénéficie d’une protection', ['un touriste en vacances', 'un étudiant en échange', 'un travailleur saisonnier'], "Le statut de réfugié est défini par la convention de Genève (1951)."],
      ["Pourquoi la majorité des migrants quittent-ils leur pays ?", 'pour trouver du travail et de meilleures conditions de vie', ['pour faire du tourisme', 'pour fuir le froid', 'pour apprendre une langue'], "Les migrations économiques sont les plus nombreuses ; d'autres fuient les conflits ou les catastrophes."],
      ["Que sont les transferts de fonds des migrants ?", "l'argent envoyé par les migrants à leur famille restée au pays", 'des aides de l’ONU'.split('|').concat(['des impôts payés à l’arrivée', 'des billets d’avion']), "Ils représentent une ressource essentielle pour certains pays (Mexique, Philippines, Sénégal…)."],
      ["Quel pays est l'une des premières destinations touristiques internationales du monde ?", 'la France', ['la Mongolie', 'le Tchad', 'le Bhoutan'], "La France accueille chaque année autour de 90 à 100 millions de touristes internationaux."],
      ["Qu'est-ce qu'une migration transnationale ?", "un déplacement de population d'un pays vers un autre", ['un déplacement à l’intérieur d’une même ville', 'un voyage d’une journée', 'un déménagement dans la même région'], "Elle franchit au moins une frontière internationale."]
    ]),
    bank('Géographie : des espaces transformés par la mondialisation', "Pense aux flux de marchandises, aux ports et aux grandes routes maritimes.", [
      ["Qu'est-ce que la mondialisation ?", "la mise en relation et l'interdépendance croissante des territoires du monde", ['la création d’un gouvernement mondial', 'la fermeture des frontières', 'la fin du commerce international'], "Elle repose sur les flux de marchandises, de capitaux, d'informations et de personnes."],
      ["Quel mode de transport assure la plus grande part du commerce mondial de marchandises ?", 'le transport maritime', ['le transport aérien', 'le transport routier', 'le transport ferroviaire'], "Environ 80 % des marchandises échangées dans le monde (en volume) voyagent par la mer."],
      ["Qu'est-ce qu'un conteneur ?", 'une grande boîte métallique standardisée pour transporter les marchandises', ['un navire pétrolier', 'un entrepôt portuaire', 'une douane'], "Le conteneur facilite le passage du bateau au train ou au camion."],
      ["Quel est le premier port à conteneurs du monde ?", 'Shanghai', ['Rotterdam', 'Le Havre', 'New York'], "Les plus grands ports à conteneurs sont asiatiques (Shanghai, Singapour, Ningbo). Rotterdam est le premier port européen."],
      ["Qu'est-ce qu'une firme transnationale (FTN) ?", 'une entreprise qui possède des filiales dans plusieurs pays', ['une entreprise publique', 'une petite entreprise locale', 'une association'], "Exemples : Apple, TotalEnergies, Toyota."],
      ["Quel détroit très fréquenté relie l'océan Indien au Pacifique ?", 'le détroit de Malacca', ['le détroit de Gibraltar', "le détroit d'Ormuz", 'le détroit de Béring'], "Malacca, entre la Malaisie et l'Indonésie, voit passer une part considérable du commerce mondial."],
      ["Quel canal relie la mer Méditerranée et la mer Rouge ?", 'le canal de Suez', ['le canal de Panama', 'le canal de Kiel', 'le canal de Corinthe'], "Inauguré en 1869, il évite le contournement de l'Afrique. Le canal de Panama relie l'Atlantique au Pacifique."],
      ["Qu'est-ce qu'une ZEE ?", "un espace maritime jusqu'à 200 milles marins des côtes où l'État exploite les ressources", ['une zone interdite à la pêche', 'un port franc', 'une zone de guerre'], "Grâce à ses territoires ultramarins, la France possède l'une des plus vastes ZEE du monde."],
      ["Qu'est-ce qu'une façade maritime ?", "un littoral regroupant plusieurs grands ports reliés à un même arrière-pays", ['une plage touristique', 'un phare', 'une île isolée'], "Exemple : la Northern Range, du Havre à Hambourg."],
      ["Pourquoi surnomme-t-on la Chine « l'atelier du monde » ?", 'parce qu’elle produit et exporte une grande partie des biens manufacturés', 'parce qu’elle ne produit que des œuvres d’art'.split('|').concat(['parce qu’elle importe tout ce qu’elle consomme', 'parce qu’elle a peu d’usines']), "Main-d'œuvre nombreuse, infrastructures et ouverture au commerce en ont fait la première puissance exportatrice."]
    ]),
    bank('EMC : la justice et les libertés', "Pense aux principes de la justice en France et au rôle de chacun.", [
      ["Qu'est-ce que la présomption d'innocence ?", "toute personne est considérée innocente tant que sa culpabilité n'est pas prouvée", ['toute personne arrêtée est coupable', 'seuls les adultes peuvent être jugés', 'un accusé doit prouver son innocence'], "Ce principe est inscrit dans la DDHC (article 9)."],
      ["Quel tribunal juge les crimes les plus graves ?", "la cour d'assises", 'le tribunal de police'.split('|').concat(["le conseil de prud'hommes", 'le conseil de classe']), "La cour d'assises juge les crimes (meurtre, viol…) avec des citoyens jurés tirés au sort."],
      ["Quel juge est spécialisé dans les affaires concernant les mineurs ?", 'le juge des enfants', ["le juge d'instruction", 'le procureur', 'le maire'], "La justice des mineurs privilégie l'éducation à la sanction."],
      ["À partir de quel âge est-on majeur en France ?", '18 ans', ['13 ans', '16 ans', '21 ans'], "La majorité est passée de 21 à 18 ans en 1974. Un mineur peut toutefois être tenu responsable de ses actes."],
      ["Qu'est-ce que la séparation des pouvoirs ?", 'les pouvoirs législatif, exécutif et judiciaire sont confiés à des institutions différentes', ['le président détient tous les pouvoirs', 'les juges votent les lois', 'le pouvoir est partagé entre les régions'], "Idée défendue par Montesquieu pour protéger les libertés."],
      ["Qui vote les lois en France ?", 'le Parlement (Assemblée nationale et Sénat)', ['le président seul', 'les juges', 'les maires'], "Le Parlement détient le pouvoir législatif."],
      ["Quel est le rôle d'un avocat ?", 'conseiller et défendre une personne devant la justice', ['juger les accusés', 'arrêter les suspects', 'voter les lois'], "Tout accusé a droit à un avocat : ce sont les droits de la défense."],
      ["Qu'est-ce qu'une contravention ?", "l'infraction la moins grave (par exemple un stationnement interdit)", ['un crime', 'un délit grave', 'une décision de justice'], "Trois catégories d'infractions : contravention, délit, crime."],
      ["Que garantit la loi de 1881 sur la liberté de la presse ?", "le droit de publier librement, dans les limites fixées par la loi", ['la censure de tous les journaux', 'l’interdiction des caricatures', 'le contrôle des journaux par le gouvernement'], "La diffamation et l'incitation à la haine restent punies."],
      ["Qu'est-ce que l'engagement citoyen ?", 'agir volontairement pour une cause ou pour les autres', ['obéir sans réfléchir', 'ne jamais voter', 'rester indifférent aux problèmes collectifs'], "Associations, bénévolat, délégués, éco-délégués : on peut s'engager dès le collège."]
    ]),
    chrono('Repères chronologiques 4e', [
      ['Publication du Code noir', '1685', "Il réglemente l'esclavage dans les colonies françaises."],
      ['Déclaration d’indépendance des États-Unis', '1776', 'Les treize colonies se libèrent de la tutelle britannique.'],
      ['Prise de la Bastille et Déclaration des droits de l’homme', '1789', 'Début de la Révolution française.'],
      ['Proclamation de la Ire République', '1792', 'La monarchie est abolie.'],
      ['Exécution de Louis XVI', '1793', 'Le roi est guillotiné le 21 janvier.'],
      ['Sacre de Napoléon et Code civil', '1804', "Napoléon devient empereur des Français."],
      ['Défaite de Waterloo', '1815', "Fin de l'Empire napoléonien."],
      ["Début de la conquête de l'Algérie", '1830', 'La France prend Alger.'],
      ["Suffrage universel masculin et abolition de l'esclavage", '1848', 'Deux grandes conquêtes de la IIe République.'],
      ['Proclamation de la IIIe République', '1870', 'Après la défaite de Sedan.'],
      ['Lois Ferry sur l’école', '1881-1882', "École primaire gratuite, obligatoire et laïque."],
      ["Loi de séparation des Églises et de l'État", '1905', "Fondement de la laïcité française."]
    ])
  ],
  flashcards: cards('Histoire-Géo-EMC 4e', [
    ['Lumières', 'Raison, liberté, progrès : Voltaire, Montesquieu, Rousseau, Diderot.'],
    ['Traite atlantique', 'Commerce triangulaire Europe-Afrique-Amérique ; Nantes, Bordeaux.'],
    ['1789', 'États généraux (5 mai), Bastille (14 juillet), abolition des privilèges (4 août), DDHC (26 août).'],
    ['1792', 'Proclamation de la Ire République.'],
    ['1804', 'Napoléon empereur ; Code civil.'],
    ['1848', 'Suffrage universel masculin ; abolition définitive de l’esclavage (Schœlcher).'],
    ['Révolution industrielle', 'Machine à vapeur, charbon, usines, exode rural, prolétariat.'],
    ['IIIe République', '1870-1940 ; lois Ferry (1881-1882) ; loi de 1905.'],
    ['Affaire Dreyfus', '1894-1906 ; « J’accuse… ! » de Zola (1898).'],
    ['Mondialisation', 'Interdépendance des territoires ; flux maritimes, FTN, conteneurs.'],
    ['Mégapole', 'Agglomération de plus de 10 millions d’habitants.'],
    ['Présomption d’innocence', 'Innocent tant que la culpabilité n’est pas prouvée.']
  ])
};

// ---------- 4e · Anglais (LV1) ----------
const EN4 = {
  generators: [
    genIrregular(IRREG.length),
    genPresentPerfect(),
    genComparatives(),
    genPreteritRegular(),
    bank('Grammaire anglaise', "Repère les indices : depuis quand, depuis combien de temps, obligation, futur…", [
      ["🇬🇧 « I have lived here ___ 2020. »", 'since', ['for', 'ago', 'during'], "since + point de départ (since 2020) ; for + durée (for six years) ; ago = il y a (prétérit)."],
      ["🇬🇧 « She has been my friend ___ ten years. »", 'for', ['since', 'ago', 'from'], "for + durée : for ten years."],
      ["🇬🇧 « I saw him two days ___. »", 'ago', ['since', 'for', 'before'], "ago (il y a) s'emploie avec le prétérit : two days ago."],
      ["🇬🇧 « Look at those clouds! It ___ rain. »", "'s going to", ['will', 'rains', 'is raining'], "be going to : prédiction fondée sur un indice visible (les nuages)."],
      ["🇬🇧 « If it rains, we ___ at home. »", 'will stay', ['would stay', 'stayed', 'stay'], "Condition probable : if + présent, will + base verbale."],
      ["🇬🇧 « You ___ smoke here. It's forbidden. »", "mustn't", ["don't have to", 'can', 'should'], "mustn't = interdiction ; don't have to = absence d'obligation."],
      ["🇬🇧 « The man ___ lives next door is a doctor. »", 'who', ['which', 'what', 'whose'], "who pour une personne ; which pour une chose ; whose = dont (possession)."],
      ["🇬🇧 « You ___ see a doctor if you feel ill. » (conseil)", 'should', ['must not', 'can’t', 'would'], "should exprime le conseil : tu devrais."],
      ["🇬🇧 « This book ___ by J.K. Rowling. »", 'was written', ['wrote', 'is writing', 'has write'], "Voix passive : be + participe passé (was written = a été écrit)."]
    ]),
    bank('Civilisation anglophone', "Pense aux pays de langue anglaise, à leur histoire et à leurs symboles.", [
      ["🇬🇧 Quelle est la capitale de l'Écosse ?", 'Édimbourg', ['Glasgow', 'Dublin', 'Cardiff'], "Edinburgh est la capitale de l'Écosse ; Cardiff, du pays de Galles ; Dublin, de l'Irlande."],
      ["🇬🇧 Quelle est la capitale de l'Australie ?", 'Canberra', ['Sydney', 'Melbourne', 'Perth'], "Sydney est la plus grande ville, mais la capitale est Canberra."],
      ["🇬🇧 Combien d'étoiles compte le drapeau des États-Unis ?", '50', ['13', '48', '52'], "Une étoile par État (50) ; les 13 bandes rappellent les 13 colonies fondatrices."],
      ["🇬🇧 Qui a prononcé le discours « I have a dream » (1963) ?", 'Martin Luther King', ['Abraham Lincoln', 'Barack Obama', 'Nelson Mandela'], "Martin Luther King luttait pour les droits civiques des Afro-Américains."],
      ["🇬🇧 Que désigne « the Commonwealth » ?", "une association de pays, pour la plupart anciennes colonies britanniques", ['le parlement anglais', 'la monnaie britannique', 'une équipe de football'], "Elle réunit 56 pays, dont le Canada, l'Inde et l'Australie."],
      ["🇬🇧 Quel monument londonien abrite la cloche Big Ben ?", "la tour Elizabeth du palais de Westminster", ['Tower Bridge', 'Buckingham Palace', 'la cathédrale Saint-Paul'], "Big Ben est le nom de la grosse cloche ; la tour s'appelle Elizabeth Tower depuis 2012."],
      ["🇬🇧 Quel pays anglophone a deux langues officielles, l'anglais et le français ?", 'le Canada', ["l'Australie", 'la Nouvelle-Zélande', "l'Irlande"], "Au Canada, le Québec est majoritairement francophone."],
      ["🇬🇧 Qui était William Shakespeare ?", 'un dramaturge et poète anglais (1564-1616)', ['un roi d’Angleterre', 'un explorateur', 'un scientifique'], "Auteur de Romeo and Juliet, Hamlet, Macbeth."]
    ])
  ],
  flashcards: cards('Anglais 4e', [
    ['Present perfect', 'have/has + participe passé : lien passé-présent (I have lost my keys).'],
    ['since / for', 'since + point de départ ; for + durée.'],
    ['ago', 'Il y a : avec le prétérit (two years ago).'],
    ['be going to', 'Intention ou prédiction fondée sur un indice.'],
    ['will', 'Futur, décision immédiate, prédiction.'],
    ['Conditionnel (type 1)', 'If + présent, will + base : If it rains, I will stay.'],
    ['Modaux', 'must (obligation), mustn’t (interdiction), should (conseil), can (capacité).'],
    ['Relatifs', 'who (personne), which (chose), whose (possession), that (les deux).'],
    ['Voix passive', 'be + participe passé : The cake was eaten.'],
    ['Superlatif', 'the + adj-est / the most + adj : the biggest, the most famous.'],
    ['write – wrote – written', 'écrire'],
    ['Question tags', 'You like tea, don’t you? — reprise de l’auxiliaire à la forme inverse.']
  ])
};

// ---------- 4e · LV2 ----------
const LV2_4 = {
  generators: [
    genEsPresent(['ser', 'estar', 'tener', 'ir', 'hacer']),
    genEsPreterito(),
    genEsGerundio(),
    genEsNumbers(),
    bank('Espagnol : grammaire', "Pense aux traductions de « on », à gustar et aux verbes à diphtongue.", [
      ["🇪🇸 Espagnol : « A mí me ___ los deportes. »", 'gustan', ['gusta', 'gusto', 'gustas'], "gustar s'accorde avec ce qui plaît : los deportes est pluriel → gustan."],
      ["🇪🇸 Espagnol : « (poder, yo) ___ venir mañana. »", 'Puedo', ['Podo', 'Pudo', 'Pueda'], "poder diphtongue o → ue aux personnes 1, 2, 3 et 6 : puedo, puedes, puede, podemos, podéis, pueden."],
      ["🇪🇸 Espagnol : « (querer, tú) ¿___ un helado? »", 'Quieres', ['Queres', 'Quiere', 'Quieras'], "querer diphtongue e → ie : quiero, quieres, quiere, queremos, queréis, quieren."],
      ["🇪🇸 Espagnol : comment traduire l'obligation personnelle « Je dois travailler » ?", 'Tengo que trabajar.', ['Hay que trabajar.', 'Debo de trabajar mañana.', 'Estoy trabajar.'], "tener que + infinitif = obligation personnelle ; hay que + infinitif = obligation générale (il faut)."],
      ["🇪🇸 Espagnol : « ___ muchos turistas en la playa. » (il y a)", 'Hay', ['Está', 'Es', 'Tiene'], "hay = il y a (invariable)."],
      ["🇪🇸 Espagnol : que signifie « Ayer fui al cine » ?", 'Hier, je suis allé(e) au cinéma.', ["Demain, j'irai au cinéma.", 'Hier, il est allé au cinéma.', 'Je vais au cinéma.'], "fui est le pretérito de ir (et de ser) à la 1re personne ; ayer = hier."],
      ["🇪🇸 Espagnol : traduis « el año pasado ».", "l'année dernière", "l'année prochaine".split('|').concat(['cette année', 'il y a un an']), "pasado = passé, dernier ; que viene / próximo = prochain."]
    ]),
    bank('Espagnol : culture', "Pense aux pays hispanophones, à leurs fêtes et à leurs artistes.", [
      ["🇪🇸 Quel peintre espagnol a peint Guernica (1937) ?", 'Pablo Picasso', ['Salvador Dalí', 'Francisco de Goya', 'Diego Velázquez'], "Guernica dénonce le bombardement de la ville basque pendant la guerre civile espagnole."],
      ["🇪🇸 Quelle fête mexicaine célèbre les défunts début novembre ?", 'el Día de Muertos', ['la Tomatina', 'los Sanfermines', 'la Feria de Abril'], "Autels, crânes en sucre et fleurs orange (cempasúchil) honorent les ancêtres."],
      ["🇪🇸 Combien de pays ont l'espagnol comme langue officielle ?", '21', ['5', '12', '40'], "L'Espagne, la Guinée équatoriale et 19 pays d'Amérique latine (sans le Brésil, lusophone)."],
      ["🇪🇸 Quel architecte a conçu la Sagrada Família à Barcelone ?", 'Antoni Gaudí', ['Pablo Picasso', 'Joan Miró', 'Rafael Moneo'], "Commencée en 1882, elle est toujours en construction."],
      ["🇪🇸 Quelle est la capitale de l'Argentine ?", 'Buenos Aires', ['Santiago', 'Lima', 'Montevideo'], "Santiago (Chili), Lima (Pérou), Montevideo (Uruguay)."],
      ["🇪🇸 Que sont les « tapas » ?", 'de petites portions servies à l’apéritif', ['un plat de riz', 'une danse', 'un instrument de musique'], "La paella est le plat de riz valencien ; le flamenco, la danse andalouse."],
      ["🇪🇸 Quelle civilisation a bâti le Machu Picchu ?", 'les Incas', ['les Aztèques', 'les Mayas', 'les Olmèques'], "Les Incas l'ont construit au XVe siècle dans les Andes (Pérou)."],
      ["🇪🇸 Qui a écrit Don Quichotte ?", 'Miguel de Cervantes', ['Federico García Lorca', 'Pablo Neruda', 'Gabriel García Márquez'], "Publié en 1605 et 1615, c'est l'un des premiers romans modernes."]
    ]),
    bank('Allemand et italien', "Repère la langue (drapeau) puis pense aux règles de base.", [
      ["🇩🇪 Allemand : où se place le verbe conjugué dans une phrase déclarative ?", 'en deuxième position', ['en première position', 'à la fin', 'n’importe où'], "Heute gehe ich ins Kino : le verbe reste en 2e position, le sujet passe après."],
      ["🇩🇪 Allemand : que signifie « Ich habe Hunger » ?", "J'ai faim.", ["J'ai soif.", "J'ai froid.", "J'ai sommeil."], "Hunger = faim ; Durst = soif."],
      ["🇩🇪 Allemand : quel est le pluriel de « das Kind » (l'enfant) ?", 'die Kinder', ['die Kinds', 'das Kinden', 'der Kinder'], "Au pluriel, l'article est toujours « die »."],
      ["🇩🇪 Allemand : que signifie « Ich spiele gern Fußball » ?", "J'aime jouer au football.", ['Je joue mal au football.', 'Je regarde le football.', 'Je ne joue pas au football.'], "gern + verbe = aimer faire quelque chose."],
      ["🇮🇹 Italien : que signifie « Ho fame » ?", "J'ai faim.", ["J'ai soif.", 'Je suis fatigué.', "J'ai chaud."], "avere fame = avoir faim ; avere sete = avoir soif."],
      ["🇮🇹 Italien : conjugue « parlare » avec « noi ».", 'parliamo', ['parlate', 'parlano', 'parlo'], "Présent : parlo, parli, parla, parliamo, parlate, parlano."],
      ["🇮🇹 Italien : quel est l'article de « studente » au masculin singulier ?", 'lo', ['il', 'la', 'gli'], "Devant s + consonne (st, sp…) ou z, l'article masculin est lo : lo studente, lo zaino."],
      ["🇮🇹 Italien : que signifie « Dove abiti? » ?", 'Où habites-tu ?', "Comment t'appelles-tu ?".split('|').concat(['Quel âge as-tu ?', "D'où viens-tu ?"]), "dove = où ; abitare = habiter."]
    ])
  ],
  flashcards: cards('LV2 4e', [
    ['🇪🇸 Pretérito -ar', 'hablé, hablaste, habló, hablamos, hablasteis, hablaron.'],
    ['🇪🇸 Pretérito -er / -ir', 'comí, comiste, comió, comimos, comisteis, comieron.'],
    ['🇪🇸 ir / ser au pretérito', 'fui, fuiste, fue, fuimos, fuisteis, fueron.'],
    ['🇪🇸 Diphtongues', 'o → ue (poder → puedo) ; e → ie (querer → quiero).'],
    ['🇪🇸 Obligation', 'tener que + infinitif (personnelle) ; hay que + infinitif (générale).'],
    ['🇪🇸 Action en cours', 'estar + gérondif : estoy comiendo.'],
    ['🇪🇸 gustar', 'me gusta + singulier / me gustan + pluriel.'],
    ['🇪🇸 Marqueurs du passé', 'ayer, anoche, el año pasado, hace dos días.'],
    ['🇩🇪 Place du verbe', 'Verbe conjugué en 2e position ; dans une subordonnée, à la fin.'],
    ['🇩🇪 gern', 'Ich spiele gern = j’aime jouer.'],
    ['🇮🇹 Présent -are', 'parlo, parli, parla, parliamo, parlate, parlano.'],
    ['🇮🇹 Articles', 'il / lo / l’ (masc.), la / l’ (fém.), i / gli / le (pluriel).']
  ])
};

// ---------- 4e · Arts plastiques & Éducation musicale ----------
const ARTS4 = {
  generators: [
    bank('Histoire des arts XVIIIe-XIXe', "Situe l'œuvre : Lumières, néoclassicisme, romantisme, réalisme, impressionnisme ?", [
      ["Qui a peint La Liberté guidant le peuple (1830) ?", 'Eugène Delacroix', ['Jacques-Louis David', 'Gustave Courbet', 'Claude Monet'], "Ce tableau romantique célèbre les Trois Glorieuses de juillet 1830."],
      ["Quel tableau a donné son nom à l'impressionnisme ?", 'Impression, soleil levant de Monet', ['Le Déjeuner sur l’herbe de Manet', 'Les Glaneuses de Millet', 'La Nuit étoilée de Van Gogh'], "Exposé en 1874, il fut moqué par un critique qui inventa le mot « impressionnistes »."],
      ["Qui a peint Le Sacre de Napoléon ?", 'Jacques-Louis David', ['Eugène Delacroix', 'Théodore Géricault', 'Jean-Auguste-Dominique Ingres'], "David, peintre néoclassique, fut le peintre officiel de l'Empereur."],
      ["Quel mouvement représente la vie quotidienne des gens simples, sans idéaliser (Courbet, Millet) ?", 'le réalisme', ['le romantisme', 'le baroque', 'le cubisme'], "Courbet peint Un enterrement à Ornans (1850) ; Millet, Les Glaneuses (1857)."],
      ["Quel peintre romantique a peint Le Radeau de la Méduse ?", 'Théodore Géricault', ['Eugène Delacroix', 'Gustave Courbet', 'Édouard Manet'], "Il s'inspire d'un naufrage réel de 1816."],
      ["Quelle invention de 1839 bouleverse la représentation du réel ?", 'la photographie', ['le cinéma', 'la peinture à l’huile', 'la gravure'], "Le daguerréotype est présenté en 1839 ; le cinéma des frères Lumière date de 1895."],
      ["Quel ingénieur a construit la tour pour l'Exposition universelle de 1889 ?", 'Gustave Eiffel', ['Le Corbusier', 'Georges-Eugène Haussmann', 'Charles Garnier'], "La tour Eiffel, en fer puddlé, est le symbole de l'architecture métallique."],
      ["Qui a sculpté Le Penseur ?", 'Auguste Rodin', ['Camille Claudel', 'Antonio Canova', 'Edgar Degas'], "Rodin le conçoit pour La Porte de l'Enfer (fin XIXe s.)."]
    ]),
    bank('Éducation musicale', "Écoute la forme, l'effectif et l'époque.", [
      ["Quel compositeur autrichien du XVIIIe siècle a écrit La Flûte enchantée ?", 'Mozart', ['Beethoven', 'Bach', 'Chopin'], "Wolfgang Amadeus Mozart (1756-1791), compositeur de la période classique."],
      ["Quel compositeur a écrit la 9e symphonie, dont l'« Ode à la joie » est l'hymne européen ?", 'Beethoven', ['Mozart', 'Vivaldi', 'Haydn'], "Beethoven l'achève en 1824, alors qu'il est presque sourd."],
      ["Qu'est-ce qu'un opéra ?", 'une œuvre de théâtre entièrement chantée et accompagnée par un orchestre', ['un concert pour piano seul', 'une danse de cour', 'une chanson populaire'], "Exemples : Carmen (Bizet), La Traviata (Verdi)."],
      ["Qui a composé Les Quatre Saisons ?", 'Vivaldi', ['Bach', 'Mozart', 'Haendel'], "Antonio Vivaldi, compositeur baroque vénitien (1725)."],
      ["Qu'est-ce qu'un leitmotiv ?", 'un thème musical associé à un personnage ou une idée, qui revient', ['un instrument à vent', 'une note tenue', 'un chant sans paroles'], "Wagner l'utilise beaucoup ; le cinéma aussi (Star Wars)."],
      ["Que signifie « crescendo » ?", 'le son devient de plus en plus fort', ['le son devient de plus en plus faible', 'le tempo ralentit', 'on joue en détaché'], "Le contraire est le decrescendo (ou diminuendo)."],
      ["Qu'est-ce que le blues ?", 'un genre musical né chez les Afro-Américains du sud des États-Unis', ['une danse espagnole', 'un chant grégorien', 'une musique électronique'], "Il est à l'origine du jazz et du rock."],
      ["Quel compositeur polonais est célèbre pour ses œuvres pour piano (nocturnes, polonaises) ?", 'Chopin', ['Liszt', 'Schubert', 'Debussy'], "Frédéric Chopin (1810-1849), compositeur romantique."]
    ]),
    bank('Vocabulaire plastique', "Pense aux notions : cadrage, point de vue, matière, couleur.", [
      ["Qu'est-ce qu'une plongée en photographie ?", 'une prise de vue du dessus', ['une prise de vue du dessous', 'une vue de face', 'un très gros plan'], "La plongée écrase le sujet ; la contre-plongée (du dessous) le grandit."],
      ["Quelle est la couleur complémentaire du bleu ?", "l'orange", ['le vert', 'le violet', 'le noir'], "Complémentaires : bleu/orange, rouge/vert, jaune/violet. Juxtaposées, elles se renforcent."],
      ["Qu'est-ce qu'un ready-made (Marcel Duchamp) ?", "un objet manufacturé choisi et exposé comme œuvre d'art", ['une peinture rapide', 'une sculpture en bronze', 'un dessin préparatoire'], "Fontaine (1917) est un urinoir signé « R. Mutt »."],
      ["Qu'est-ce qu'un collage ?", 'une technique qui assemble des éléments collés sur un support', ['une peinture à l’eau', 'une sculpture taillée', 'un moulage'], "Pratiqué par Picasso et Braque dès 1912."],
      ["Que désigne le « hors-champ » ?", "ce qui existe mais n'est pas montré dans le cadre", ['le premier plan', 'le titre de l’œuvre', 'la signature'], "Le spectateur l'imagine : c'est un ressort du cinéma et de la photographie."],
      ["Qu'est-ce qu'une installation ?", "une œuvre en volume qui occupe et transforme un espace", ['un tableau accroché', 'une photographie', 'une partition'], "Le spectateur peut souvent circuler dedans."],
      ["Que signifie « monochrome » ?", "d'une seule couleur", ['très coloré', 'en noir et blanc obligatoirement', 'transparent'], "Yves Klein a peint des monochromes bleus (IKB)."],
      ["Qu'est-ce qu'un autoportrait ?", "le portrait d'un artiste par lui-même", ['le portrait d’un roi', 'une photo de groupe', 'un paysage'], "Van Gogh a réalisé plus de 35 autoportraits."]
    ]),
    bank('Arts du XXe siècle', "Situe l'œuvre parmi les grands mouvements : fauvisme, cubisme, surréalisme, pop art.", [
      ["Quel mouvement, avec Picasso et Braque, représente les objets sous plusieurs angles à la fois ?", 'le cubisme', ['le fauvisme', 'le surréalisme', 'le pop art'], "Les Demoiselles d'Avignon (1907) de Picasso annoncent le cubisme."],
      ["Quel mouvement utilise des couleurs pures et violentes (Matisse, Derain) ?", 'le fauvisme', ['le cubisme', 'le réalisme', 'l’impressionnisme'], "Au Salon de 1905, un critique compare ces peintres à des « fauves »."],
      ["Quel mouvement explore les rêves et l'inconscient (Dalí, Magritte) ?", 'le surréalisme', ['le pop art', 'le néoclassicisme', 'le baroque'], "La Persistance de la mémoire (1931) de Dalí montre des montres molles."],
      ["Quel artiste du pop art a reproduit des boîtes de soupe Campbell ?", 'Andy Warhol', ['Roy Lichtenstein', 'Keith Haring', 'Jackson Pollock'], "Le pop art (années 1960) s'inspire de la publicité et de la culture de masse."],
      ["Quel peintre a réalisé « Ceci n'est pas une pipe » (La Trahison des images) ?", 'René Magritte', ['Salvador Dalí', 'Henri Matisse', 'Joan Miró'], "Magritte rappelle qu'une image n'est pas l'objet réel."],
      ["Qu'est-ce que l'art abstrait ?", "un art qui ne représente pas le monde visible", ['un art qui copie la nature', 'la peinture de portraits', 'la sculpture antique'], "Kandinsky peint l'une des premières œuvres abstraites vers 1910."],
      ["Qu'est-ce que le street art ?", "un art réalisé dans l'espace public (murs, rues)", ['un art réservé aux musées', 'une technique de gravure', 'un style de musique'], "Exemples : Banksy, Invader, Miss.Tic."],
      ["Quelle technique Jackson Pollock utilise-t-il ?", 'le dripping (projection de peinture sur une toile au sol)', ['le pointillisme', 'la fresque', 'le collage'], "Il appartient à l'expressionnisme abstrait américain."]
    ])
  ],
  flashcards: cards('Arts 4e', [
    ['Néoclassicisme', 'Retour à l’Antiquité, lignes nettes (David).'],
    ['Romantisme', 'Émotion, nature, mouvement (Delacroix, Géricault).'],
    ['Réalisme', 'Vie quotidienne sans idéaliser (Courbet, Millet).'],
    ['Impressionnisme', 'Lumière, plein air, touche visible (Monet, Renoir).'],
    ['Période classique', 'Mozart, Haydn, début de Beethoven (XVIIIe s.).'],
    ['Opéra', 'Théâtre chanté avec orchestre.'],
    ['Leitmotiv', 'Thème musical récurrent associé à un personnage.'],
    ['Crescendo', 'Le son augmente progressivement.'],
    ['Plongée / contre-plongée', 'Vue du dessus / vue du dessous.'],
    ['Complémentaires', 'Bleu-orange, rouge-vert, jaune-violet.'],
    ['Ready-made', 'Objet manufacturé exposé comme œuvre (Duchamp).'],
    ['Hors-champ', 'Ce qui n’est pas montré dans le cadre.']
  ])
};

/* ======================================================================
 * 5. TROISIÈME (cycle 4 — préparation du DNB)
 * ==================================================================== */

// ---------- 3e · Français (épreuve écrite du DNB) ----------
const FR3 = {
  generators: [
    genConj(V_ALL, T_ALL, ['passe_simple', 'subjonctif', 'pqp']),
    genTenseId(V_ALL, T_ALL),
    genRewrite(['imparfait', 'futur', 'passe_simple', 'conditionnel', 'passe_compose', 'pqp']),
    genHomophones(HOMO_ALL),
    genAccordPP(['etre', 'avoir', 'que', 'pronom']),
    genNature(3),
    genFonction(3),
    genFigures(3),
    bank('Méthode du DNB', "Pense aux attentes de l'épreuve : justifier, citer, organiser.", [
      ["À l'épreuve de compréhension, que faut-il faire après chaque affirmation ?", "la justifier par une citation du texte entre guillemets", ['recopier la question', 'donner son avis personnel uniquement', 'résumer tout le texte'], "Une réponse sans citation ni explication perd des points : affirmation + citation + analyse."],
      ["Dans une réécriture, que faut-il vérifier en plus des verbes ?", 'tous les accords (sujets, adjectifs, participes) et les pronoms', ['seulement la ponctuation', 'le titre du texte', 'le nombre de lignes'], "Chaque transformation oubliée est pénalisée : souligne tous les mots à modifier avant d'écrire."],
      ["Que propose le sujet de rédaction au DNB ?", "un choix entre un sujet d'imagination et un sujet de réflexion", ['uniquement un résumé', 'une dictée', 'une traduction'], "Les deux sujets sont en lien avec le texte étudié."],
      ["Dans un sujet de réflexion, comment organiser son texte ?", "introduction, paragraphes argumentés avec exemples, conclusion", ['une seule longue phrase', 'une liste à puces', 'un dialogue'], "Chaque paragraphe : un argument + un exemple précis (lecture, film, histoire)."],
      ["Combien de temps dure l'épreuve écrite de français du DNB ?", '3 heures', ['1 heure', '2 heures', '4 heures'], "Elle comprend compréhension et compétences d'interprétation, dictée, réécriture et rédaction."],
      ["Qu'est-ce qu'un connecteur logique d'opposition ?", 'cependant', ['donc', 'parce que', 'ensuite'], "Opposition : mais, cependant, pourtant, néanmoins ; cause : car, parce que ; conséquence : donc, ainsi."],
      ["Quel est le point de vue du narrateur dans « Elle ignorait que son frère l'attendait derrière la porte » ?", 'omniscient', ['interne', 'externe', 'aucun'], "Le narrateur sait ce que le personnage ignore : il voit tout, c'est le point de vue omniscient."],
      ["Qu'est-ce qu'un texte autobiographique ?", "le récit qu'un auteur fait de sa propre vie", ['un roman de science-fiction', 'une biographie écrite par un autre', 'un poème épique'], "Le pacte autobiographique : auteur = narrateur = personnage principal (Rousseau, Sartre, Annie Ernaux)."]
    ]),
    bank('Genres et registres', "Identifie le genre, puis l'effet recherché sur le lecteur.", [
      ["Quel registre cherche à faire rire en exagérant les défauts d'une personne ou d'une société pour les critiquer ?", 'satirique', ['lyrique', 'tragique', 'épique'], "La satire critique en se moquant (Voltaire, Molière)."],
      ["Quel registre exprime les sentiments personnels, souvent en poésie ?", 'lyrique', ['comique', 'épique', 'didactique'], "Le lyrisme emploie la 1re personne et des émotions intenses."],
      ["Quel registre suscite la pitié du lecteur ?", 'pathétique', ['comique', 'fantastique', 'polémique'], "Le pathétique montre la souffrance pour émouvoir."],
      ["Qu'est-ce qu'un texte engagé ?", "un texte où l'auteur défend une cause ou dénonce une injustice", ['un texte qui raconte un voyage', 'un texte sans auteur', 'un texte uniquement descriptif'], "Exemples : Hugo contre la peine de mort, Zola dans l'affaire Dreyfus, Éluard sous l'Occupation."],
      ["Qui a écrit le poème « Liberté » (1942) ?", 'Paul Éluard', ['Victor Hugo', 'Louis Aragon', 'Arthur Rimbaud'], "Poème de la Résistance, parachuté à des milliers d'exemplaires par l'aviation alliée."],
      ["Quel genre théâtral met en scène des personnages nobles face à un destin fatal ?", 'la tragédie', ['la comédie', 'la farce', 'le vaudeville'], "Racine et Corneille au XVIIe siècle ; Antigone d'Anouilh au XXe siècle."],
      ["Qu'est-ce qu'une dystopie ?", 'le récit d’une société imaginaire inquiétante et oppressive', ['un récit de voyage réel', 'un conte pour enfants', 'une pièce comique'], "Exemples : 1984 (Orwell), Fahrenheit 451 (Bradbury)."],
      ["Qu'est-ce qu'une anaphore ?", "la répétition d'un mot ou d'une expression en début de vers ou de phrase", ['une exagération', 'une comparaison sans outil', 'une opposition de deux mots'], "« Sur mes cahiers d'écolier / Sur mon pupitre et les arbres… » (Éluard, « Liberté »)."]
    ])
  ],
  flashcards: cards('Français 3e', [
    ['Épreuve écrite DNB', '3 h : compréhension et interprétation, dictée, réécriture, rédaction (imagination ou réflexion).'],
    ['Répondre au DNB', 'Affirmation + citation entre guillemets + explication.'],
    ['Réécriture', 'Souligner tous les mots à transformer : verbes, pronoms, accords.'],
    ['Subjonctif présent', 'que je chante, que nous chantions ; être : que je sois ; avoir : que j’aie.'],
    ['Plus-que-parfait', 'Auxiliaire à l’imparfait + participe passé.'],
    ['Passé simple / imparfait', 'Actions de premier plan / description et habitudes.'],
    ['Points de vue', 'Interne (un personnage), externe (caméra), omniscient (sait tout).'],
    ['Autobiographie', 'Auteur = narrateur = personnage principal.'],
    ['Registre satirique', 'Critiquer en se moquant.'],
    ['Registre lyrique', 'Expression des sentiments personnels.'],
    ['Connecteurs', 'Cause : car ; conséquence : donc ; opposition : cependant ; concession : bien que.'],
    ['Littérature engagée', 'Défendre une cause : Hugo, Zola, Éluard, Aragon.']
  ])
};

// ---------- 3e · Histoire-Géographie-EMC ----------
const HG3 = {
  generators: [
    bank('Histoire : 1914-1945', "Situe l'événement entre la Première Guerre mondiale, l'entre-deux-guerres et la Seconde Guerre mondiale.", [
      ["Pourquoi qualifie-t-on la Première Guerre mondiale de « guerre totale » ?", "toutes les ressources (humaines, économiques, scientifiques) des pays sont mobilisées", ['elle a duré une semaine', 'un seul pays a combattu', 'elle n’a touché que les soldats'], "Les civils participent à l'effort de guerre : usines, emprunts, propagande."],
      ["Quelle bataille de 1916 symbolise la violence de masse sur le front français ?", 'Verdun', ['Waterloo', 'Stalingrad', 'Austerlitz'], "De février à décembre 1916 ; plus de 300 000 morts français et allemands."],
      ["Quand l'armistice de la Première Guerre mondiale est-il signé ?", '11 novembre 1918', ['8 mai 1945', '14 juillet 1919', '1er septembre 1939'], "Le traité de Versailles est signé le 28 juin 1919."],
      ["Quel régime Staline dirige-t-il en URSS ?", 'un régime totalitaire communiste', ['une démocratie parlementaire', 'une monarchie constitutionnelle', 'une république fédérale libérale'], "Parti unique, culte du chef, terreur (goulag), économie planifiée."],
      ["En quelle année Hitler devient-il chancelier en Allemagne ?", '1933', ['1918', '1929', '1939'], "Nommé le 30 janvier 1933, il installe rapidement un régime totalitaire nazi."],
      ["Qu'est-ce que le Front populaire (1936) ?", 'une coalition de gauche au pouvoir en France', ['un parti fasciste', 'une armée de résistants', 'une alliance militaire'], "Dirigé par Léon Blum : congés payés, semaine de 40 heures."],
      ["Quel événement déclenche la Seconde Guerre mondiale en Europe ?", "l'invasion de la Pologne par l'Allemagne (1er septembre 1939)", ['l’attaque de Pearl Harbor', 'l’assassinat de Sarajevo', 'le débarquement en Normandie'], "La France et le Royaume-Uni déclarent la guerre à l'Allemagne le 3 septembre."],
      ["Qui lance l'appel du 18 juin 1940 depuis Londres ?", 'le général de Gaulle', ['le maréchal Pétain', 'Jean Moulin', 'Georges Clemenceau'], "Il appelle les Français à continuer le combat : naissance de la France libre."],
      ["Quel régime s'installe à Vichy en 1940 ?", "l'État français du maréchal Pétain, qui collabore avec l'Allemagne", ['la IVe République', 'la France libre', 'le Front populaire'], "Il supprime la République et participe à la persécution des Juifs."],
      ["Qui a unifié les mouvements de la Résistance intérieure ?", 'Jean Moulin', ['Philippe Pétain', 'Pierre Laval', 'Léon Blum'], "Il crée le Conseil national de la Résistance en 1943."],
      ["Quand a lieu le débarquement allié en Normandie ?", '6 juin 1944', ['8 mai 1945', '18 juin 1940', '11 novembre 1918'], "Opération Overlord : la libération de la France commence."],
      ["Qu'est-ce que la Shoah ?", "l'extermination de près de six millions de Juifs d'Europe par les nazis", ['une bataille navale', 'un traité de paix', 'un mouvement de résistance'], "C'est un génocide, perpétré notamment dans les centres de mise à mort comme Auschwitz-Birkenau."]
    ]),
    bank('Histoire : le monde depuis 1945', "Situe l'événement : Guerre froide, décolonisation, construction européenne, Ve République.", [
      ["Qu'appelle-t-on la Guerre froide ?", "l'affrontement indirect entre les États-Unis et l'URSS (1947-1991)", ['une guerre en Antarctique', 'la guerre de 1914-1918', 'un conflit entre la France et l’Allemagne'], "Les deux superpuissances ne s'affrontent jamais directement mais par crises et conflits interposés."],
      ["Quel mur, symbole de la Guerre froide, tombe le 9 novembre 1989 ?", 'le mur de Berlin', ['la Grande Muraille', 'le mur d’Hadrien', 'le mur de l’Atlantique'], "Construit en 1961, sa chute annonce la réunification allemande (1990)."],
      ["En quelle année l'Algérie devient-elle indépendante ?", '1962', ['1945', '1954', '1958'], "Après une guerre commencée en 1954 ; accords d'Évian en mars 1962."],
      ["Quand la Ve République est-elle fondée ?", '1958', ['1946', '1945', '1968'], "Constitution approuvée par référendum ; de Gaulle est élu président."],
      ["En quelle année les femmes votent-elles pour la première fois en France ?", '1945', ['1918', '1936', '1968'], "Droit de vote accordé en 1944, exercé pour la première fois en 1945."],
      ["Quel traité fonde la Communauté économique européenne en 1957 ?", 'le traité de Rome', ['le traité de Versailles', 'le traité de Maastricht', 'le traité de Lisbonne'], "Six pays fondateurs, dont la France et l'Allemagne de l'Ouest."],
      ["Qui fait voter la loi abolissant la peine de mort en France (1981) ?", 'Robert Badinter', ['Simone Veil', 'Charles de Gaulle', 'Jacques Chirac'], "Garde des Sceaux de François Mitterrand."],
      ["Quand l'euro est-il mis en circulation sous forme de pièces et billets ?", '2002', ['1992', '1999', '2008'], "Il existe comme monnaie de compte depuis 1999."]
    ]),
    bank('Géographie : la France et l’Union européenne', "Pense aux aires urbaines, aux espaces productifs et à l'intégration européenne.", [
      ["Qu'est-ce qu'une aire d'attraction d'une ville ?", "un pôle urbain et les communes dont les habitants viennent y travailler", ['une zone uniquement rurale', 'un parc naturel', 'un quartier piéton'], "Plus de 90 % des Français vivent dans une aire d'attraction d'une ville."],
      ["Qu'est-ce que la périurbanisation ?", 'l’extension des villes vers les campagnes environnantes', ['la disparition des villes', 'la construction de gratte-ciel', 'le départ vers l’étranger'], "Elle s'accompagne de mobilités pendulaires en voiture."],
      ["Combien de pays compte l'Union européenne en 2026 ?", '27', ['12', '25', '28'], "Le Royaume-Uni l'a quittée en 2020 (Brexit)."],
      ["Qu'est-ce qu'un espace productif ?", 'un espace aménagé pour produire des richesses', ['une zone sans habitants', 'un monument historique', 'une frontière'], "Agricole, industriel, touristique ou tertiaire."],
      ["Qu'est-ce que l'espace Schengen ?", 'un espace de libre circulation des personnes sans contrôle aux frontières intérieures', ['une zone militaire', 'la zone euro', 'un accord commercial avec la Chine'], "Il ne correspond pas exactement à l'UE (la Suisse en fait partie)."],
      ["Que sont les DROM ?", "les départements et régions d'outre-mer", ['les douanes françaises', 'des régions de l’Hexagone', 'des pays étrangers'], "Guadeloupe, Martinique, Guyane, La Réunion, Mayotte."],
      ["Quelle est la ville la plus peuplée de France ?", 'Paris', ['Lyon', 'Marseille', 'Lille'], "L'aire parisienne compte plus de 13 millions d'habitants."],
      ["Qu'est-ce qu'une métropole ?", 'une grande ville qui concentre population, activités et fonctions de commandement', ['un petit village', 'une zone agricole', 'un département d’outre-mer'], "Elle rayonne sur un vaste territoire."]
    ]),
    bank('EMC', "Pense aux valeurs de la République, aux droits et aux devoirs du citoyen.", [
      ["Quelle est la devise de la République française ?", 'Liberté, Égalité, Fraternité', ['Travail, Famille, Patrie', 'Paix, Justice, Progrès', 'Unité, Force, Honneur'], "« Travail, Famille, Patrie » était la devise du régime de Vichy."],
      ["Qu'est-ce que la laïcité ?", "la séparation des Églises et de l'État, qui garantit la liberté de conscience", ['l’interdiction de toutes les religions', 'une religion officielle', 'l’obligation de croire'], "Fixée par la loi de 1905."],
      ["À quel âge peut-on voter en France ?", '18 ans', ['16 ans', '21 ans', '15 ans'], "Majorité électorale abaissée de 21 à 18 ans en 1974."],
      ["Qu'est-ce que la JDC ?", 'la Journée défense et citoyenneté, obligatoire pour les jeunes', ['un examen de collège', 'un diplôme sportif', 'une fête nationale'], "Le recensement se fait à 16 ans en mairie."],
      ["Qui vote les lois en France ?", 'le Parlement (Assemblée nationale et Sénat)', ['le président seul', 'les maires', 'le Conseil constitutionnel'], "Le gouvernement propose, le Parlement vote, le président promulgue."],
      ["Pour combien de temps le président de la République est-il élu ?", '5 ans', ['4 ans', '7 ans', '6 ans'], "Quinquennat depuis 2002 (septennat auparavant)."],
      ["Qu'est-ce que la présomption d'innocence ?", 'toute personne est innocente tant que sa culpabilité n’est pas prouvée', ['les suspects sont toujours coupables', 'le juge décide sans preuve', 'les mineurs ne peuvent pas être jugés'], "Principe de la DDHC (article 9)."],
      ["Qu'est-ce que l'engagement citoyen ?", "participer à la vie collective (vote, associations, bénévolat)", ['ne jamais voter', 'payer uniquement ses impôts', 'faire partie de l’armée obligatoirement'], "Exemples : délégué de classe, service civique, réserve."]
    ]),
    chrono('Repères chronologiques 3e', [
      ['Première Guerre mondiale', '1914-1918', 'Guerre totale ; armistice le 11 novembre 1918.'],
      ['Révolution russe', '1917', 'Les bolcheviks de Lénine prennent le pouvoir.'],
      ['Arrivée de Hitler au pouvoir', '1933', 'Mise en place d’un régime totalitaire.'],
      ['Front populaire', '1936', 'Congés payés, semaine de 40 heures.'],
      ['Seconde Guerre mondiale', '1939-1945', 'Fin en Europe le 8 mai 1945.'],
      ['Appel du général de Gaulle', '18 juin 1940', 'Naissance de la France libre.'],
      ['Débarquement en Normandie', '6 juin 1944', 'Début de la libération de la France.'],
      ['Fondation de la Ve République', '1958', 'Nouvelle Constitution, de Gaulle président.'],
      ['Indépendance de l’Algérie', '1962', 'Accords d’Évian.'],
      ['Chute du mur de Berlin', '1989', 'Fin de la Guerre froide en Europe.'],
      ['Traité de Maastricht', '1992', 'Naissance de l’Union européenne.']
    ])
  ],
  flashcards: cards('Histoire-Géo-EMC 3e', [
    ['1914-1918', 'Première Guerre mondiale, guerre totale ; Verdun (1916).'],
    ['Régime totalitaire', 'Parti unique, culte du chef, propagande, terreur (URSS de Staline, Allemagne nazie).'],
    ['1939-1945', 'Seconde Guerre mondiale, guerre d’anéantissement.'],
    ['Génocide', 'Extermination planifiée d’un peuple : Shoah, génocide des Tutsi, des Arméniens.'],
    ['Collaboration / Résistance', 'Vichy coopère avec l’occupant ; la Résistance le combat (Jean Moulin, CNR).'],
    ['Guerre froide', '1947-1991, affrontement indirect États-Unis / URSS.'],
    ['Décolonisation', 'Indépendance des colonies ; Inde (1947), Algérie (1962).'],
    ['1958', 'Ve République.'],
    ['Aire d’attraction', 'Pôle urbain + couronne d’où les habitants viennent travailler.'],
    ['Union européenne', '27 pays ; euro (2002) ; Schengen.'],
    ['Laïcité', 'Loi de 1905 : séparation des Églises et de l’État.'],
    ['Citoyenneté', 'Vote à 18 ans, recensement à 16 ans, JDC.']
  ])
};

// ---------- 3e · Langues (LV1 & LV2, A2 → B1) ----------
const LANGUES3 = {
  generators: [
    genIrregular(IRREG.length),
    genPresentPerfect(),
    genEsPreterito(),
    genEsPresent(['ser', 'estar', 'tener', 'ir', 'hacer']),
    bank('Anglais B1', "Repère le temps, la structure et le sens global de la phrase.", [
      ["🇬🇧 « If I ___ rich, I would travel around the world. »", 'were', ['am', 'will be', 'have been'], "Condition irréelle : if + prétérit (were pour toutes les personnes à l'écrit soutenu), would + base."],
      ["🇬🇧 « I'm used to ___ up early. »", 'getting', ['get', 'got', 'gets'], "be used to + V-ing = être habitué à."],
      ["🇬🇧 « She asked me where I ___. »", 'lived', ['live', 'do live', 'am living'], "Au discours indirect, le temps recule : « Where do you live? » → she asked me where I lived."],
      ["🇬🇧 « I wish I ___ speak Chinese. »", 'could', ['can', 'will', 'should'], "I wish + prétérit modal : regret sur le présent."],
      ["🇬🇧 « He had already left when I ___. »", 'arrived', ['arrive', 'had arrived', 'was arriving'], "Past perfect (had left) = antériorité par rapport à une autre action passée (arrived)."],
      ["🇬🇧 Que signifie « I'd rather stay home » ?", 'Je préfèrerais rester à la maison.', ['Je dois rester à la maison.', 'Je suis resté à la maison.', 'Je ne peux pas rester.'], "I'd rather + base verbale = je préfèrerais."],
      ["🇬🇧 Que signifie « It's worth visiting » ?", 'Ça vaut la peine de le visiter.', ['Ça coûte cher à visiter.', 'Il est interdit de visiter.', 'La visite est terminée.'], "be worth + V-ing = valoir la peine de."],
      ["🇬🇧 « Social networks can be addictive. » Que signifie addictive ?", 'qui crée une dépendance', ['qui ajoute', 'gratuit', 'ennuyeux'], "Thème fréquent au DNB : les écrans, les réseaux sociaux, l'environnement."]
    ]),
    bank('Espagnol, allemand et italien A2', "Repère la langue grâce au drapeau, puis le temps et la personne.", [
      ["🇪🇸 Espagnol : « Cuando era pequeño, ___ en Sevilla. » (vivir)", 'vivía', ['viví', 'vivo', 'viviré'], "Habitude ou description dans le passé → imperfecto : vivía."],
      ["🇪🇸 Espagnol : « Mañana ___ a la playa. » (ir, nosotros, futur proche)", 'vamos a ir', ['fuimos', 'íbamos', 'hemos ido'], "Futur proche : ir a + infinitif."],
      ["🇪🇸 Espagnol : « He terminado mis deberes » signifie…", "J'ai terminé mes devoirs.", ['Je termine mes devoirs.', 'Il a terminé ses devoirs.', 'Je terminerai mes devoirs.'], "Pretérito perfecto : haber (he, has, ha…) + participe en -ado/-ido."],
      ["🇪🇸 Espagnol : traduis « Ojalá » + subjonctif.", "Pourvu que…", ['Parce que…', 'Bien que…', 'Avant que…'], "Ojalá haga buen tiempo = pourvu qu'il fasse beau."],
      ["🇩🇪 Allemand : « Ich weiß, dass er morgen ___. » (kommen)", 'kommt', ['kommen', 'kam', 'komme'], "Dans une subordonnée avec dass, le verbe conjugué se place à la fin : dass er morgen kommt."],
      ["🇩🇪 Allemand : comment forme-t-on le parfait de « spielen » avec « ich » ?", 'ich habe gespielt', ['ich bin gespielt', 'ich spielte habe', 'ich habe spielen'], "haben/sein + participe passé (ge- … -t pour les verbes faibles) en fin de phrase."],
      ["🇮🇹 Italien : « Ieri ___ al mare. » (andare, io)", 'sono andato', ['ho andato', 'vado', 'andrò'], "andare se conjugue avec essere au passato prossimo ; le participe s'accorde (sono andata au féminin)."],
      ["🇮🇹 Italien : que signifie « Mi piace la pizza » ?", "J'aime la pizza.", ['Je fais une pizza.', 'Je déteste la pizza.', 'Je voudrais une pizza.'], "piacere fonctionne comme gustar : mi piace + singulier, mi piacciono + pluriel."]
    ])
  ],
  flashcards: cards('Langues 3e', [
    ['🇬🇧 Conditionnel irréel', 'If + prétérit, would + base : If I were you, I would…'],
    ['🇬🇧 Past perfect', 'had + participe passé : antériorité dans le passé.'],
    ['🇬🇧 Discours indirect', 'Recul des temps : present → past ; will → would.'],
    ['🇬🇧 be used to + V-ing', 'Être habitué à.'],
    ['🇬🇧 Present perfect + for/since', 'I have known him for years / since 2020.'],
    ['🇪🇸 Imperfecto', '-aba (ar), -ía (er/ir) : description, habitude passée.'],
    ['🇪🇸 Pretérito perfecto', 'he, has, ha, hemos, habéis, han + -ado/-ido.'],
    ['🇪🇸 Futur proche', 'ir a + infinitif : voy a estudiar.'],
    ['🇩🇪 Subordonnée', 'Verbe conjugué en fin de proposition (dass, weil, wenn).'],
    ['🇩🇪 Parfait', 'haben/sein + participe passé en fin de phrase.'],
    ['🇮🇹 Passato prossimo', 'avere/essere + participe ; accord avec essere.'],
    ['Niveaux du CECRL', 'A1-A2 : élémentaire ; B1 : seuil (objectif fin de 3e en LV1).']
  ])
};

// ---------- 3e · Épreuve orale du Brevet ----------
const ORAL3 = {
  generators: [
    bank('Organisation de l’oral', "Rappelle-toi le déroulé officiel de l'épreuve.", [
      ["Combien de points compte l'épreuve orale du Brevet dans ce simulateur 2026 ?", '100 points', ['50 points', '20 points', '200 points'], "Elle pèse autant qu'une épreuve écrite : la préparer sérieusement rapporte beaucoup."],
      ["Combien de temps dure l'épreuve orale individuelle ?", '15 minutes (5 min d’exposé + 10 min d’entretien)', ['5 minutes au total', '30 minutes', '1 heure'], "En groupe, l'exposé dure 10 minutes et l'entretien 15 minutes."],
      ["Sur quoi peut porter l'oral du Brevet ?", "un projet mené en EPI, en histoire des arts ou dans un parcours éducatif", ['uniquement un livre lu', 'un sujet tiré au sort', 'un exercice de maths'], "Parcours : Avenir, citoyen, d'éducation artistique et culturelle, éducatif de santé."],
      ["Peut-on passer l'oral en partie dans une langue étrangère ?", 'oui, si on l’a étudiée', ['non, jamais', 'seulement en latin', 'seulement en anglais obligatoirement'], "Une partie de l'exposé peut être faite en langue vivante étudiée."],
      ["Qui compose le jury de l'oral ?", 'au moins deux professeurs', ['les parents d’élèves', 'un seul élève', 'le principal uniquement'], "Le jury évalue l'expression orale et la maîtrise du sujet."],
      ["L'oral peut-il se passer à plusieurs ?", "oui, jusqu'à trois candidats, chacun étant noté individuellement", ['non, toujours seul', 'oui, par classe entière', 'oui, avec ses parents'], "Chaque candidat doit prendre la parole et répondre aux questions."],
      ["Quand a lieu l'épreuve orale ?", 'en général entre avril et juin, avant les écrits', ['en septembre', 'pendant les vacances d’été', 'le jour de la rentrée'], "La date est fixée par chaque établissement."],
      ["Quels documents peut-on apporter ?", "un support (diaporama, objet, réalisation) pour appuyer l'exposé", ['un texte à lire mot à mot', 'son téléphone pour chercher des réponses', 'rien du tout, jamais'], "Le support illustre ; il ne doit pas être lu."]
    ]),
    bank('Critères d’évaluation', "Pense à ce que le jury observe : expression et maîtrise du sujet.", [
      ["Sur quoi porte la moitié de la note de l'oral ?", "la maîtrise de l'expression orale", ['la beauté du diaporama', 'la longueur du dossier écrit', 'la tenue vestimentaire'], "L'autre moitié évalue la maîtrise du sujet présenté."],
      ["Que vaut-il mieux faire pendant l'exposé ?", 'parler en regardant le jury, à partir de notes courtes', ['lire entièrement sa feuille', 'tourner le dos au jury', 'parler très vite pour finir tôt'], "Des mots-clés suffisent : le jury valorise un discours vivant."],
      ["Que faire si l'on ne connaît pas la réponse à une question ?", "le dire honnêtement et proposer une piste de réflexion", ['inventer une réponse', 'rester silencieux', 'changer de sujet'], "Le jury apprécie l'honnêteté et la capacité à raisonner."],
      ["Quel registre de langue employer ?", 'un registre courant ou soutenu', ['un registre familier', 'le langage SMS', 'des abréviations'], "Évite « genre », « en mode », « du coup » à répétition."],
      ["Qu'attend le jury pendant l'entretien ?", "que tu justifies tes choix et ce que le projet t'a appris", ['que tu répètes ton exposé', 'que tu poses des questions au jury', 'que tu récites une leçon'], "Montre ta démarche, tes difficultés et comment tu les as surmontées."],
      ["Quel plan simple convient à un exposé de 5 minutes ?", 'introduction, deux ou trois parties, conclusion avec un bilan personnel', ['une seule partie sans fin', 'uniquement des questions', 'une liste de dates'], "Annonce ton plan dès l'introduction."],
      ["Comment gérer le stress avant l'oral ?", "s'entraîner à voix haute et chronométrer son exposé", ['ne rien préparer', 'apprendre son texte par cœur au mot près', 'arriver en retard'], "Respirer lentement avant d'entrer aide aussi."],
      ["Pourquoi chronométrer son exposé ?", 'pour respecter les 5 minutes sans être coupé ni trop court', ['pour finir le plus vite possible', 'c’est inutile', 'pour impressionner le jury'], "Un exposé trop court ou trop long fait perdre des points."]
    ]),
    bank('Parcours éducatifs', "Associe chaque parcours à son thème.", [
      ["Quel parcours concerne l'orientation et la découverte des métiers ?", 'le parcours Avenir', ['le parcours citoyen', 'le parcours éducatif de santé', 'le PEAC'], "Exemple : présenter son stage d'observation de 3e."],
      ["Quel parcours concerne les valeurs de la République et l'engagement ?", 'le parcours citoyen', ['le parcours Avenir', 'le PEAC', 'le parcours éducatif de santé'], "Exemple : une action de solidarité ou le rôle de délégué."],
      ["Que signifie PEAC ?", "parcours d'éducation artistique et culturelle", ['programme d’études avancées en commerce', 'projet d’éducation à la citoyenneté', 'parcours d’entraînement aux concours'], "Exemple : une sortie au musée, une pratique théâtrale."],
      ["Quel parcours concerne le bien-être, l'alimentation et la prévention ?", 'le parcours éducatif de santé', ['le parcours Avenir', 'le parcours citoyen', 'le PEAC'], "Exemple : un projet sur le sommeil ou les écrans."],
      ["Que signifie EPI ?", 'enseignement pratique interdisciplinaire', ['épreuve pratique individuelle', 'examen préparatoire international', 'éducation physique intensive'], "Un projet croisant plusieurs matières."],
      ["Qu'est-ce que l'histoire des arts à l'oral ?", 'l’analyse d’une ou plusieurs œuvres en lien avec leur contexte', ['un dessin réalisé devant le jury', 'une chanson à interpréter', 'une dictée'], "Présentation, description, analyse, interprétation, avis argumenté."],
      ["Pour présenter son stage d'observation, que faut-il mettre en avant ?", 'ce que l’on a découvert du métier et ce que cela change pour son orientation', ['le nom de tous les employés', 'les horaires de la cantine', 'uniquement les points négatifs'], "Le jury attend un regard personnel et réfléchi."],
      ["Une œuvre étudiée en histoire des arts doit être présentée avec…", 'son titre, son auteur, sa date et son contexte', ['seulement son prix', 'uniquement son titre', 'aucune information'], "Ces repères montrent que tu maîtrises le sujet."]
    ]),
    bank('S’exprimer avec aisance', "Pense aux connecteurs, à la voix et à la posture.", [
      ["Quel connecteur introduit une conclusion ?", 'pour conclure', ['tout d’abord', 'par exemple', 'cependant'], "Tout d'abord ouvre, par exemple illustre, cependant oppose."],
      ["Comment capter l'attention du jury dès le début ?", 'avec une accroche : question, chiffre frappant ou anecdote', ['en s’excusant d’être là', 'en lisant le titre lentement', 'en parlant de la météo'], "Puis présente ton sujet et ton plan."],
      ["Quelle posture adopter ?", 'debout ou assis droit, regard vers le jury, gestes mesurés', ['les mains dans les poches', 'les yeux fixés sur le sol', 'se balancer en permanence'], "La posture participe à l'expression orale."],
      ["Comment éviter les « euh » ?", "faire de courtes pauses silencieuses pour réfléchir", ['parler sans respirer', 'répéter la question', 'rire'], "Une pause paraît naturelle et donne de l'assurance."],
      ["Quel est le rôle de la conclusion de l'exposé ?", 'faire le bilan et dire ce que le projet t’a apporté', ['ajouter une nouvelle partie', 'remercier ses parents', 'répéter l’introduction mot pour mot'], "Une ouverture peut lancer l'entretien."],
      ["Comment répondre à une question difficile ?", 'reformuler la question, prendre un temps, puis répondre', ['répondre immédiatement n’importe quoi', 'ignorer la question', 'contester la question'], "Reformuler montre que tu as compris et te laisse le temps de réfléchir."]
    ])
  ],
  flashcards: cards('Oral du DNB', [
    ['Durée (seul)', '15 min : 5 min d’exposé + 10 min d’entretien.'],
    ['Durée (groupe)', '25 min : 10 min d’exposé + 15 min d’entretien.'],
    ['Sujets possibles', 'EPI, histoire des arts, parcours Avenir, citoyen, PEAC, santé.'],
    ['Notation', 'Moitié expression orale, moitié maîtrise du sujet.'],
    ['Support', 'Diaporama, objet, réalisation : il illustre, il ne se lit pas.'],
    ['Plan', 'Accroche, plan annoncé, 2-3 parties, conclusion personnelle.'],
    ['Langue étrangère', 'Une partie de l’exposé peut être faite en LV.'],
    ['Entretien', 'Justifier ses choix, expliquer sa démarche et ce qu’on a appris.'],
    ['Registre', 'Courant ou soutenu, phrases complètes.'],
    ['Préparation', 's’entraîner à voix haute, se chronométrer, préparer des questions possibles.']
  ])
};

/* ======================================================================
 * EXPORT
 * ==================================================================== */

export const LETTRES_LANGUES = {
  '6eme': { francais: FR6, histgeo: HG6, lv1: EN6, arts: ARTS6, eps: EPS6 },
  '5eme': { francais: FR5, histgeo: HG5, lv1: EN5, lv2: LV2_5, arts: ARTS5 },
  '4eme': { francais: FR4, histgeo: HG4, lv1: EN4, lv2: LV2_4, arts: ARTS4 },
  '3eme': { francais: FR3, histgeo: HG3, langues: LANGUES3, oral: ORAL3 }
};
