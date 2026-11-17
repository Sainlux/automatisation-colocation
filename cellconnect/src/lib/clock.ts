/**
 * Horloge du serveur.
 *
 * TEST_NOW permet de figer la date pour les tests (unitaires ou E2E en mode
 * local). Il est ignoré en production avec Supabase : une variable oubliée ne
 * peut pas fausser les rappels ou les conflits des vrais utilisateurs.
 */
export function serverNow(): Date {
  const fixed = process.env.TEST_NOW;
  if (fixed && (process.env.NODE_ENV !== "production" || process.env.DATA_BACKEND === "local")) {
    const d = new Date(fixed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
