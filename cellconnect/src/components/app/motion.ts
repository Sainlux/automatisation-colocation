/** Préférences de mouvement de l'utilisateur (réglage « Réduire les animations » du téléphone). */

/** Vrai si l'utilisateur demande moins d'animations (toujours faux côté serveur). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Comportement de défilement à passer à scrollIntoView / scrollTo : instantané si le mouvement est réduit. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
