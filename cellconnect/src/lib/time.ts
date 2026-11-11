import { DateTime } from "luxon";

/**
 * Utilitaires de dates. Toutes les comparaisons se font sur des instants UTC
 * normalisés ; les heures « murales » (20h30 à Zurich) sont converties via la
 * base IANA de Luxon, ce qui gère correctement les passages heure d'été/hiver.
 */

export const DEFAULT_TZ = "Europe/Zurich";

export const WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
export const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

export function isValidIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid;
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/**
 * Convertit une date + heure locales d'un fuseau en instant UTC (ISO).
 * Lors du passage à l'heure d'été, une heure inexistante (ex. 02:30 le
 * dernier dimanche de mars à Zurich) est décalée vers l'avant par Luxon ;
 * on le signale via `shifted`.
 */
export function zonedToUtc(date: string, time: string, tz: string): { iso: string; shifted: boolean } {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Date/heure invalide : ${date} ${time} (${tz})`);
  const shifted = dt.toFormat("HH:mm") !== time;
  return { iso: dt.toUTC().toISO()!, shifted };
}

export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  return { date: dt.toISODate()!, time: dt.toFormat("HH:mm") };
}

/** Ajoute une durée en minutes à une heure murale, en restant dans le fuseau. */
export function addMinutesToTime(date: string, time: string, minutes: number, tz: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz }).plus({ minutes });
  return { date: dt.toISODate()!, time: dt.toFormat("HH:mm") };
}

export function formatDateFr(iso: string, tz: string = DEFAULT_TZ): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("cccc d LLLL yyyy");
}

export function formatTimeFr(iso: string, tz: string = DEFAULT_TZ): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).toFormat("HH'h'mm");
}

export function formatRangeFr(startIso: string, endIso: string, tz: string = DEFAULT_TZ): string {
  const s = DateTime.fromISO(startIso, { zone: "utc" }).setZone(tz).setLocale("fr-CH");
  const e = DateTime.fromISO(endIso, { zone: "utc" }).setZone(tz).setLocale("fr-CH");
  const sameDay = s.hasSame(e, "day");
  return sameDay
    ? `${s.toFormat("cccc d LLLL yyyy")}, ${s.toFormat("HH'h'mm")} – ${e.toFormat("HH'h'mm")}`
    : `${s.toFormat("cccc d LLLL yyyy HH'h'mm")} – ${e.toFormat("cccc d LLLL yyyy HH'h'mm")}`;
}

/** Jour de semaine (0 = lundi) d'une date civile. */
export function weekdayIndex(year: number, month: number, day: number): number | null {
  const dt = DateTime.fromObject({ year, month, day });
  return dt.isValid ? dt.weekday - 1 : null;
}

export function normalizeWeekday(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  const idx = WEEKDAYS_FR.findIndex((w) => s.startsWith(w.slice(0, 3)));
  if (idx >= 0) return idx;
  const en = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].findIndex((w) => s.startsWith(w));
  return en >= 0 ? en : null;
}

export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60000);
}
