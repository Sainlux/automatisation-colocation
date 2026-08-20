// Modèles de documents — produisent les champs structurés ET un texte par défaut éditable.

import { sommeItems } from './items-catalogue.js';

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function pad2(n) { return String(n).padStart(2, '0'); }

export function formatDateFR(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const jour = parseInt(d, 10);
  // Convention française : « 1er » pour le premier du mois, sinon le nombre seul
  const jourFR = jour === 1 ? '1er' : String(jour);
  return `${jourFR} ${MOIS[parseInt(mo, 10) - 1]} ${y}`;
}

export function moisAnnee(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  if (!m) return iso;
  return `${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// Calcule la durée depuis une date ISO jusqu'à maintenant.
// Retourne un objet : { texte: 'depuis 2 ans · 5 mois', compact: '2 ans · 5 mois', mois: 29, jours: 12 }
export function formatDuree(iso, { jusqua = new Date() } = {}) {
  if (!iso) return { texte: '', compact: '', mois: 0, jours: 0 };
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { texte: '', compact: '', mois: 0, jours: 0 };
  const [, y, mo, d] = m;
  const debut = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(debut)) return { texte: '', compact: '', mois: 0, jours: 0 };
  const now = jusqua instanceof Date ? jusqua : new Date(jusqua);

  let annees = now.getFullYear() - debut.getFullYear();
  let mois = now.getMonth() - debut.getMonth();
  let jours = now.getDate() - debut.getDate();
  if (jours < 0) {
    mois -= 1;
    // approximation : on prend 30 j pour le compact
    jours += 30;
  }
  if (mois < 0) {
    annees -= 1;
    mois += 12;
  }
  const totalMois = annees * 12 + mois;
  const totalJours = Math.max(0, Math.floor((now - debut) / 86400000));

  // Compact : "2 ans · 5 mois" / "8 mois" / "12 j" si < 1 mois
  let compact;
  if (annees > 0 && mois > 0) compact = `${annees} an${annees > 1 ? 's' : ''} · ${mois} mois`;
  else if (annees > 0)        compact = `${annees} an${annees > 1 ? 's' : ''}`;
  else if (mois > 0)          compact = `${mois} mois`;
  else                        compact = `${totalJours} j`;

  // Texte long
  let texte;
  if (annees > 0 && mois > 0) texte = `depuis ${annees} an${annees > 1 ? 's' : ''} et ${mois} mois`;
  else if (annees > 0)        texte = `depuis ${annees} an${annees > 1 ? 's' : ''}`;
  else if (mois > 0)          texte = `depuis ${mois} mois`;
  else                        texte = `depuis ${totalJours} jour${totalJours > 1 ? 's' : ''}`;

  return { texte, compact, mois: totalMois, jours: totalJours };
}

export function buildDefaultData({ type, colocataire, proprietaire, bien = null, hints = {} }) {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const today = hints.date_emission || todayIso;

  // Période par défaut : mois en cours (construit en local pour éviter UTC shift)
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  const debutMois = hints.periode_debut || `${y}-${pad2(m)}-01`;
  const finMois = hints.periode_fin || `${y}-${pad2(m)}-${pad2(lastDay)}`;

  // Adresse du bien : on privilégie le bien rattaché au colocataire, sinon on retombe
  // sur l'adresse legacy stockée sur la fiche propriétaire (compat ascendante).
  const bienAdresse = bien?.adresse || proprietaire.bien_adresse;

  const base = {
    type,
    proprietaire_nom: proprietaire.nom,
    proprietaire_adresse: proprietaire.adresse,
    proprietaire_telephone: proprietaire.telephone,
    proprietaire_email: proprietaire.email,
    bien_adresse: bienAdresse,
    bien_id: bien?.id || null,
    bien_nom: bien?.nom || '',
    bien_type: bien?.type || 'colocation',  // 'colocation' | 'location_seule'
    bien_surface: bien?.surface || null,
    bien_etage: bien?.etage || '',
    bien_meuble: !!bien?.meuble,             // location meublée (régime juridique distinct)
    ville_emission: proprietaire.ville_emission || 'Beaumont',
    date_emission: today,
    coloc_prenom: colocataire?.prenom || '',
    coloc_nom: colocataire?.nom || '',
    coloc_civilite: hints.civilite || colocataire?.civilite || '',
    coloc_email: colocataire?.email || '',
    coloc_telephone: colocataire?.telephone || '',
    coloc_chambre: colocataire?.chambre || '',
    coloc_date_naissance: hints.date_naissance || colocataire?.date_naissance || '',
    coloc_date_entree: hints.date_entree || colocataire?.date_entree || '',
    coloc_adresse: colocataire?.adresse || bienAdresse,
    periode_debut: debutMois,
    periode_fin: finMois,
    loyer: hints.loyer ?? colocataire?.loyer ?? null,
    charges: hints.charges ?? colocataire?.charges ?? null,
    montant_total: null,
    // Position de signature (ratios sur la page A4)
    signature_x_ratio: 0.54,
    signature_y_ratio: 0.54,
    mention_legale: '',
    texte: ''
  };

  if (type === 'attestation') {
    base.objet = 'Attestation de domiciliation';
    base.texte = attestationTexte(base);
  } else if (type === 'quittance') {
    const loyer = Number(base.loyer || 0);
    const charges = Number(base.charges || 0);
    base.montant_total = loyer + charges;
    base.mention_legale = `Cette quittance annule tous reçus éventuellement remis à titre d'acompte en cas de paiement partiel du montant du présent terme. Cette quittance ne vaut que pour la période susmentionnée et ne présume en aucun cas du paiement des termes précédents ni ne constitue une renonciation du bailleur à ses droits et actions éventuelles. En cas de congé précédemment donné, cette quittance ne saurait être considérée comme un titre de location.`;
    base.texte = quittanceTexte(base);
  } else if (type === 'facture') {
    base.objet = hints.objet || 'Facture pour dégâts';
    base.items = hints.items || [];     // tableau d'items { categorie, label, quantite, prix_unitaire }
    base.designation = hints.designation || 'Réparations et remplacements suite à dégâts';
    base.montant_total = sommeItems(base.items);
    base.texte = factureTexte(base);
  }
  return base;
}

export function attestationTexte(d) {
  const nomColoc = `${d.coloc_prenom} ${d.coloc_nom}`.trim();
  const civ = d.coloc_civilite === 'Mme' ? 'Madame' : d.coloc_civilite === 'M' ? 'Monsieur' : 'M./Mme';
  const ne = d.coloc_civilite === 'Mme' ? 'née' : d.coloc_civilite === 'M' ? 'né' : 'né(e)';
  const inte = d.coloc_civilite === 'Mme' ? 'intéressée' : d.coloc_civilite === 'M' ? 'intéressé' : 'intéressé(e)';
  // Formule de politesse adaptée : Madame seule, Monsieur seul, ou Madame, Monsieur si inconnu
  const politesse = d.coloc_civilite === 'Mme' ? 'Madame'
                  : d.coloc_civilite === 'M' ? 'Monsieur'
                  : 'Madame, Monsieur';
  const dateNaiss = formatDateFR(d.coloc_date_naissance);
  const dateEntree = formatDateFR(d.coloc_date_entree);

  // Description de l'occupation : adaptée au type de bien (colocation vs location seule)
  // + précision « meublé » conformément au régime des locations meublées.
  const regime = d.bien_meuble ? 'meublée' : '';
  let occupationPhrase;
  if (d.bien_type === 'location_seule') {
    const details = [];
    if (d.bien_surface) details.push(`d'une surface de ${d.bien_surface} m²`);
    if (d.bien_etage) details.push(`situé au ${d.bien_etage} étage`);
    const detailsFR = details.length ? ` — logement ${details.join(', ')}` : '';
    const qualif = regime ? `de la location ${regime}` : 'du logement';
    occupationPhrase = `${civ} ${nomColoc} occupe l'intégralité ${qualif} à titre de résidence principale${detailsFR}.`;
  } else {
    const qualif = regime ? `colocation meublée` : 'colocation';
    occupationPhrase = `${civ} ${nomColoc} occupe une chambre au sein de ce logement en ${qualif}.`;
  }

  return [
    `Je soussigné, ${d.proprietaire_nom}, propriétaire du logement situé au ${d.bien_adresse}, atteste par la présente que ${civ} ${nomColoc}${dateNaiss ? `, ${ne} le ${dateNaiss}` : ''}, réside à cette adresse en tant que locataire${dateEntree ? ` depuis le ${dateEntree}` : ''}.`,
    ``,
    `${occupationPhrase} Cette attestation de domiciliation est délivrée à la demande de l'${inte} pour servir et valoir ce que de droit, notamment pour ses démarches administratives.`,
    ``,
    `Je vous prie d'agréer, ${politesse}, l'expression de mes salutations distinguées.`,
    ``,
    `Pour toute question ou vérification, vous pouvez me contacter au ${d.proprietaire_telephone} ou à ${d.proprietaire_email}.`
  ].join('\n');
}

export function quittanceTexte(d) {
  const nomColoc = `${d.coloc_prenom} ${d.coloc_nom}`.trim();
  const civ = d.coloc_civilite === 'Mme' ? 'Madame'
            : d.coloc_civilite === 'M' ? 'Monsieur'
            : '';
  const locataire = civ ? `${civ} ${nomColoc}` : nomColoc;
  const total = Number(d.montant_total || 0).toFixed(2);
  const loyer = Number(d.loyer || 0).toFixed(2);
  const charges = Number(d.charges || 0).toFixed(2);
  return [
    `Je soussigné, ${d.proprietaire_nom}, déclare avoir reçu de ${locataire}, locataire du bien immobilier indiqué ci-dessus, la somme de ${total} euros correspondant, pour la période visée :`,
    ``,
    `- à l'intégralité du loyer pour un montant de ${loyer} euros`,
    `- à l'intégralité des charges pour un montant de ${charges} euros`,
    ``,
    `DONT QUITTANCE`
  ].join('\n');
}

export function factureTexte(d) {
  const nomColoc = `${d.coloc_prenom} ${d.coloc_nom}`.trim();
  const civ = d.coloc_civilite === 'Mme' ? 'Madame'
            : d.coloc_civilite === 'M' ? 'Monsieur'
            : '';
  const locataire = civ ? `${civ} ${nomColoc}` : nomColoc;
  const total = Number(d.montant_total || 0).toFixed(2);
  const hasItems = Array.isArray(d.items) && d.items.length > 0;
  const intro = hasItems
    ? `La présente facture, adressée à ${locataire}, détaille les réparations et remplacements suite aux dégâts constatés au logement situé au ${d.bien_adresse}. Le décompte des prestations figure dans le tableau ci-dessous.`
    : `La présente facture, adressée à ${locataire}, porte sur les prestations suivantes : ${d.designation || 'Réparations et remplacements suite à dégâts'}.`;
  return [
    intro,
    ``,
    hasItems ? `Montant total dû : ${total} euros.` : `Montant total : ${total} euros.`,
    ``,
    `Règlement à effectuer par virement ou chèque à l'ordre de ${d.proprietaire_nom}.`
  ].join('\n');
}

export function nomFichier(doc) {
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = doc.data || doc;
  const nom = slug(d.coloc_nom || 'colocataire');
  const dateE = d.date_emission || new Date().toISOString().slice(0, 10);
  if (doc.type === 'attestation') {
    return `attestation_domiciliation_${nom}_${dateE}.pdf`;
  }
  if (doc.type === 'quittance') {
    const [y, m] = (d.periode_debut || dateE).split('-');
    return `quittance_loyer_${nom}_${MOIS[parseInt(m || '1', 10) - 1]}_${y}.pdf`;
  }
  return `facture_${nom}_${dateE}.pdf`;
}
