// Catalogue des dégâts couramment facturés dans le cadre d'une colocation.
// Les prix sont indicatifs — modifiables ligne à ligne dans l'éditeur.

export const CATALOGUE_IMMOBILIER = [
  { label: 'Peinture mur (par paroi)',                prix: 90 },
  { label: 'Peinture plafond',                        prix: 80 },
  { label: 'Reprise enduit / rebouchage de trous',    prix: 35 },
  { label: 'Parquet — remise en état (rayures)',      prix: 120 },
  { label: 'Carrelage cassé — remplacement',          prix: 60 },
  { label: 'Moquette — nettoyage / tache',            prix: 80 },
  { label: 'Porte intérieure — panneau',              prix: 220 },
  { label: 'Poignée de porte',                        prix: 45 },
  { label: 'Vitre cassée — double vitrage',           prix: 180 },
  { label: 'Volet roulant — réparation',              prix: 150 },
  { label: 'Cuvette WC / abattant',                   prix: 90 },
  { label: 'Lavabo / vasque',                         prix: 120 },
  { label: 'Robinetterie — mitigeur',                 prix: 75 },
  { label: 'Cabine de douche / paroi',                prix: 250 },
  { label: 'Plaque de cuisson vitrocéramique',        prix: 320 },
  { label: 'Hotte aspirante',                         prix: 180 },
  { label: 'Radiateur électrique',                    prix: 200 },
  { label: 'Serrure — remplacement cylindre',         prix: 90 },
  { label: 'Clé perdue — reproduction',               prix: 25 },
  { label: 'Prise / interrupteur',                    prix: 35 },
  { label: 'Boîte aux lettres',                       prix: 60 },
  { label: 'Nettoyage en profondeur après départ',    prix: 180 }
];

export const CATALOGUE_MOBILIER = [
  { label: 'Lit — cadre simple',           prix: 180 },
  { label: 'Matelas 140×190',              prix: 220 },
  { label: 'Sommier',                       prix: 110 },
  { label: 'Oreiller',                      prix: 25 },
  { label: 'Couette / housse',              prix: 50 },
  { label: 'Armoire / penderie',            prix: 280 },
  { label: 'Bureau',                        prix: 150 },
  { label: 'Chaise',                        prix: 60 },
  { label: 'Étagère / bibliothèque',        prix: 130 },
  { label: 'Table de chevet',               prix: 70 },
  { label: 'Canapé / fauteuil',             prix: 400 },
  { label: 'Lampe / luminaire',             prix: 45 },
  { label: 'Rideau / voilage',              prix: 35 },
  { label: 'Tapis',                         prix: 90 },
  { label: 'Vaisselle — lot complet',       prix: 40 },
  { label: 'Casserole / poêle',             prix: 30 },
  { label: 'Micro-ondes',                   prix: 80 },
  { label: 'Bouilloire / cafetière',        prix: 35 },
  { label: 'Aspirateur',                    prix: 95 },
  { label: 'Linge de maison — lot',         prix: 70 }
];

// Calcule le total à partir d'une liste d'items
export function sommeItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (Number(it.quantite || 0) * Number(it.prix_unitaire || 0)), 0);
}
