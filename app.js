import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  getProprietaire, updateProprietaire,
  listColocataires, getColocataire, findColocataire,
  createColocataire, updateColocataire, patchColocataire, deleteColocataire,
  listDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  listBiens, getBien, createBien, updateBien, deleteBien, listColocatairesParBien
} from './src/db.js';
import { analyser } from './src/nlp.js';
import { buildDefaultData, nomFichier, attestationTexte, quittanceTexte, factureTexte, formatDateFR, formatDuree } from './src/templates.js';
import { sommeItems, CATALOGUE_IMMOBILIER, CATALOGUE_MOBILIER } from './src/items-catalogue.js';
import { generatePdf } from './src/pdf.js';
import { isEmailConfigured, sendDocument, sendMail, resetTransporter, verifyConnection } from './src/email.js';
import { readEnv, writeEnv } from './src/env-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env chargement minimal (sans dotenv pour éviter une dépendance) — on tente, sinon on l'ignore
try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optionnel */ }

const DATA_DIR = process.env.DATA_DIR
  ? (process.env.DATA_DIR.startsWith('/') ? process.env.DATA_DIR : join(__dirname, process.env.DATA_DIR))
  : join(__dirname, 'data');
mkdirSync(join(DATA_DIR, 'pdfs'), { recursive: true });
mkdirSync(join(__dirname, 'public'), { recursive: true });

const app = express();
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

// Healthcheck public (pas d'auth requise) pour le monitoring Fly.io — AVANT l'auth
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// Fichiers PWA publics (icônes + manifeste) — AVANT l'auth pour qu'iOS/Android puissent les lire
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').sendFile(join(__dirname, 'public', 'manifest.webmanifest'));
});
app.get('/icons/:name', (req, res) => {
  const safeName = req.params.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
  res.sendFile(join(__dirname, 'public', safeName));
});
app.get('/apple-touch-icon.png', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'apple-touch-icon.png'));
});
app.get('/apple-touch-icon-precomposed.png', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'apple-touch-icon.png'));
});

// --- Authentification HTTP Basic (active uniquement si AUTH_USER+AUTH_PASS sont définis) ---
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
if (AUTH_USER && AUTH_PASS) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (user === AUTH_USER && pass === AUTH_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Gestion locative", charset="UTF-8"');
    return res.status(401).send('Authentification requise');
  });
  console.log('🔒 Authentification HTTP Basic activée');
} else {
  console.warn('⚠️  AUTH_USER/AUTH_PASS non définis — application ouverte sans mot de passe');
}

app.use('/public', express.static(join(__dirname, 'public')));

// Petit helper pour les vues
app.use((req, res, next) => {
  res.locals.emailConfigured = isEmailConfigured();
  res.locals.proprietaire = getProprietaire();
  // Mode développement : l'app est publique (pas d'AUTH_USER/AUTH_PASS).
  // Un bandeau rouge d'alerte s'affiche sur toutes les pages pour éviter l'oubli.
  res.locals.devMode = !(process.env.AUTH_USER && process.env.AUTH_PASS);
  next();
});

// --- Pages ----------------------------------------------------------------

// ─── Page d'accueil — vitrine éditoriale du cabinet ─────────────────────
app.get('/', (req, res) => {
  const colocs = listColocataires().filter(c => c.actif);
  const docs = listDocuments();
  const lastDoc = docs[0] || null;
  // dernier document par colocataire (pour les cartes)
  const lastByColoc = new Map();
  for (const d of docs) {
    if (d.colocataire_id && !lastByColoc.has(d.colocataire_id)) lastByColoc.set(d.colocataire_id, d);
  }
  // Date du jour en format français
  const moisFR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const now = new Date();
  const dateFR = `${now.getDate()} ${moisFR[now.getMonth()]} ${now.getFullYear()}`;
  // Salutation selon l'heure : matin < 12h · après-midi 12-18h · soir >= 18h
  const heure = now.getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
  res.render('accueil', {
    title: 'Accueil',
    activeNav: 'accueil',
    hideTopbar: true,
    colocataires: colocs,
    lastDoc,
    lastByColoc,
    dateFR,
    salutation,
    stats: {
      colocActifs: colocs.length,
      docsTotal: docs.length,
      brouillons: docs.filter(d => d.statut === 'brouillon').length,
      envoyes: docs.filter(d => d.statut === 'envoye').length
    }
  });
});

// ─── Tableau de bord (ex-vue d'ensemble) ────────────────────────────────
app.get('/tableau', (req, res) => {
  const colocs = listColocataires();
  const docs = listDocuments();
  const stats = {
    colocActifs: colocs.filter(c => c.actif).length,
    docsTotal: docs.length,
    brouillons: docs.filter(d => d.statut === 'brouillon').length,
    envoyes: docs.filter(d => d.statut === 'envoye').length
  };
  res.render('dashboard', {
    title: 'Tableau de bord',
    pageTitle: 'Tableau de bord',
    eyebrow: 'Vue d\'ensemble',
    pageSubtitle: 'Aperçu des colocataires actifs, des documents en cours et de l\'activité récente.',
    activeNav: 'tableau',
    colocataires: colocs,
    recents: docs.slice(0, 8),
    stats
  });
});

app.get('/colocataires', (req, res) => {
  const colocs = listColocataires().map(c => ({
    ...c,
    duree: formatDuree(c.date_entree),
    dateEntreeFR: formatDateFR(c.date_entree)
  }));
  res.render('colocataires', {
    title: 'Colocataires',
    pageTitle: 'Colocataires',
    eyebrow: 'Fiches permanentes',
    pageSubtitle: 'Civilité, dates de naissance et coordonnées — saisies une seule fois, réutilisées sur tous les documents.',
    activeNav: 'colocataires',
    colocataires: colocs,
    biens: listBiens({ actifSeulement: true })
  });
});

app.post('/colocataires', (req, res) => {
  createColocataire(req.body);
  res.redirect('/colocataires');
});

app.post('/colocataires/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.body._action === 'delete') {
    deleteColocataire(id);
  } else {
    updateColocataire(id, { ...req.body, actif: req.body.actif === 'on' || req.body.actif === '1' });
  }
  res.redirect('/colocataires');
});

app.get('/historique', (req, res) => {
  const { q, type, statut } = req.query;
  const docs = listDocuments({ q, type, statut });
  const colocs = listColocataires();
  const colocById = new Map(colocs.map(c => [c.id, c]));

  // Enrichit chaque document avec les canaux disponibles + date FR
  const documents = docs.map(d => {
    const c = colocById.get(d.colocataire_id);
    return {
      ...d,
      hasEmail: !!(c?.email || d.email_destinataire),
      hasPhone: !!(c?.telephone),
      creeLeFR: formatDateFR(String(d.cree_le || '').slice(0, 10)) || d.cree_le,
      periodeDebutFR: d.periode_debut ? formatDateFR(d.periode_debut) : '',
      periodeFinFR: d.periode_fin ? formatDateFR(d.periode_fin) : ''
    };
  });

  // Regroupe par colocataire pour l'affichage (Nicolas · 3 docs / Luesta · 2 docs…)
  const groupesMap = new Map();
  for (const d of documents) {
    const key = d.colocataire_id || 0;
    if (!groupesMap.has(key)) {
      const c = colocById.get(d.colocataire_id);
      groupesMap.set(key, {
        colocataire_id: key,
        nom: c ? `${c.prenom} ${c.nom}` : (d.coloc_prenom ? `${d.coloc_prenom} ${d.coloc_nom || ''}`.trim() : '— Sans destinataire —'),
        prenom: c?.prenom || d.coloc_prenom || '',
        civilite: c?.civilite || '',
        email: c?.email || null,
        telephone: c?.telephone || null,
        actif: c?.actif ?? 1,
        docs: []
      });
    }
    groupesMap.get(key).docs.push(d);
  }
  const groupes = Array.from(groupesMap.values()).sort((a, b) => {
    // Ordre : actifs (par nom), puis anciens, puis sans destinataire
    if ((a.colocataire_id === 0) !== (b.colocataire_id === 0)) return a.colocataire_id === 0 ? 1 : -1;
    if (a.actif !== b.actif) return b.actif - a.actif;
    return a.nom.localeCompare(b.nom, 'fr');
  });

  res.render('historique', {
    title: 'Documents',
    pageTitle: 'Archives',
    eyebrow: 'Tous les documents émis',
    pageSubtitle: 'Brouillons, documents générés et courriers transmis — recherche et filtrage instantanés.',
    activeNav: 'historique',
    documents,
    groupes,
    filters: { q: q || '', type: type || '', statut: statut || '' }
  });
});

// --- Recherche globale (JSON pour autocomplete) ---------------------------
app.get('/api/recherche', (req, res) => {
  const q = String(req.query.q || '').trim();
  const filtre = String(req.query.filtre || 'tous');
  const out = { colocataires: [], anciens: [], documents: [], brouillons: [], envoyes: [] };
  if (!q) return res.json(out);

  if (['tous', 'colocataires', 'anciens'].includes(filtre)) {
    const matches = findColocataire(q);
    out.colocataires = matches.filter(c => c.actif);
    out.anciens = matches.filter(c => !c.actif);
  }
  if (['tous', 'documents', 'brouillons', 'envoyes'].includes(filtre)) {
    const docs = listDocuments({ q });
    out.documents = docs;
    out.brouillons = docs.filter(d => d.statut === 'brouillon');
    out.envoyes = docs.filter(d => d.statut === 'envoye');
  }
  res.json(out);
});

// --- Parser NL : crée un brouillon à partir d'une demande libre -----------
app.post('/api/nl', (req, res) => {
  const { message } = req.body;
  const parsed = analyser(message);
  if (!parsed.type) {
    return res.json({
      ok: false,
      raison: 'Type non identifié',
      indices: 'Précisez : attestation de domiciliation, quittance de loyer, ou facture.',
      analyse: parsed
    });
  }
  if (!parsed.colocataire) {
    return res.json({
      ok: false,
      raison: 'Colocataire non identifié',
      indices: 'Nom du colocataire requis.',
      analyse: parsed,
      colocataires: listColocataires()
    });
  }
  const prop = getProprietaire();
  const bien = getBien(parsed.colocataire.bien_id);
  const data = buildDefaultData({
    type: parsed.type,
    colocataire: parsed.colocataire,
    proprietaire: prop,
    bien,
    hints: parsed.hints
  });
  const id = createDocument({
    type: parsed.type,
    colocataire_id: parsed.colocataire.id,
    statut: 'brouillon',
    data,
    periode_debut: data.periode_debut,
    periode_fin: data.periode_fin,
    date_emission: data.date_emission,
    montant_total: data.montant_total,
    email_destinataire: parsed.colocataire.email || null
  });
  res.json({ ok: true, document_id: id });
});

// Création directe (formulaire dashboard)
app.post('/documents/nouveau', (req, res) => {
  const { type, colocataire_id } = req.body;
  const coloc = getColocataire(parseInt(colocataire_id, 10));
  if (!coloc) return res.status(400).send('Colocataire introuvable');
  const prop = getProprietaire();
  const bien = getBien(coloc.bien_id);
  const data = buildDefaultData({ type, colocataire: coloc, proprietaire: prop, bien });
  const id = createDocument({
    type,
    colocataire_id: coloc.id,
    statut: 'brouillon',
    data,
    periode_debut: data.periode_debut,
    periode_fin: data.periode_fin,
    date_emission: data.date_emission,
    montant_total: data.montant_total,
    email_destinataire: coloc.email || null
  });
  res.redirect(`/documents/${id}/editer`);
});

// --- Éditeur de document --------------------------------------------------
app.get('/documents/:id/editer', (req, res) => {
  const doc = getDocument(parseInt(req.params.id, 10));
  if (!doc) return res.status(404).send('Document introuvable');
  const typeLabel = doc.type === 'attestation' ? 'Attestation de domiciliation'
                  : doc.type === 'quittance'   ? 'Quittance de loyer'
                  : 'Facture / reçu';
  res.render('editeur', {
    title: 'Éditer',
    pageTitle: typeLabel,
    eyebrow: `Document n° ${String(doc.id).padStart(4,'0')} · ${doc.statut}`,
    pageSubtitle: doc.data.coloc_prenom ? `Pour ${doc.data.coloc_prenom} ${doc.data.coloc_nom}` : '',
    activeNav: 'historique',
    doc,
    catalogueImmobilier: CATALOGUE_IMMOBILIER,
    catalogueMobilier: CATALOGUE_MOBILIER
  });
});

// Live preview (renvoie un PDF inline)
app.post('/documents/:id/apercu', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).send('Document introuvable');
  const data = { ...cur.data, ...(req.body || {}) };
  // Désérialise les items s'ils arrivent en JSON depuis le formulaire
  if (typeof data.items === 'string') {
    try { data.items = JSON.parse(data.items); } catch { data.items = []; }
  }
  // Total : pour la facture, somme des items ; sinon loyer + charges
  if (cur.type === 'facture') {
    data.montant_total = sommeItems(data.items);
  } else if (cur.type === 'quittance') {
    data.montant_total = Number(data.loyer || 0) + Number(data.charges || 0);
  }
  // Si le texte n'a pas été modifié manuellement, on le régénère
  if (data._regen_texte === '1' || data._regen_texte === 1) {
    if (cur.type === 'attestation') data.texte = attestationTexte(data);
    if (cur.type === 'quittance') data.texte = quittanceTexte(data);
    if (cur.type === 'facture') data.texte = factureTexte(data);
  }
  const buf = await generatePdf({ type: cur.type, data });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="apercu-${id}.pdf"`);
  res.send(buf);
});

// Enregistrement brouillon — propage civilité/date_naissance/email vers la fiche colocataire
app.post('/documents/:id/brouillon', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).json({ ok: false });
  const data = { ...cur.data, ...(req.body || {}) };
  if (typeof data.items === 'string') {
    try { data.items = JSON.parse(data.items); } catch { data.items = []; }
  }
  if (cur.type === 'facture') data.montant_total = sommeItems(data.items);
  if (cur.colocataire_id) {
    patchColocataire(cur.colocataire_id, {
      civilite: data.coloc_civilite,
      date_naissance: data.coloc_date_naissance,
      date_entree: data.coloc_date_entree,
      email: data.coloc_email,
      telephone: data.coloc_telephone,
      chambre: data.coloc_chambre
    });
  }
  updateDocument(id, {
    data,
    statut: 'brouillon',
    periode_debut: data.periode_debut,
    periode_fin: data.periode_fin,
    date_emission: data.date_emission,
    montant_total: data.montant_total,
    email_destinataire: data.coloc_email || cur.email_destinataire
  });
  res.json({ ok: true });
});

// Annulation des modifications : on relit depuis la base, sans rien changer.
// L'UI s'occupe d'appeler GET /documents/:id pour recharger l'éditeur.
app.get('/documents/:id', (req, res) => {
  const doc = getDocument(parseInt(req.params.id, 10));
  if (!doc) return res.status(404).json({ ok: false });
  res.json(doc);
});

// Validation et génération PDF définitive — propage aussi vers la fiche colocataire
app.post('/documents/:id/valider', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).json({ ok: false });
  const data = { ...cur.data, ...(req.body || {}) };
  if (typeof data.items === 'string') {
    try { data.items = JSON.parse(data.items); } catch { data.items = []; }
  }
  if (cur.type === 'facture') {
    data.montant_total = sommeItems(data.items);
  } else if (cur.type === 'quittance') {
    data.montant_total = Number(data.loyer || 0) + Number(data.charges || 0);
  }
  if (cur.colocataire_id) {
    patchColocataire(cur.colocataire_id, {
      civilite: data.coloc_civilite,
      date_naissance: data.coloc_date_naissance,
      date_entree: data.coloc_date_entree,
      email: data.coloc_email,
      telephone: data.coloc_telephone,
      chambre: data.coloc_chambre
    });
  }
  const buf = await generatePdf({ type: cur.type, data });
  const filename = nomFichier({ type: cur.type, data });
  const pdfPath = join(DATA_DIR, 'pdfs', `${id}_${filename}`);
  writeFileSync(pdfPath, buf);
  updateDocument(id, {
    data,
    statut: 'genere',
    pdf_path: pdfPath,
    periode_debut: data.periode_debut,
    periode_fin: data.periode_fin,
    date_emission: data.date_emission,
    montant_total: data.montant_total,
    email_destinataire: data.coloc_email || cur.email_destinataire
  });
  res.json({ ok: true, pdf_url: `/documents/${id}/pdf`, filename });
});

// Téléchargement du PDF (régénère à la volée si statut = brouillon)
app.get('/documents/:id/pdf', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).send('Document introuvable');
  const buf = await generatePdf({ type: cur.type, data: cur.data });
  const filename = nomFichier({ type: cur.type, data: cur.data });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

// Voir PDF inline
app.get('/documents/:id/voir', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).send('Document introuvable');
  const buf = await generatePdf({ type: cur.type, data: cur.data });
  res.setHeader('Content-Type', 'application/pdf');
  res.send(buf);
});

// Dupliquer (modifier une copie)
app.post('/documents/:id/dupliquer', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).send('Introuvable');
  const newId = createDocument({
    type: cur.type,
    colocataire_id: cur.colocataire_id,
    statut: 'brouillon',
    data: cur.data,
    periode_debut: cur.periode_debut,
    periode_fin: cur.periode_fin,
    date_emission: new Date().toISOString().slice(0, 10),
    montant_total: cur.montant_total,
    email_destinataire: cur.email_destinataire
  });
  res.redirect(`/documents/${newId}/editer`);
});

// Envoi par email — autorise aussi les brouillons (auto-validation au passage)
app.post('/documents/:id/envoyer', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).json({ ok: false });
  const to = (req.body && req.body.to) || cur.email_destinataire || cur.data.coloc_email;
  if (!to) return res.status(400).json({ ok: false, raison: 'Adresse email manquante' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, raison: 'SMTP non configuré — éditez le fichier .env' });
  const buf = await generatePdf({ type: cur.type, data: cur.data });
  const filename = nomFichier({ type: cur.type, data: cur.data });
  const subject = req.body.subject || sujetParDefaut(cur);
  const body = req.body.body || corpsParDefaut(cur);
  await sendDocument({ to, subject, text: body, attachmentName: filename, attachmentBuffer: buf });
  updateDocument(id, { statut: 'envoye', envoye_le: new Date().toISOString(), email_destinataire: to });
  res.json({ ok: true, mode: 'email', to });
});

// Marquer envoyé manuellement (utilisé après ouverture de WhatsApp / SMS)
app.post('/documents/:id/marquer-envoye', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = getDocument(id);
  if (!cur) return res.status(404).json({ ok: false });
  const canal = (req.body && req.body.canal) || 'manuel';
  const destinataire = (req.body && req.body.destinataire) || cur.email_destinataire || cur.data.coloc_email || cur.data.coloc_telephone;
  updateDocument(id, {
    statut: 'envoye',
    envoye_le: new Date().toISOString(),
    email_destinataire: destinataire || cur.email_destinataire
  });
  res.json({ ok: true, mode: canal, destinataire });
});

// Helper : message par défaut prêt à insérer dans WhatsApp ou SMS
function messageTransmission(doc) {
  const prop = getProprietaire();
  const typeLabel = doc.type === 'attestation' ? 'votre attestation de domiciliation'
                  : doc.type === 'quittance'   ? 'votre quittance de loyer'
                  : 'votre facture';
  const prenom = doc.data.coloc_prenom || '';
  return `Bonjour ${prenom}, je vous transmets ${typeLabel} en pièce jointe. Bien cordialement, ${prop.nom}.`;
}

app.get('/documents/:id/message-transmission', (req, res) => {
  const cur = getDocument(parseInt(req.params.id, 10));
  if (!cur) return res.status(404).json({ ok: false });
  res.json({ ok: true, message: messageTransmission(cur) });
});

// ─── Envoi groupé ──────────────────────────────────────────────────────
// /!\ Routes flat AVANT les routes paramétriques /documents/:id pour éviter
//     que Express capture "bulk-envoyer" comme un :id.
// Email : un seul courriel avec toutes les pièces jointes
app.post('/api/bulk-envoyer', async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  const to = req.body && req.body.to;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, raison: 'Aucun document sélectionné' });
  if (!to) return res.status(400).json({ ok: false, raison: 'Adresse email manquante' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, raison: 'SMTP non configuré' });

  const docs = ids.map(id => getDocument(parseInt(id, 10))).filter(Boolean);
  if (!docs.length) return res.status(404).json({ ok: false, raison: 'Documents introuvables' });

  // Génère tous les PDFs en parallèle
  const attachments = await Promise.all(docs.map(async d => ({
    filename: nomFichier({ type: d.type, data: d.data }),
    content: await generatePdf({ type: d.type, data: d.data }),
    contentType: 'application/pdf'
  })));

  const prop = getProprietaire();
  const prenom = docs[0].data.coloc_prenom || '';
  const subject = docs.length === 1
    ? sujetParDefaut(docs[0])
    : `Vos ${docs.length} documents — Cabinet ${prop.nom}`;
  const listeTextuelle = docs.map(d => '· ' + nomFichier({ type: d.type, data: d.data })).join('\n');
  const body = [
    `Bonjour ${prenom},`,
    ``,
    `Veuillez trouver ci-joint ${docs.length === 1 ? 'le document suivant' : 'les ' + docs.length + ' documents suivants'} :`,
    listeTextuelle,
    ``,
    `Bien cordialement,`,
    prop.nom,
    prop.telephone || ''
  ].join('\n');

  await sendMail({ to, subject, text: body, attachments });

  const now = new Date().toISOString();
  for (const d of docs) {
    updateDocument(d.id, { statut: 'envoye', envoye_le: now, email_destinataire: to });
  }
  res.json({ ok: true, count: docs.length });
});

// Envoi groupé multi-colocataires : regroupe par colocataire_id et envoie N emails,
// chacun avec ses propres pièces jointes. Retourne un compte-rendu par colocataire.
app.post('/api/bulk-envoyer-multi', async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, raison: 'Aucun document sélectionné' });
  if (!isEmailConfigured()) return res.status(400).json({ ok: false, raison: 'SMTP non configuré', smtpMissing: true });

  const docs = ids.map(id => getDocument(parseInt(id, 10))).filter(Boolean);
  if (!docs.length) return res.status(404).json({ ok: false, raison: 'Documents introuvables' });

  // Regroupement par colocataire_id
  const groupes = new Map();
  for (const d of docs) {
    const key = d.colocataire_id || 0;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key).push(d);
  }

  const prop = getProprietaire();
  const details = [];
  let countSent = 0;
  let countFailed = 0;

  for (const [colocId, groupeDocs] of groupes.entries()) {
    const coloc = colocId ? getColocataire(colocId) : null;
    const to = coloc?.email || groupeDocs[0]?.data?.coloc_email || groupeDocs[0]?.email_destinataire;
    const nomComplet = coloc ? `${coloc.prenom} ${coloc.nom}` : 'destinataire inconnu';
    if (!to) {
      countFailed += groupeDocs.length;
      details.push({ colocataire_id: colocId, nom: nomComplet, count: groupeDocs.length, ok: false, raison: 'Aucun email' });
      continue;
    }
    try {
      const attachments = await Promise.all(groupeDocs.map(async d => ({
        filename: nomFichier({ type: d.type, data: d.data }),
        content: await generatePdf({ type: d.type, data: d.data }),
        contentType: 'application/pdf'
      })));
      const prenom = coloc?.prenom || groupeDocs[0].data.coloc_prenom || '';
      const subject = groupeDocs.length === 1
        ? sujetParDefaut(groupeDocs[0])
        : `Vos ${groupeDocs.length} documents — Cabinet ${prop.nom}`;
      const listeTextuelle = groupeDocs.map(d => '· ' + nomFichier({ type: d.type, data: d.data })).join('\n');
      const body = [
        `Bonjour ${prenom},`,
        ``,
        `Veuillez trouver ci-joint ${groupeDocs.length === 1 ? 'le document suivant' : 'les ' + groupeDocs.length + ' documents suivants'} :`,
        listeTextuelle,
        ``,
        `Bien cordialement,`,
        prop.nom,
        prop.telephone || ''
      ].join('\n');
      await sendMail({ to, subject, text: body, attachments });
      const now = new Date().toISOString();
      for (const d of groupeDocs) {
        updateDocument(d.id, { statut: 'envoye', envoye_le: now, email_destinataire: to });
      }
      countSent += groupeDocs.length;
      details.push({ colocataire_id: colocId, nom: nomComplet, email: to, count: groupeDocs.length, ok: true });
    } catch (e) {
      countFailed += groupeDocs.length;
      details.push({ colocataire_id: colocId, nom: nomComplet, count: groupeDocs.length, ok: false, raison: e.message });
    }
  }

  res.json({
    ok: countSent > 0,
    count_sent: countSent,
    count_failed: countFailed,
    groupes: groupes.size,
    details
  });
});

// Résumé (dry-run) pour dialogue de confirmation multi-colocataires
app.post('/api/bulk-envoyer-resume', (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: false, groupes: [] });
  const docs = ids.map(id => getDocument(parseInt(id, 10))).filter(Boolean);
  const groupes = new Map();
  for (const d of docs) {
    const key = d.colocataire_id || 0;
    if (!groupes.has(key)) groupes.set(key, { docs: [], coloc: null });
    groupes.get(key).docs.push(d);
  }
  const resume = [];
  for (const [colocId, g] of groupes.entries()) {
    const coloc = colocId ? getColocataire(colocId) : null;
    resume.push({
      colocataire_id: colocId,
      nom: coloc ? `${coloc.prenom} ${coloc.nom}` : '— sans destinataire —',
      email: coloc?.email || null,
      telephone: coloc?.telephone || null,
      count: g.docs.length,
      hasEmail: !!coloc?.email,
      hasPhone: !!coloc?.telephone
    });
  }
  res.json({ ok: true, total: docs.length, groupes: resume, smtpConfigured: isEmailConfigured() });
});

// Marquage groupé en envoyé (pour WhatsApp / SMS où l'envoi est côté client)
app.post('/api/bulk-marquer-envoye', (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  const canal = (req.body && req.body.canal) || 'manuel';
  const destinataire = (req.body && req.body.destinataire) || '';
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false });
  const now = new Date().toISOString();
  let count = 0;
  for (const id of ids) {
    const cur = getDocument(parseInt(id, 10));
    if (!cur) continue;
    updateDocument(parseInt(id, 10), {
      statut: 'envoye',
      envoye_le: now,
      email_destinataire: destinataire || cur.email_destinataire
    });
    count++;
  }
  res.json({ ok: true, count, canal });
});

// Message groupé pré-rempli pour WhatsApp / SMS
app.get('/api/bulk-message-transmission', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(s => parseInt(s, 10)).filter(Boolean);
  if (!ids.length) return res.json({ ok: false });
  const docs = ids.map(id => getDocument(id)).filter(Boolean);
  if (!docs.length) return res.json({ ok: false });
  const prop = getProprietaire();
  const prenom = docs[0].data.coloc_prenom || '';
  const liste = docs.map(d => {
    const typeLabel = d.type === 'attestation' ? 'Attestation' : d.type === 'quittance' ? 'Quittance' : 'Facture';
    const periode = d.data.periode_debut ? ' ' + d.data.periode_debut.slice(0, 7) : '';
    return `• ${typeLabel}${periode}`;
  }).join('\n');
  const msg = `Bonjour ${prenom}, je vous transmets ${docs.length === 1 ? 'le document' : 'les ' + docs.length + ' documents'} suivant${docs.length>1?'s':''} en pièce jointe :\n${liste}\n\nBien cordialement, ${prop.nom}.`;
  res.json({ ok: true, message: msg });
});

// Suppression
app.post('/documents/:id/supprimer', (req, res) => {
  deleteDocument(parseInt(req.params.id, 10));
  res.redirect('/historique');
});

// ─── Production groupée ─────────────────────────────────────────────────
const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function pad2x(n) { return String(n).padStart(2, '0'); }
function moisRange(annee, mois) {
  const lastDay = new Date(annee, mois, 0).getDate();
  return {
    debut: `${annee}-${pad2x(mois)}-01`,
    fin:   `${annee}-${pad2x(mois)}-${pad2x(lastDay)}`,
    label: `${MOIS_FR[mois - 1]} ${annee}`
  };
}
function derniersMois(n, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push(moisRange(d.getFullYear(), d.getMonth() + 1));
  }
  return out;
}

app.get('/generation', (req, res) => {
  res.render('generation', {
    title: 'Production groupée',
    pageTitle: 'Production groupée',
    eyebrow: 'Plusieurs documents en un clic',
    pageSubtitle: 'Un colocataire, plusieurs types de documents, plusieurs mois — générés en brouillons d\'un seul coup.',
    activeNav: 'generation',
    colocataires: listColocataires({ actifSeulement: true })
  });
});

app.post('/generation', (req, res) => {
  const body = req.body || {};
  const colocataire_id = parseInt(body.colocataire_id, 10);
  const types = Array.isArray(body.types) ? body.types : (body.types ? [body.types] : []);
  if (!colocataire_id || !types.length) {
    return res.status(400).json({ ok: false, raison: 'Colocataire et types requis' });
  }
  const coloc = getColocataire(colocataire_id);
  if (!coloc) return res.status(404).json({ ok: false, raison: 'Colocataire introuvable' });
  const prop = getProprietaire();
  const bien = getBien(coloc.bien_id);

  // Détermine la liste des périodes
  let periodes = [];
  const mode = body.periode_mode || 'courant';
  if (mode === 'courant') {
    const d = new Date();
    periodes = [moisRange(d.getFullYear(), d.getMonth() + 1)];
  } else if (mode === '3') periodes = derniersMois(3);
  else if (mode === '6') periodes = derniersMois(6);
  else if (mode === '12') periodes = derniersMois(12);
  else if (mode === 'personnalise') {
    const m1 = String(body.mois_debut || '');
    const m2 = String(body.mois_fin || '');
    if (m1 && m2) {
      const [y1, mo1] = m1.split('-').map(Number);
      const [y2, mo2] = m2.split('-').map(Number);
      const start = new Date(y1, mo1 - 1, 1);
      const end = new Date(y2, mo2 - 1, 1);
      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        periodes.push(moisRange(d.getFullYear(), d.getMonth() + 1));
      }
    }
  }

  const created = [];
  for (const type of types) {
    if (type === 'attestation') {
      const data = buildDefaultData({ type, colocataire: coloc, proprietaire: prop, bien });
      const id = createDocument({
        type, colocataire_id: coloc.id, statut: 'brouillon', data,
        periode_debut: data.periode_debut, periode_fin: data.periode_fin,
        date_emission: data.date_emission, montant_total: data.montant_total,
        email_destinataire: coloc.email || null
      });
      created.push({ id, type, label: 'Attestation de domiciliation' });
    } else {
      const liste = periodes.length ? periodes : [moisRange(new Date().getFullYear(), new Date().getMonth() + 1)];
      for (const p of liste) {
        const data = buildDefaultData({
          type, colocataire: coloc, proprietaire: prop, bien,
          hints: { periode_debut: p.debut, periode_fin: p.fin }
        });
        const id = createDocument({
          type, colocataire_id: coloc.id, statut: 'brouillon', data,
          periode_debut: data.periode_debut, periode_fin: data.periode_fin,
          date_emission: data.date_emission, montant_total: data.montant_total,
          email_destinataire: coloc.email || null
        });
        created.push({
          id, type,
          label: (type === 'quittance' ? 'Quittance de loyer' : 'Facture') + ' — ' + p.label
        });
      }
    }
  }

  res.json({
    ok: true,
    count: created.length,
    documents: created,
    colocataire: {
      id: coloc.id,
      prenom: coloc.prenom,
      nom: coloc.nom,
      email: coloc.email,
      telephone: coloc.telephone
    },
    emailConfigured: isEmailConfigured()
  });
});

// ─── Patrimoine (biens immobiliers) ───────────────────────────────────
app.get('/biens', (req, res) => {
  const biens = listBiens();
  // Pour chaque bien : liste des colocataires actifs rattachés, enrichie de leur durée d'occupation.
  // Pour les colocations, on construit aussi un tableau « chambres » indexé par numéro de chambre.
  const biensAvecColocs = biens.map(b => {
    const colocs = listColocatairesParBien(b.id).map(c => ({
      ...c,
      duree: formatDuree(c.date_entree),
      dateEntreeFR: formatDateFR(c.date_entree)
    }));
    // Construit la grille des chambres : { 1: coloc, 2: null, 3: coloc, "non_assignes": [coloc...] }
    let chambres = null;
    let nonAssignes = [];
    if (b.type === 'colocation') {
      const n = b.nb_chambres || 3;
      chambres = Array.from({ length: n }, (_, i) => ({
        numero: i + 1,
        occupants: colocs.filter(c => c.actif && String(c.chambre || '').trim() === String(i + 1))
      }));
      nonAssignes = colocs.filter(c => c.actif && !String(c.chambre || '').trim());
    }
    return { ...b, colocataires: colocs, chambres, nonAssignes };
  });
  const total = biens.length;
  res.render('biens', {
    title: 'Patrimoine',
    pageTitle: 'Patrimoine',
    eyebrow: total === 1 ? 'Un bien à la gestion' : `${total} biens à la gestion`,
    pageSubtitle: 'Les biens administrés par ce cabinet — adresse, surface, type d\'occupation et locataires liés.',
    activeNav: 'biens',
    biens: biensAvecColocs
  });
});

app.post('/biens', (req, res) => {
  createBien(req.body);
  res.redirect('/biens');
});

app.post('/biens/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.body._action === 'delete') {
    deleteBien(id);
  } else {
    updateBien(id, { ...req.body, actif: req.body.actif === 'on' || req.body.actif === '1' });
  }
  res.redirect('/biens');
});

// Propriétaire
app.get('/proprietaire', (req, res) => {
  const env = readEnv();
  res.render('proprietaire', {
    title: 'Cabinet',
    pageTitle: 'Identité du cabinet',
    eyebrow: 'Coordonnées · bailleur',
    pageSubtitle: 'Les informations apparaissent en en-tête de tous les documents émis.',
    activeNav: 'proprietaire',
    smtp: {
      host: env.SMTP_HOST || '',
      port: env.SMTP_PORT || '587',
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      hasPass: Boolean(env.SMTP_PASS),
      from: env.SMTP_FROM || ''
    }
  });
});

// Enregistre la configuration SMTP dans .env
app.post('/proprietaire/smtp', async (req, res) => {
  const b = req.body || {};
  const updates = {
    SMTP_HOST: b.host || '',
    SMTP_PORT: b.port || '587',
    SMTP_SECURE: (b.secure === 'on' || b.secure === 'true') ? 'true' : 'false',
    SMTP_USER: b.user || '',
    SMTP_FROM: b.from || b.user || ''
  };
  // Le mot de passe n'est mis à jour que si l'utilisateur l'a saisi
  if (b.pass) updates.SMTP_PASS = b.pass;
  writeEnv(updates);
  resetTransporter();
  res.json({ ok: true, configured: isEmailConfigured() });
});

// Teste la connexion sans envoyer
app.post('/proprietaire/smtp/test', async (req, res) => {
  try {
    // Si l'utilisateur a rempli le formulaire sans encore enregistrer, on teste avec ces valeurs
    const b = req.body || {};
    if (b.host) {
      process.env.SMTP_HOST = b.host;
      process.env.SMTP_PORT = b.port || '587';
      process.env.SMTP_SECURE = (b.secure === 'on' || b.secure === 'true') ? 'true' : 'false';
      if (b.user) process.env.SMTP_USER = b.user;
      if (b.pass) process.env.SMTP_PASS = b.pass;
      resetTransporter();
    }
    await verifyConnection();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, raison: e.message });
  }
});
app.post('/proprietaire', (req, res) => {
  updateProprietaire(req.body);
  res.redirect('/proprietaire');
});

function sujetParDefaut(doc) {
  const map = { attestation: 'Attestation de domiciliation', quittance: 'Quittance de loyer', facture: 'Facture' };
  return `${map[doc.type] || 'Document'} — ${doc.data.coloc_prenom || ''} ${doc.data.coloc_nom || ''}`.trim();
}
function corpsParDefaut(doc) {
  const prop = getProprietaire();
  return [
    `Bonjour ${doc.data.coloc_prenom || ''},`,
    ``,
    `Veuillez trouver en pièce jointe votre ${doc.type === 'attestation' ? 'attestation de domiciliation' : doc.type === 'quittance' ? 'quittance de loyer' : 'facture'}.`,
    ``,
    `Cordialement,`,
    `${prop.nom}`,
    `${prop.telephone || ''}`
  ].join('\n');
}

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Application disponible sur le port ${port}`);
});
