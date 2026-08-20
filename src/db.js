import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// DATA_DIR permet de pointer vers un volume persistant (ex: /data sur Fly.io)
const DATA_DIR = process.env.DATA_DIR || 'data';
const DB_PATH = join(DATA_DIR, 'app.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS proprietaire (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL,
  bien_adresse TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  ville_emission TEXT DEFAULT 'Beaumont'
);

-- Table « bien » : représente un bien immobilier administré par le cabinet.
-- Un colocataire est rattaché à un bien via colocataire.bien_id.
CREATE TABLE IF NOT EXISTS bien (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,                      -- libellé court (ex. « Annemasse — René Blanc »)
  adresse TEXT NOT NULL,
  surface REAL,                           -- m² (nullable)
  etage TEXT,                             -- texte libre (« 2ème », « RDC »…)
  type TEXT NOT NULL DEFAULT 'colocation',-- 'colocation' | 'location_seule'
  nb_chambres INTEGER,
  meuble INTEGER DEFAULT 0,               -- 1 = location meublée (loi du 6 juillet 1989 + décret 2016-382)
  actif INTEGER DEFAULT 1,
  cree_le TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS colocataire (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  civilite TEXT,                          -- 'M' (Monsieur) | 'Mme' (Madame)
  email TEXT,
  telephone TEXT,
  date_naissance TEXT,
  date_entree TEXT,
  date_sortie TEXT,
  chambre TEXT,
  adresse TEXT,
  loyer REAL,
  charges REAL,
  bien_id INTEGER REFERENCES bien(id) ON DELETE SET NULL,
  actif INTEGER DEFAULT 1,
  cree_le TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migration : ajoute la colonne civilité sur les bases existantes
-- (sqlite ne supporte pas IF NOT EXISTS sur ALTER ADD COLUMN, on tente et on ignore)

CREATE TABLE IF NOT EXISTS document (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                     -- attestation | quittance | facture
  colocataire_id INTEGER REFERENCES colocataire(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | genere | envoye
  -- snapshot des champs au moment de la création (modifiable)
  data TEXT NOT NULL,                     -- JSON
  periode_debut TEXT,
  periode_fin TEXT,
  date_emission TEXT,
  montant_total REAL,
  pdf_path TEXT,
  email_destinataire TEXT,
  envoye_le TEXT,
  cree_le TEXT DEFAULT CURRENT_TIMESTAMP,
  modifie_le TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_coloc ON document(colocataire_id);
CREATE INDEX IF NOT EXISTS idx_document_type ON document(type);
CREATE INDEX IF NOT EXISTS idx_document_statut ON document(statut);
CREATE INDEX IF NOT EXISTS idx_coloc_actif ON colocataire(actif);
`);

// Migration : ajoute la colonne civilite si elle manque (base créée avant le champ)
try {
  const cols = db.prepare("PRAGMA table_info(colocataire)").all();
  if (!cols.find(c => c.name === 'civilite')) {
    db.exec("ALTER TABLE colocataire ADD COLUMN civilite TEXT");
  }
} catch (e) { /* ignore */ }

// Migration : ajoute la colonne bien_id si elle manque (base créée avant le multi-biens)
// SQLite refuse l'ajout d'une FK via ALTER ; on ajoute la colonne, l'intégrité est
// préservée applicativement (les FK ne sont actives que sur les nouvelles bases).
try {
  const cols = db.prepare("PRAGMA table_info(colocataire)").all();
  if (!cols.find(c => c.name === 'bien_id')) {
    db.exec("ALTER TABLE colocataire ADD COLUMN bien_id INTEGER");
  }
} catch (e) { /* ignore */ }

// Migration : ajoute la colonne meuble sur les biens existants (base créée avant la distinction meublé)
try {
  const cols = db.prepare("PRAGMA table_info(bien)").all();
  if (!cols.find(c => c.name === 'meuble')) {
    db.exec("ALTER TABLE bien ADD COLUMN meuble INTEGER DEFAULT 0");
  }
} catch (e) { /* ignore */ }

// Seed propriétaire (singleton) si absent
const propRow = db.prepare('SELECT id FROM proprietaire WHERE id = 1').get();
if (!propRow) {
  db.prepare(`
    INSERT INTO proprietaire (id, nom, adresse, bien_adresse, telephone, email, ville_emission)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `).run(
    'Ghebrenegus Merhawi',
    '100, lotissement du domaine du Salève, 74160 Beaumont',
    '5, rue René Blanc, 74100 Annemasse',
    '0041.79.665.34.40',
    'ghmerhawi@hotmail.com',
    'Beaumont'
  );
}

// Seed des biens immobiliers — idempotent : on ne crée que ce qui manque.
// 1) « René Blanc » reprend l'adresse historique de proprietaire.bien_adresse
//    (auparavant adresse unique du logement).
// 2) « Coquand » est le nouveau bien ajouté à la gestion du cabinet.
const BIEN_RENE_BLANC_NOM = 'Annemasse — René Blanc';
const BIEN_RENE_BLANC_ADRESSE = '5, rue René Blanc, 74100 Annemasse';
const BIEN_COQUAND_NOM = 'Annemasse — Coquand';
const BIEN_COQUAND_ADRESSE = '11 rue Docteur Coquand, 74100 Annemasse';

function ensureBien({ nom, adresse, surface, etage, type, nb_chambres, meuble }) {
  const existing = db.prepare('SELECT id, meuble FROM bien WHERE lower(nom) = lower(?) OR lower(adresse) = lower(?)').get(nom, adresse);
  if (existing) {
    // Backfill : si meuble est vide/0 mais que la spec demande meublé, on met à jour
    if (meuble != null && (existing.meuble == null || existing.meuble === 0)) {
      db.prepare('UPDATE bien SET meuble = ? WHERE id = ?').run(meuble ? 1 : 0, existing.id);
    }
    return existing.id;
  }
  const info = db.prepare(`
    INSERT INTO bien (nom, adresse, surface, etage, type, nb_chambres, meuble, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(nom, adresse, surface ?? null, etage ?? null, type, nb_chambres ?? null, meuble ? 1 : 0);
  return Number(info.lastInsertRowid);
}

const bienReneBlancId = ensureBien({
  nom: BIEN_RENE_BLANC_NOM, adresse: BIEN_RENE_BLANC_ADRESSE,
  surface: null, etage: null, type: 'colocation', nb_chambres: 3, meuble: 1
});
const bienCoquandId = ensureBien({
  nom: BIEN_COQUAND_NOM, adresse: BIEN_COQUAND_ADRESSE,
  surface: 40, etage: '2ème', type: 'location_seule', nb_chambres: null, meuble: 1
});

// Backfill : tous les colocataires existants sans bien_id sont rattachés
// au bien historique (René Blanc), de sorte à ne rien casser pour les fiches déjà saisies.
db.prepare(
  'UPDATE colocataire SET bien_id = ? WHERE bien_id IS NULL'
).run(bienReneBlancId);

// Seed des colocataires connus avec données civiles
// Les champs civilité / dates sont nécessaires pour adapter automatiquement
// les formulations "M./Mme", "né(e)", "l'intéressé(e)" dans les attestations.
const seed = [
  { prenom: 'Nicolas',  nom: 'Cohan',    civilite: 'M',   date_naissance: '1999-06-30', date_entree: '2023-12-01', bien_id: bienReneBlancId, adresse: BIEN_RENE_BLANC_ADRESSE },
  { prenom: 'Luesta',   nom: 'Dani',     civilite: null,  date_naissance: null,         date_entree: null,         bien_id: bienReneBlancId, adresse: BIEN_RENE_BLANC_ADRESSE },
  { prenom: 'Victoria', nom: 'Baptista', civilite: 'Mme', date_naissance: null,         date_entree: null,         bien_id: bienReneBlancId, adresse: BIEN_RENE_BLANC_ADRESSE },
  // Nouveau locataire pour le bien Coquand — fiche initiale ; les champs civils restent à compléter par l'utilisateur.
  { prenom: 'Ewen',     nom: 'Lottier',  civilite: 'M',   date_naissance: null,         date_entree: null,         bien_id: bienCoquandId,   adresse: BIEN_COQUAND_ADRESSE   }
];
for (const c of seed) {
  const exists = db.prepare(
    'SELECT id, civilite, date_naissance, date_entree, bien_id FROM colocataire WHERE lower(prenom) = lower(?) AND lower(nom) = lower(?)'
  ).get(c.prenom, c.nom);
  if (!exists) {
    db.prepare(
      'INSERT INTO colocataire (prenom, nom, civilite, date_naissance, date_entree, adresse, bien_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(c.prenom, c.nom, c.civilite, c.date_naissance, c.date_entree, c.adresse, c.bien_id);
  } else {
    // Backfill : complète uniquement les champs encore vides (n'écrase jamais une saisie utilisateur)
    const updates = [];
    const params = [];
    if (!exists.civilite && c.civilite)             { updates.push('civilite = ?');       params.push(c.civilite); }
    if (!exists.date_naissance && c.date_naissance) { updates.push('date_naissance = ?'); params.push(c.date_naissance); }
    if (!exists.date_entree && c.date_entree)       { updates.push('date_entree = ?');    params.push(c.date_entree); }
    if (!exists.bien_id && c.bien_id)               { updates.push('bien_id = ?');        params.push(c.bien_id); }
    if (updates.length) {
      params.push(exists.id);
      db.prepare(`UPDATE colocataire SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
  }
}

export function getProprietaire() {
  return db.prepare('SELECT * FROM proprietaire WHERE id = 1').get();
}

export function updateProprietaire(p) {
  db.prepare(`
    UPDATE proprietaire SET nom=?, adresse=?, bien_adresse=?, telephone=?, email=?, ville_emission=?
    WHERE id = 1
  `).run(p.nom, p.adresse, p.bien_adresse, p.telephone, p.email, p.ville_emission || 'Beaumont');
}

export function listColocataires({ actifSeulement = false } = {}) {
  const sql = actifSeulement
    ? 'SELECT * FROM colocataire WHERE actif = 1 ORDER BY nom, prenom'
    : 'SELECT * FROM colocataire ORDER BY actif DESC, nom, prenom';
  return db.prepare(sql).all();
}

export function getColocataire(id) {
  return db.prepare('SELECT * FROM colocataire WHERE id = ?').get(id);
}

export function findColocataire(query) {
  const q = `%${query.toLowerCase()}%`;
  return db.prepare(`
    SELECT * FROM colocataire
    WHERE lower(prenom) LIKE ? OR lower(nom) LIKE ?
       OR lower(prenom || ' ' || nom) LIKE ? OR lower(nom || ' ' || prenom) LIKE ?
       OR lower(coalesce(email, '')) LIKE ? OR lower(coalesce(telephone, '')) LIKE ?
    ORDER BY actif DESC, nom, prenom
  `).all(q, q, q, q, q, q);
}

export function createColocataire(c) {
  const bienId = c.bien_id ? parseInt(c.bien_id, 10) || null : null;
  // Adresse par défaut : celle du bien si fourni, sinon legacy bien_adresse du propriétaire
  let adresseParDefaut = c.adresse;
  if (!adresseParDefaut && bienId) {
    const b = db.prepare('SELECT adresse FROM bien WHERE id = ?').get(bienId);
    if (b) adresseParDefaut = b.adresse;
  }
  if (!adresseParDefaut) adresseParDefaut = '5, rue René Blanc, 74100 Annemasse';
  const info = db.prepare(`
    INSERT INTO colocataire (prenom, nom, civilite, email, telephone, date_naissance, date_entree,
                             chambre, adresse, loyer, charges, bien_id, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    c.prenom, c.nom, c.civilite || null,
    c.email || null, c.telephone || null,
    c.date_naissance || null, c.date_entree || null,
    c.chambre || null, adresseParDefaut,
    c.loyer || null, c.charges || null,
    bienId
  );
  return Number(info.lastInsertRowid);
}

export function updateColocataire(id, c) {
  const bienId = c.bien_id ? parseInt(c.bien_id, 10) || null : null;
  db.prepare(`
    UPDATE colocataire SET prenom=?, nom=?, civilite=?, email=?, telephone=?, date_naissance=?,
      date_entree=?, date_sortie=?, chambre=?, adresse=?, loyer=?, charges=?, bien_id=?, actif=?
    WHERE id=?
  `).run(
    c.prenom, c.nom, c.civilite || null,
    c.email || null, c.telephone || null, c.date_naissance || null,
    c.date_entree || null, c.date_sortie || null, c.chambre || null,
    c.adresse || null, c.loyer || null, c.charges || null,
    bienId, c.actif ? 1 : 0, id
  );
}

// Patch partiel : ne touche que les champs fournis. Utilisé pour persister
// la civilité / date de naissance saisies dans l'éditeur de document.
export function patchColocataire(id, patch) {
  const cur = getColocataire(id);
  if (!cur) return;
  const keys = ['civilite', 'date_naissance', 'date_entree', 'chambre', 'email', 'telephone'];
  const sets = [];
  const vals = [];
  for (const k of keys) {
    if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '') {
      sets.push(`${k} = ?`);
      vals.push(patch[k]);
    }
  }
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE colocataire SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteColocataire(id) {
  db.prepare('DELETE FROM colocataire WHERE id = ?').run(id);
}

// ─── Biens immobiliers ───────────────────────────────────────────────
export function listBiens({ actifSeulement = false } = {}) {
  const sql = actifSeulement
    ? 'SELECT * FROM bien WHERE actif = 1 ORDER BY nom'
    : 'SELECT * FROM bien ORDER BY actif DESC, nom';
  return db.prepare(sql).all();
}

export function getBien(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM bien WHERE id = ?').get(id);
}

export function listColocatairesParBien(bienId) {
  return db.prepare(
    'SELECT * FROM colocataire WHERE bien_id = ? ORDER BY actif DESC, nom, prenom'
  ).all(bienId);
}

function meubleVal(v) {
  // Convertit divers représentations du formulaire (checkbox/select) en 0/1.
  if (v === true || v === 1 || v === '1' || v === 'on' || v === 'meuble' || v === 'meublé') return 1;
  return 0;
}

export function createBien(b) {
  const info = db.prepare(`
    INSERT INTO bien (nom, adresse, surface, etage, type, nb_chambres, meuble, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.nom, b.adresse,
    b.surface === '' || b.surface == null ? null : Number(b.surface),
    b.etage || null,
    b.type || 'colocation',
    b.nb_chambres === '' || b.nb_chambres == null ? null : parseInt(b.nb_chambres, 10),
    meubleVal(b.meuble),
    b.actif === false || b.actif === 0 ? 0 : 1
  );
  return Number(info.lastInsertRowid);
}

export function updateBien(id, b) {
  db.prepare(`
    UPDATE bien SET nom=?, adresse=?, surface=?, etage=?, type=?, nb_chambres=?, meuble=?, actif=?
    WHERE id=?
  `).run(
    b.nom, b.adresse,
    b.surface === '' || b.surface == null ? null : Number(b.surface),
    b.etage || null,
    b.type || 'colocation',
    b.nb_chambres === '' || b.nb_chambres == null ? null : parseInt(b.nb_chambres, 10),
    meubleVal(b.meuble),
    b.actif === false || b.actif === 0 || b.actif === undefined ? 0 : 1,
    id
  );
}

export function deleteBien(id) {
  // ON DELETE SET NULL : les colocataires conservent leur fiche mais perdent le lien.
  db.prepare('DELETE FROM bien WHERE id = ?').run(id);
}

export function createDocument(d) {
  const info = db.prepare(`
    INSERT INTO document (type, colocataire_id, statut, data, periode_debut, periode_fin,
                          date_emission, montant_total, pdf_path, email_destinataire)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.type, d.colocataire_id || null, d.statut || 'brouillon',
    JSON.stringify(d.data || {}),
    d.periode_debut || null, d.periode_fin || null, d.date_emission || null,
    d.montant_total || null, d.pdf_path || null, d.email_destinataire || null
  );
  return Number(info.lastInsertRowid);
}

export function updateDocument(id, d) {
  const cur = getDocument(id);
  if (!cur) return;
  const merged = { ...cur, ...d };
  db.prepare(`
    UPDATE document SET type=?, colocataire_id=?, statut=?, data=?, periode_debut=?,
      periode_fin=?, date_emission=?, montant_total=?, pdf_path=?, email_destinataire=?,
      envoye_le=?, modifie_le=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    merged.type, merged.colocataire_id, merged.statut,
    typeof merged.data === 'string' ? merged.data : JSON.stringify(merged.data),
    merged.periode_debut, merged.periode_fin, merged.date_emission,
    merged.montant_total, merged.pdf_path, merged.email_destinataire,
    merged.envoye_le, id
  );
}

export function getDocument(id) {
  const row = db.prepare('SELECT * FROM document WHERE id = ?').get(id);
  if (!row) return null;
  row.data = JSON.parse(row.data || '{}');
  return row;
}

export function listDocuments({ statut, type, q, colocataire_id } = {}) {
  const where = [];
  const params = [];
  if (statut) { where.push('d.statut = ?'); params.push(statut); }
  if (type) { where.push('d.type = ?'); params.push(type); }
  if (colocataire_id) { where.push('d.colocataire_id = ?'); params.push(colocataire_id); }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(`(
      lower(coalesce(c.prenom, '')) LIKE ?
      OR lower(coalesce(c.nom, '')) LIKE ?
      OR lower(d.type) LIKE ?
      OR lower(coalesce(d.periode_debut,'')) LIKE ?
      OR lower(coalesce(d.periode_fin,'')) LIKE ?
      OR lower(coalesce(d.date_emission,'')) LIKE ?
      OR cast(coalesce(d.montant_total,0) as text) LIKE ?
    )`);
    for (let i = 0; i < 7; i++) params.push(like);
  }
  const sql = `
    SELECT d.*, c.prenom AS coloc_prenom, c.nom AS coloc_nom, c.email AS coloc_email
    FROM document d
    LEFT JOIN colocataire c ON c.id = d.colocataire_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY d.cree_le DESC
  `;
  const rows = db.prepare(sql).all(...params);
  for (const r of rows) r.data = JSON.parse(r.data || '{}');
  return rows;
}

export function deleteDocument(id) {
  db.prepare('DELETE FROM document WHERE id = ?').run(id);
}
