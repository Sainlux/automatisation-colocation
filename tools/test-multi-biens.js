// Test l'adaptation des textes selon le type de bien (colocation vs location seule)
import { attestationTexte, quittanceTexte } from '../src/templates.js';

const proprietaireBase = {
  proprietaire_nom: 'Ghebrenegus Merhawi',
  proprietaire_telephone: '0041.79.665.34.40',
  proprietaire_email: 'ghmerhawi@hotmail.com'
};

console.log('\n══════════════════════════════════════════════════════════════');
console.log(' CAS 1 — Nicolas Cohan · bien René Blanc (COLOCATION 3 chambres)');
console.log('══════════════════════════════════════════════════════════════');
console.log(attestationTexte({
  ...proprietaireBase,
  coloc_prenom: 'Nicolas', coloc_nom: 'Cohan', coloc_civilite: 'M',
  coloc_date_naissance: '1999-06-30', coloc_date_entree: '2023-12-01',
  bien_adresse: '5, rue René Blanc, 74100 Annemasse',
  bien_type: 'colocation', bien_meuble: true,
  bien_surface: null, bien_etage: ''
}));

console.log('\n══════════════════════════════════════════════════════════════');
console.log(' CAS 2 — Ewen Lottier · bien Coquand (LOCATION SEULE 40 m² 2ème ét.)');
console.log('══════════════════════════════════════════════════════════════');
console.log(attestationTexte({
  ...proprietaireBase,
  coloc_prenom: 'Ewen', coloc_nom: 'Lottier', coloc_civilite: 'M',
  coloc_date_naissance: '', coloc_date_entree: '',
  bien_adresse: '11 rue Docteur Coquand, 74100 Annemasse',
  bien_type: 'location_seule', bien_meuble: true,
  bien_surface: 40, bien_etage: '2ème'
}));

console.log('\n══════════════════════════════════════════════════════════════');
console.log(' CAS 3 — Quittance Ewen Lottier · bien Coquand (650 € + 80 €)');
console.log('══════════════════════════════════════════════════════════════');
console.log(quittanceTexte({
  ...proprietaireBase,
  coloc_prenom: 'Ewen', coloc_nom: 'Lottier', coloc_civilite: 'M',
  bien_adresse: '11 rue Docteur Coquand, 74100 Annemasse',
  bien_type: 'location_seule',
  loyer: 650, charges: 80, montant_total: 730
}));
