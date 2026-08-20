import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { formatDateFR } from './templates.js';

// Mise en page conforme aux conventions de la lettre administrative française
// (NF Z 11-001 — emplacement des éléments d'une lettre commerciale)
//
// • marges généreuses (≈ 2,5 cm)
// • bloc émetteur en haut à gauche
// • bloc destinataire (vis-à-vis) en haut à droite, légèrement descendu
// • lieu + date alignés à droite
// • objet en gras à gauche
// • corps justifié avec interligne respiré
// • formule de politesse, puis signature en bas à droite
//
// Toutes les dimensions sont en points PDF (1 pt = 1/72 pouce ≈ 0,353 mm).
// A4 = 595,28 × 841,89 pt — marges 70 pt ≈ 2,47 cm.

const MARGIN = 70;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

export function generatePdf(doc) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const d = doc.data || doc;
    const type = doc.type || d.type;

    pdf.font('Helvetica');

    drawSenderBlock(pdf, d);
    drawRecipientBlock(pdf, d);
    drawPlaceAndDate(pdf, d);
    drawObjet(pdf, d, type);
    drawBody(pdf, d, type);
    drawClosingDate(pdf, d);
    drawSignature(pdf, d);

    pdf.end();
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function splitAdresse(adr) {
  if (!adr) return [];
  const m = adr.match(/^(.+?),\s*(\d{5}\s+.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [adr];
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

// ─── Émetteur (bloc supérieur gauche) ───────────────────────────────────
function drawSenderBlock(pdf, d) {
  pdf.fillColor('#111');
  pdf.font('Helvetica-Bold').fontSize(11).text(d.proprietaire_nom || '', MARGIN, MARGIN, { lineGap: 2 });
  pdf.font('Helvetica').fontSize(10.5);
  for (const ligne of splitAdresse(d.proprietaire_adresse || '')) {
    pdf.text(ligne, MARGIN, pdf.y, { lineGap: 2 });
  }
  if (d.proprietaire_telephone || d.proprietaire_email) {
    pdf.moveDown(0.5);
    pdf.fontSize(9.5).fillColor('#444');
    if (d.proprietaire_telephone) pdf.text(`Tél. ${d.proprietaire_telephone}`, MARGIN, pdf.y, { lineGap: 1 });
    if (d.proprietaire_email) pdf.text(d.proprietaire_email, MARGIN, pdf.y, { lineGap: 1 });
    pdf.fillColor('#111');
  }
}

// Largeur commune destinataire + date — toutes deux ancrées sur la même colonne droite.
const RIGHT_COL_W = 240;
const RIGHT_COL_X = PAGE_W - MARGIN - RIGHT_COL_W;

// ─── Destinataire (bloc supérieur droit, aligné à droite) ───────────────
function drawRecipientBlock(pdf, d) {
  const nomColoc = `${d.coloc_prenom || ''} ${d.coloc_nom || ''}`.trim();
  pdf.fillColor('#111').font('Helvetica-Bold').fontSize(11)
    .text(nomColoc || 'Destinataire', RIGHT_COL_X, MARGIN, { width: RIGHT_COL_W, align: 'right', lineGap: 2 });
  pdf.font('Helvetica').fontSize(10.5);
  for (const ligne of splitAdresse(d.coloc_adresse || '')) {
    pdf.text(ligne, RIGHT_COL_X, pdf.y, { width: RIGHT_COL_W, align: 'right', lineGap: 2 });
  }
}

// ─── Lieu et date (même colonne droite que le destinataire) ────────────
function drawPlaceAndDate(pdf, d) {
  // Descend sous le bloc le plus bas (émetteur ou destinataire)
  const y = Math.max(pdf.y, MARGIN + 110);
  pdf.x = MARGIN;
  pdf.y = y + 20;
  pdf.fontSize(11).fillColor('#111')
    .text(`${d.ville_emission || 'Beaumont'}, le ${formatDateFR(d.date_emission)}`,
      RIGHT_COL_X, pdf.y, { width: RIGHT_COL_W, align: 'right', lineGap: 2 });
  pdf.moveDown(2);
}

// ─── Objet (à gauche, en gras) ─────────────────────────────────────────
function drawObjet(pdf, d, type) {
  let objet = d.objet;
  if (!objet) {
    if (type === 'attestation') objet = 'Attestation de domiciliation';
    else if (type === 'quittance') objet = 'Quittance de loyer';
    else objet = 'Facture / Reçu';
  }
  pdf.font('Helvetica-Bold').fontSize(11.5)
    .text(`Objet : ${objet}`, MARGIN, pdf.y, { lineGap: 2 });
  pdf.font('Helvetica').fontSize(11);
  pdf.moveDown(2);
}

// ─── Corps ──────────────────────────────────────────────────────────────
function drawBody(pdf, d, type) {
  const W = PAGE_W - 2 * MARGIN;

  if (type === 'quittance') {
    drawPeriodeBox(pdf, d);
    pdf.moveDown(1.4);
  }

  // Texte introductif
  pdf.fontSize(11).fillColor('#111')
    .text(d.texte || '', MARGIN, pdf.y, {
      width: W,
      align: 'justify',
      lineGap: 4,
      paragraphGap: 6
    });

  // Pour les factures avec items : tableau détaillé
  if (type === 'facture' && Array.isArray(d.items) && d.items.length > 0) {
    pdf.moveDown(1.4);
    drawItemsTable(pdf, d.items);
  }

  if (type === 'quittance' && d.mention_legale) {
    pdf.moveDown(1.2);
    pdf.fontSize(8.5).fillColor('#555')
      .text(d.mention_legale, MARGIN, pdf.y, {
        width: W,
        align: 'justify',
        lineGap: 2
      });
    pdf.fillColor('#111');
  }
}

// ─── Tableau des items (facture) ───────────────────────────────────────
function drawItemsTable(pdf, items) {
  const W = PAGE_W - 2 * MARGIN;
  const COL = { desig: W - 240, qte: 50, prix: 90, total: 100 };
  const x0 = MARGIN;
  const ROW_H = 22;

  // Entête de tableau
  let y = pdf.y;
  pdf.save();
  pdf.rect(x0, y, W, 22).fill('#F4EFE6');
  pdf.restore();
  pdf.fillColor('#1A1916').font('Helvetica-Bold').fontSize(9);
  pdf.text('DÉSIGNATION', x0 + 8, y + 7, { width: COL.desig - 16, align: 'left', characterSpacing: 0.8 });
  pdf.text('QTÉ',         x0 + COL.desig, y + 7, { width: COL.qte, align: 'center', characterSpacing: 0.8 });
  pdf.text('PRIX UNIT.',  x0 + COL.desig + COL.qte, y + 7, { width: COL.prix, align: 'right', characterSpacing: 0.8 });
  pdf.text('TOTAL',       x0 + COL.desig + COL.qte + COL.prix, y + 7, { width: COL.total - 8, align: 'right', characterSpacing: 0.8 });

  y += 22;
  pdf.font('Helvetica').fontSize(10.5);

  // Regroupe les items par catégorie pour les afficher avec un sous-titre
  const groups = {};
  for (const it of items) {
    const k = it.categorie || 'autre';
    if (!groups[k]) groups[k] = [];
    groups[k].push(it);
  }
  const labelGroup = (k) => ({ immobilier: 'Réparations immobilières', mobilier: 'Mobilier et équipement', autre: 'Autres prestations' })[k] || k;

  let total = 0;
  for (const cat of Object.keys(groups)) {
    // Sous-titre catégorie
    pdf.fillColor('#7C2D2A').font('Helvetica-Bold').fontSize(8.5)
      .text(labelGroup(cat).toUpperCase(), x0 + 8, y + 6, { characterSpacing: 1.5 });
    y += 20;
    pdf.fillColor('#1A1916').font('Helvetica').fontSize(10.5);

    for (const it of groups[cat]) {
      const q = Number(it.quantite || 0);
      const pu = Number(it.prix_unitaire || 0);
      const sub = q * pu;
      total += sub;
      // hairline séparatrice
      pdf.lineWidth(0.25).strokeColor('#E8E1D3')
        .moveTo(x0, y).lineTo(x0 + W, y).stroke();

      pdf.text(it.label || '—', x0 + 8, y + 7, { width: COL.desig - 16, align: 'left' });
      pdf.text(String(q), x0 + COL.desig, y + 7, { width: COL.qte, align: 'center' });
      pdf.text(pu.toFixed(2) + ' €', x0 + COL.desig + COL.qte, y + 7, { width: COL.prix, align: 'right' });
      pdf.font('Helvetica-Bold').text(sub.toFixed(2) + ' €', x0 + COL.desig + COL.qte + COL.prix, y + 7, { width: COL.total - 8, align: 'right' });
      pdf.font('Helvetica');
      y += ROW_H;
    }
  }

  // Ligne de total
  pdf.lineWidth(0.6).strokeColor('#1A1916').moveTo(x0, y).lineTo(x0 + W, y).stroke();
  y += 8;
  pdf.font('Helvetica-Bold').fontSize(11.5).fillColor('#1A1916');
  pdf.text('TOTAL DÛ', x0 + 8, y + 2, { width: COL.desig + COL.qte + COL.prix - 8, align: 'right', characterSpacing: 1.2 });
  pdf.fontSize(13).text(total.toFixed(2) + ' €', x0 + COL.desig + COL.qte + COL.prix, y, { width: COL.total - 8, align: 'right' });
  pdf.font('Helvetica');
  pdf.y = y + 26;
  pdf.x = MARGIN;
}

function drawPeriodeBox(pdf, d) {
  const W = PAGE_W - 2 * MARGIN;
  const PAD = 10;
  const lines = [
    `Période : du ${formatDateFR(d.periode_debut)} au ${formatDateFR(d.periode_fin)}`,
    `Adresse du bien immobilier loué : ${d.bien_adresse || ''}`
  ];
  const lineH = 14;
  const h = lines.length * lineH + PAD * 2;
  const x = MARGIN;
  const y = pdf.y;
  pdf.save();
  pdf.rect(x, y, W, h).fillOpacity(1).fill('#f4f0e8');
  pdf.restore();
  pdf.fillColor('#111').font('Helvetica').fontSize(11);
  let cy = y + PAD;
  for (const l of lines) {
    pdf.text(l, x + PAD, cy, { width: W - 2 * PAD });
    cy += lineH;
  }
  pdf.y = y + h;
  pdf.x = MARGIN;
}

// ─── Date de clôture « Fait à … » ──────────────────────────────────────
function drawClosingDate(pdf, d) {
  pdf.moveDown(2);
  pdf.fontSize(11).fillColor('#111')
    .text(`Fait à ${d.ville_emission || 'Beaumont'}, le ${formatDateFR(d.date_emission)}`,
      MARGIN, pdf.y, { lineGap: 2 });
}

// ─── Signature (image + nom imprimé en gras) ───────────────────────────
// La position X reste libre (ratio horizontal).
// La position Y est intelligente : on respecte le ratio choisi par l'utilisateur,
// SAUF si le corps du texte arrive en dessous — auquel cas la signature glisse
// après le texte pour éviter tout chevauchement.
function drawSignature(pdf, d) {
  const xRatio = clamp(Number(d.signature_x_ratio ?? 0.54), 0.05, 0.95);
  const yRatio = clamp(Number(d.signature_y_ratio ?? 0.54), 0.05, 0.95);

  const x = PAGE_W * xRatio;
  const yWanted = PAGE_H * yRatio;
  const yMinBelowBody = pdf.y + 26;            // 26pt sous la dernière ligne
  const yMaxOnPage = PAGE_H - MARGIN - 40;     // jamais sous la marge bas
  const y = clamp(Math.max(yWanted, yMinBelowBody), 0, yMaxOnPage);

  const sigPath = process.env.SIGNATURE_PATH || 'public/signature.png';
  if (sigPath && existsSync(sigPath)) {
    try {
      pdf.image(sigPath, x, y - 30, { width: 140 });
    } catch {
      pdf.fontSize(11).text('[Signature]', x, y);
    }
  } else {
    pdf.fontSize(11).text('[Signature]', x, y);
  }
  pdf.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(d.proprietaire_nom || '', x, y + 14);
  pdf.font('Helvetica');
}
