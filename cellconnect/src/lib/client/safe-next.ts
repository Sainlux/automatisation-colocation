/**
 * Adresse de retour (« ?suite=… ») sûre après connexion ou inscription.
 *
 * Seule une adresse du même site est acceptée : on la résout par rapport à l'origine
 * courante et on refuse tout ce qui mène ailleurs (« //evil.ch », « /\evil.ch »,
 * « https://evil.ch », « javascript: »…). Les barres obliques inverses et les caractères
 * de contrôle sont refusés d'office : les navigateurs les normalisent de façon surprenante.
 * Renvoie « / » quand l'adresse est absente ou refusée.
 */
export function safeNext(next: string | null | undefined, origin?: string): string {
  if (!next) return "/";
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  const base = origin ?? (typeof location !== "undefined" ? location.origin : null);
  if (!base) return "/";
  try {
    const url = new URL(next, base);
    if (url.origin !== new URL(base).origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
