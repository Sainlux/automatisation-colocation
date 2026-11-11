import { DateTime } from "luxon";

export const fmtDay = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("cccc d LLLL");
export const fmtDayShort = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("ccc d LLL");
export const fmtTime = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).toFormat("HH'h'mm");
export const fmtDateTime = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("d LLL yyyy, HH'h'mm");
export const fmtRange = (s: string, e: string, tz = "Europe/Zurich") => `${fmtDay(s, tz)} · ${fmtTime(s, tz)} – ${fmtTime(e, tz)}`;
export const fmtFullDate = (isoDate: string) => DateTime.fromISO(isoDate).setLocale("fr-CH").toFormat("cccc d LLLL yyyy");
export const relative = (iso: string) => DateTime.fromISO(iso).setLocale("fr").toRelative() ?? "";

/* ───────────── Formats « des mots du quotidien » ───────────── */

const ZURICH = "Europe/Zurich";

/** Date seule (AAAA-MM-JJ) lue dans le fuseau ; date-heure ISO lue en UTC puis convertie. */
const zoned = (iso: string, tz = ZURICH) =>
  (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? DateTime.fromISO(iso, { zone: tz }) : DateTime.fromISO(iso, { zone: "utc" }).setZone(tz)).setLocale("fr-CH");

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

/** « 20:30 » → « 20h30 ». Une valeur illisible est rendue telle quelle. */
export const fmtHHmm = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? `${m[1].padStart(2, "0")}h${m[2]}` : hhmm;
};

/** Heure affichable depuis « HH:mm » ou une date-heure ISO (UTC). */
const anyTime = (v: string, tz: string) => (v.includes("T") ? fmtTime(v, tz) : fmtHHmm(v));

/** « 20h30 – 22h00 » (ou « 20h30 » sans fin). Accepte « HH:mm » ou des dates-heures ISO. */
export const fmtTimeRange = (start: string, end?: string | null, tz = ZURICH) =>
  end ? `${anyTime(start, tz)} – ${anyTime(end, tz)}` : anyTime(start, tz);

/** « lun. 16 nov. », avec l'année seulement si elle diffère de l'année en cours. */
export const fmtShortDate = (isoDate: string, tz = ZURICH) => {
  const d = zoned(isoDate, tz);
  return d.toFormat(d.year === DateTime.now().setZone(tz).year ? "ccc d LLL" : "ccc d LLL yyyy");
};

/** Durée courte : 30 → « 30 min », 120 → « 2 h », 90 → « 1 h 30 », 1440 → « 1 jour ». */
export const fmtMinutes = (min: number) => {
  const m = Math.max(0, Math.round(min));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const parts: string[] = [];
  if (days) parts.push(plural(days, "jour", "jours"));
  if (hours) parts.push(`${hours} h`);
  if (mins) parts.push(hours && !days ? String(mins).padStart(2, "0") : `${mins} min`);
  return parts.length ? parts.join(" ") : "0 min";
};

/** Rappel : 1440 → « 1 jour avant », 0 → « à l'heure de début ». */
export const fmtOffset = (min: number) => (min <= 0 ? "à l'heure de début" : `${fmtMinutes(min)} avant`);

/** Liste de rappels : [1440, 120, 30] → « 1 jour, 2 h et 30 min avant ». */
export const fmtOffsets = (mins: readonly number[]) => {
  const sorted = [...new Set(mins)].filter((m) => m > 0).sort((a, b) => b - a).map(fmtMinutes);
  if (!sorted.length) return mins.includes(0) ? fmtOffset(0) : "Aucun rappel";
  const list = sorted.length === 1 ? sorted[0] : `${sorted.slice(0, -1).join(", ")} et ${sorted[sorted.length - 1]}`;
  return `${list} avant`;
};

/** Répétitions proposées (valeurs RRULE identiques au formulaire d'événement et à la vérification). */
export const RECURRENCES = [
  { value: "", label: "Pas de répétition" },
  { value: "FREQ=WEEKLY", label: "Chaque semaine" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Toutes les deux semaines" },
  { value: "FREQ=MONTHLY", label: "Chaque mois" },
] as const;

/** Libellé d'une règle de répétition ; règle inconnue → « Répétition personnalisée ». */
export const fmtRecurrence = (rule: string | null | undefined) =>
  RECURRENCES.find((r) => r.value === (rule ?? ""))?.label ?? "Répétition personnalisée";

export type DayBucket = "past" | "today" | "tomorrow" | "week" | "nextWeek" | "later";
export const DAY_BUCKET_LABELS: Record<DayBucket, string> = {
  past: "Passé",
  today: "Aujourd'hui",
  tomorrow: "Demain",
  week: "Cette semaine",
  nextWeek: "La semaine prochaine",
  later: "Plus tard",
};

/** Regroupement d'une date pour les listes (« Aujourd'hui », « Demain », « Cette semaine »…), dans le fuseau donné. */
export const dayBucket = (iso: string, tz = ZURICH, now: DateTime = DateTime.now()): DayBucket => {
  const day = zoned(iso, tz).startOf("day");
  const today = now.setZone(tz).startOf("day");
  const diff = Math.round(day.diff(today, "days").days);
  if (diff < 0) return "past";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  const weekEnd = today.endOf("week");
  if (day <= weekEnd) return "week";
  if (day <= weekEnd.plus({ weeks: 1 })) return "nextWeek";
  return "later";
};

/** Parties d'une tuile date : « LUN », « 16 », « NOV », et la date complète pour les lecteurs d'écran. */
export const dateTileParts = (iso: string, tz = ZURICH) => {
  const d = zoned(iso, tz);
  return {
    weekday: d.toFormat("ccc").replace(".", ""),
    day: d.toFormat("d"),
    month: d.toFormat("LLL").replace(".", ""),
    full: d.toFormat("cccc d LLLL yyyy"),
    isoDate: d.toISODate() ?? iso,
  };
};
