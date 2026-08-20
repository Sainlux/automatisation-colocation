// Analyseur en langage naturel des demandes utilisateur.
// Détecte le type de document, le colocataire mentionné et quelques indices (mois, montants).
import { listColocataires } from './db.js';

const MOIS = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, 'décembre': 12
};

export function analyser(message) {
  const m = String(message || '').toLowerCase();
  const result = { type: null, colocataire: null, hints: {}, raw: message };

  // Type de document
  if (/\b(attestation|domiciliation|hébergement|hebergement)\b/.test(m)) result.type = 'attestation';
  else if (/\b(quittance|loyer|reçu de loyer|recu de loyer)\b/.test(m)) result.type = 'quittance';
  else if (/\b(facture|reçu|recu)\b/.test(m)) result.type = 'facture';

  // Colocataire
  const colocs = listColocataires();
  for (const c of colocs) {
    const re = new RegExp(`\\b(${escape(c.prenom)}|${escape(c.nom)}|${escape(c.prenom + ' ' + c.nom)}|${escape(c.nom + ' ' + c.prenom)})\\b`, 'i');
    if (re.test(message)) {
      result.colocataire = c;
      break;
    }
  }

  // Mois + année (ex : "quittance d'octobre 2025")
  const moisMatch = m.match(/\b(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b\s*(\d{4})?/);
  if (moisMatch) {
    const key = moisMatch[1].replace('é', 'e').replace('û', 'u');
    const monthNum = MOIS[key] || MOIS[moisMatch[1]];
    const year = moisMatch[2] ? parseInt(moisMatch[2], 10) : new Date().getFullYear();
    if (monthNum) {
      const mm = String(monthNum).padStart(2, '0');
      const lastDay = new Date(year, monthNum, 0).getDate();
      result.hints.periode_debut = `${year}-${mm}-01`;
      result.hints.periode_fin = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // Montants : exige € / eur / euros pour distinguer d'un millésime
  const loyerMatch = m.match(/loyer\s+(?:de\s+)?([0-9]+(?:[.,][0-9]+)?)\s*(?:€|eur|euros?)/i);
  if (loyerMatch) result.hints.loyer = parseFloat(loyerMatch[1].replace(',', '.'));
  const chargesMatch = m.match(/charges?\s+(?:de\s+)?([0-9]+(?:[.,][0-9]+)?)\s*(?:€|eur|euros?)/i);
  if (chargesMatch) result.hints.charges = parseFloat(chargesMatch[1].replace(',', '.'));

  return result;
}

function escape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
