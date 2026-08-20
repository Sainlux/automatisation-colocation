// Génère le texte d'une attestation pour vérifier l'adaptation au genre
import { attestationTexte } from '../src/templates.js';

const cases = [
  {
    label: 'Nicolas Cohan (M, données complètes)',
    data: {
      coloc_prenom: 'Nicolas', coloc_nom: 'Cohan', coloc_civilite: 'M',
      coloc_date_naissance: '1999-06-30', coloc_date_entree: '2023-12-01',
      proprietaire_nom: 'Ghebrenegus Merhawi',
      bien_adresse: '5, rue René Blanc, 74100 Annemasse',
      proprietaire_telephone: '0041.79.665.34.40',
      proprietaire_email: 'ghmerhawi@hotmail.com'
    }
  },
  {
    label: 'Victoria Baptista (Mme, données partielles)',
    data: {
      coloc_prenom: 'Victoria', coloc_nom: 'Baptista', coloc_civilite: 'Mme',
      coloc_date_naissance: '', coloc_date_entree: '',
      proprietaire_nom: 'Ghebrenegus Merhawi',
      bien_adresse: '5, rue René Blanc, 74100 Annemasse',
      proprietaire_telephone: '0041.79.665.34.40',
      proprietaire_email: 'ghmerhawi@hotmail.com'
    }
  },
  {
    label: 'Luesta Dani (civilité INCONNUE — fallback neutre)',
    data: {
      coloc_prenom: 'Luesta', coloc_nom: 'Dani', coloc_civilite: '',
      coloc_date_naissance: '', coloc_date_entree: '',
      proprietaire_nom: 'Ghebrenegus Merhawi',
      bien_adresse: '5, rue René Blanc, 74100 Annemasse',
      proprietaire_telephone: '0041.79.665.34.40',
      proprietaire_email: 'ghmerhawi@hotmail.com'
    }
  }
];

for (const c of cases) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' ' + c.label);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(attestationTexte(c.data));
}
