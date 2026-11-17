/**
 * Point unique d'accès HTTP vers les API externes (Google, Microsoft, Zoom).
 * Remplaçable dans les tests pour simuler les réponses et vérifier les requêtes.
 */
type FetchFn = typeof fetch;
let impl: FetchFn = (...a) => fetch(...a);
export const httpFetch: FetchFn = (...a) => impl(...a);
export function setHttpFetch(f: FetchFn | null) {
  impl = f ?? ((...a) => fetch(...a));
}
