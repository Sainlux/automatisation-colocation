import { DateTime } from "luxon";
import type { ExtractedEvent, ExtractionResult } from "@/lib/schemas/extraction";
import type { EventDraft, Issue } from "@/lib/schemas/draft";
import { DEFAULT_TZ, isValidTimezone, MONTHS_FR, normalizeWeekday, WEEKDAYS_FR, weekdayIndex } from "@/lib/time";

/**
 * ValidationAgent — fonctions déterministes (aucun appel IA).
 *
 * Transforme le résultat brut de l'extraction en brouillons vérifiables :
 *  - signale les champs manquants ou incertains ;
 *  - propose une année quand elle est absente, avec une justification
 *    explicite (cohérence du jour de semaine) — jamais appliquée sans
 *    confirmation de l'utilisateur ;
 *  - n'accepte que des liens https réellement présents dans la source.
 */

const KNOWN_MEETING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "whereby.com"];

export interface ValidationOptions {
  now: Date;
  timezone?: string;
  groups?: { id: string; name: string }[];
}

export function suggestYear(
  date: { month: number; day: number; weekday: string | null },
  now: Date,
  tz: string,
): { year: number; reason: string } | null {
  const today = DateTime.fromJSDate(now).setZone(tz).startOf("day");
  const wd = normalizeWeekday(date.weekday);
  const label = `${date.day} ${MONTHS_FR[date.month - 1]}`;
  const candidates: number[] = [];
  for (let y = today.year - 1; y <= today.year + 2; y++) {
    const dt = DateTime.fromObject({ year: y, month: date.month, day: date.day }, { zone: tz });
    if (!dt.isValid) continue;
    // Fenêtre plausible : de 30 jours dans le passé à 18 mois dans le futur.
    if (dt < today.minus({ days: 30 }) || dt > today.plus({ months: 18 })) continue;
    if (wd !== null && weekdayIndex(y, date.month, date.day) !== wd) continue;
    candidates.push(y);
  }
  if (candidates.length === 0) return null;
  const year = candidates[0];
  if (wd !== null) {
    const unique = candidates.length === 1;
    return {
      year,
      reason: `Le ${label} tombe un ${WEEKDAYS_FR[wd]} en ${year}${unique ? "" : " (première année possible)"}, comme indiqué dans la source.`,
    };
  }
  return { year, reason: `Année non indiquée : ${year} est la prochaine occurrence du ${label}.` };
}

function sanitizeUrl(url: string | null): { url: string | null; issue?: Issue } {
  if (!url) return { url: null };
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") {
      return { url: null, issue: { field: "meetingUrl", severity: "warning", message: "Lien ignoré : seuls les liens https sont acceptés." } };
    }
    const known = KNOWN_MEETING_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    return {
      url: u.toString(),
      issue: known
        ? undefined
        : { field: "meetingUrl", severity: "warning", message: `Lien vers un domaine inhabituel (${u.hostname}) : vérifiez-le avant de l'utiliser.` },
    };
  } catch {
    return { url: null, issue: { field: "meetingUrl", severity: "warning", message: "Lien de réunion illisible, ignoré." } };
  }
}

function matchGroup(name: string | null, groups: { id: string; name: string }[] = []): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const hit = groups.find((g) => g.name.toLowerCase().trim() === n);
  return hit?.id ?? null;
}

let keyCounter = 0;

export function toDraft(ev: ExtractedEvent, opts: ValidationOptions, context: string | null = null): EventDraft {
  const tz = ev.timezone && isValidTimezone(ev.timezone) ? ev.timezone : (opts.timezone ?? DEFAULT_TZ);
  const issues: Issue[] = [];
  const uncertain = new Set(ev.uncertainFields);

  // --- Date ---------------------------------------------------------------
  let date: string | null = null;
  let yearSuggestion: EventDraft["yearSuggestion"] = null;
  const { year, month, day, weekday } = ev.date;
  if (month && day) {
    if (year) {
      const dt = DateTime.fromObject({ year, month, day });
      if (!dt.isValid) {
        issues.push({ field: "date", severity: "error", message: `Date impossible : ${ev.date.raw ?? `${day}/${month}/${year}`}.` });
      } else {
        date = dt.toISODate();
        const wd = normalizeWeekday(weekday);
        if (wd !== null && weekdayIndex(year, month, day) !== wd) {
          issues.push({
            field: "date",
            severity: "warning",
            message: `Incohérence : le ${day} ${MONTHS_FR[month - 1]} ${year} est un ${WEEKDAYS_FR[weekdayIndex(year, month, day)!]}, pas un ${WEEKDAYS_FR[wd]}.`,
          });
        }
      }
    } else {
      yearSuggestion = suggestYear({ month, day, weekday }, opts.now, tz);
      if (yearSuggestion) {
        date = DateTime.fromObject({ year: yearSuggestion.year, month, day }).toISODate();
        issues.push({ field: "date", severity: "warning", message: `Année absente de la source. ${yearSuggestion.reason} À confirmer.` });
      } else {
        issues.push({ field: "date", severity: "error", message: "Année absente et impossible à déterminer : saisissez la date complète." });
      }
    }
  } else {
    issues.push({ field: "date", severity: "error", message: "Date absente ou illisible." });
  }

  // --- Heures -------------------------------------------------------------
  if (!ev.startTime) issues.push({ field: "startTime", severity: "error", message: "Heure de début absente de la source." });
  if (!ev.endTime) issues.push({ field: "endTime", severity: "error", message: "Heure de fin absente : indiquez-la ou choisissez une durée." });
  if (ev.startTime && ev.endTime && ev.endTime <= ev.startTime) {
    issues.push({
      field: "endTime",
      severity: "warning",
      message: "L'heure de fin précède l'heure de début : l'événement se termine-t-il le lendemain ? Vérifiez.",
    });
  }
  for (const f of ["startTime", "endTime"] as const) {
    if (uncertain.has(f) && ev[f]) issues.push({ field: f, severity: "warning", message: "Horaire ambigu dans la source, à vérifier." });
  }

  // --- Titre --------------------------------------------------------------
  const title = (ev.title ?? context ?? "").trim();
  if (!title) issues.push({ field: "title", severity: "error", message: "Titre absent : donnez un nom à l'événement." });
  else if (uncertain.has("title")) issues.push({ field: "title", severity: "warning", message: "Titre déduit du contexte, à vérifier." });

  // --- Lien de réunion ----------------------------------------------------
  const { url, issue } = sanitizeUrl(ev.meetingUrl);
  if (issue) issues.push(issue);
  if (url && uncertain.has("meetingUrl")) {
    issues.push({ field: "meetingUrl", severity: "warning", message: "Lien trouvé dans le message mais pas sur la ligne de cet événement : vérifiez qu'il le concerne." });
  }
  if (!url && ev.meetingPlatform) {
    issues.push({
      field: "meetingUrl",
      severity: "info",
      message: `Réunion ${ev.meetingPlatform} mentionnée, mais aucun lien n'est fourni dans la source.`,
    });
  }

  // --- Récurrence ---------------------------------------------------------
  if (ev.recurrenceText) {
    issues.push({ field: "recurrenceRule", severity: "info", message: `Récurrence mentionnée (« ${ev.recurrenceText} ») : à configurer si nécessaire.` });
  }

  const descParts = [
    ev.description,
    ev.notes ? `Remarque : ${ev.notes}` : null,
    ev.meetingPlatform && !url ? `Visioconférence : ${ev.meetingPlatform} (lien à recevoir)` : null,
    ev.organizer ? `Organisateur : ${ev.organizer}` : null,
  ].filter(Boolean);

  const groupId = matchGroup(ev.groupName, opts.groups);
  if (ev.groupName && !groupId) {
    issues.push({ field: "groupId", severity: "info", message: `Groupe mentionné (« ${ev.groupName} ») non trouvé dans vos groupes.` });
  }

  return {
    key: `d${Date.now().toString(36)}${(keyCounter++).toString(36)}`,
    title,
    date,
    startTime: ev.startTime,
    endTime: ev.endTime,
    timezone: tz,
    location: ev.location,
    meetingUrl: url,
    description: descParts.length ? descParts.join("\n") : null,
    groupId,
    recurrenceRule: null,
    confidence: ev.confidence,
    sourceExcerpt: ev.sourceExcerpt,
    issues,
    yearSuggestion,
    confirmed: false,
  };
}

export function validateExtraction(result: ExtractionResult, opts: ValidationOptions): EventDraft[] {
  return result.events.map((e) => toDraft(e, opts, result.contextNotes));
}

/** Un brouillon nécessite-t-il une action de l'utilisateur ? */
export function draftNeedsAttention(d: EventDraft): boolean {
  return d.issues.some((i) => i.severity === "error") || (!d.confirmed && d.issues.some((i) => i.severity === "warning"));
}
