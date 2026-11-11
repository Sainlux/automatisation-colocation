import { fr, type Messages } from "./fr";

const catalogs: Record<string, Messages> = { fr };
export const defaultLocale = "fr";

export function messages(locale: string = defaultLocale): Messages {
  return catalogs[locale] ?? fr;
}

/** Raccourci pour la langue par défaut. */
export const t = fr;
