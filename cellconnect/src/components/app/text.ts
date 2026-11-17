/*
 * Petits utilitaires de texte, sans dépendance (pas de Luxon) : utilisables dans le cadre
 * de l'application (navigation) sans alourdir le premier chargement.
 */

/** Nombre + nom accordé, sans « (s) » : 0 et 1 au singulier. plural(3, "date", "dates") → « 3 dates ». */
export const plural = (n: number, un: string, plusieurs: string) => `${n} ${Math.abs(n) <= 1 ? un : plusieurs}`;

/**
 * Typographie française pour l'AFFICHAGE uniquement (jamais dans la valeur d'un champ) :
 * espace fine insécable avant ; ! ? » et après «, insécable avant : et entre un nombre et son unité.
 */
export const frTypo = (s: string) =>
  s
    .replace(/\s+([;!?»])/g, " $1")
    .replace(/«\s+/g, "« ")
    .replace(/(\S)\s+:(?=\s|$)/g, "$1 :")
    .replace(/(\d)\s+(h|min|%|CHF|km)(?![\p{L}])/gu, "$1 $2");
