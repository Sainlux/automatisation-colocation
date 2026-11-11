import type { ExtractedEvent, ExtractionResult } from "@/lib/schemas/extraction";
import { normalizeWeekday, weekdayIndex } from "@/lib/time";

/**
 * Analyseur déterministe de texte français (sans IA).
 *
 * Utilisé pour le texte collé et les fichiers .txt, et comme complément de
 * VisionAgent. Il ne déduit jamais une information absente : une année non
 * écrite reste null, une heure de fin absente reste null.
 * Le texte analysé est traité comme une donnée : aucune instruction qu'il
 * contiendrait n'est exécutée.
 */

const MONTHS: [RegExp, number][] = [
  [/^janv/, 1],
  [/^f[ée]vr?/, 2],
  [/^mars/, 3],
  [/^avr/, 4],
  [/^mai/, 5],
  [/^juin/, 6],
  [/^juil/, 7],
  [/^ao[uû]t?/, 8],
  [/^sept?/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^d[ée]c/, 12],
];

const WEEKDAY = "(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\\.?";
const MONTH = "(janvier|janv|f[ée]vrier|f[ée]vr|f[ée]v|mars|avril|avr|mai|juin|juillet|juil|ao[uû]t|septembre|sept|octobre|oct|novembre|nov|d[ée]cembre|d[ée]c)\\.?";

const TEXT_DATE = new RegExp(`(?:\\b${WEEKDAY}\\s+)?\\b(\\d{1,2})(?:er)?\\s+${MONTH}(?:\\s+(\\d{4}))?`, "iu");
const NUM_DATE = new RegExp(`(?:\\b${WEEKDAY}\\s+)?\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{4}|\\d{2}))?\\b`, "iu");
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/u;
const TIME = /\b([01]?\d|2[0-3])\s*(?:h|heures?|:)\s*([0-5]\d)?(?![\d])/giu;
const RANGE_SEP = /^\s*(?:-|–|—|à|a|au|jusqu'?à|jusqu’à|>)\s*$/iu;
const URL = /https?:\/\/[^\s<>"')]+/giu;
const PLATFORMS: [RegExp, string][] = [
  [/\bzoom\b/iu, "Zoom"],
  [/\bgoogle\s*meet\b|\bmeet\.google\b/iu, "Google Meet"],
  [/\bteams\b/iu, "Microsoft Teams"],
];
const RECURRENCE = /\b(tous les|toutes les|chaque)\s+[\p{L}]+(?:\s+[\p{L}]+)?/iu;
const LOCATION = /\b(?:lieu|adresse|où)\s*:\s*(.+)$/iu;

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase();
  for (const [re, n] of MONTHS) if (re.test(w)) return n;
  return null;
}

interface DateMatch {
  year: number | null;
  month: number;
  day: number;
  weekday: string | null;
  raw: string;
  index: number;
}

function findDate(line: string): DateMatch | null {
  const iso = ISO_DATE.exec(line);
  if (iso) {
    return { year: +iso[1], month: +iso[2], day: +iso[3], weekday: null, raw: iso[0], index: iso.index };
  }
  const t = TEXT_DATE.exec(line);
  if (t) {
    const month = monthFromWord(t[3]);
    const day = +t[2];
    if (month && day >= 1 && day <= 31) {
      return { year: t[4] ? +t[4] : null, month, day, weekday: t[1] ?? null, raw: t[0], index: t.index };
    }
  }
  const n = NUM_DATE.exec(line);
  if (n) {
    const day = +n[2];
    const month = +n[3];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year: number | null = n[4] ? +n[4] : null;
      if (year !== null && year < 100) year += 2000;
      return { year, month, day, weekday: n[1] ?? null, raw: n[0], index: n.index };
    }
  }
  return null;
}

function fmt(h: string, m: string | undefined) {
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

function findTimes(line: string): { start: string | null; end: string | null; spans: [number, number][] } {
  const matches = [...line.matchAll(TIME)];
  if (matches.length === 0) return { start: null, end: null, spans: [] };
  const spans = matches.map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
  const start = fmt(matches[0][1], matches[0][2]);
  let end: string | null = null;
  if (matches.length >= 2) {
    const between = line.slice(spans[0][1], spans[1][0]);
    if (RANGE_SEP.test(between)) end = fmt(matches[1][1], matches[1][2]);
  }
  return { start, end, spans };
}

const CONNECTORS = "le|la|les|de|du|des|d'|à|a|au|aux|dès|entre|et|jusqu'?à|jusqu’à|from|to|-|–|—";
const AROUND_CUT = new RegExp(`(?:(?:^|\\s)(?:${CONNECTORS}))*\\s*§(?:\\s*(?:${CONNECTORS})(?=\\s|§|$))*`, "giu");

function cleanResidual(s: string): string {
  return s
    .replace(AROUND_CUT, " ")
    .replace(/§/g, " ")
    .replace(/^\s*(?:\d{1,2}[.)]|[-•*–])\s+/u, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,:;.\-–—]+|[\s,:;.\-–—]+$/gu, "")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function extractParentheses(s: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const text = s.replace(/\(([^)]*)\)/gu, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  return { text, notes };
}

function detectPlatform(s: string): string | null {
  for (const [re, name] of PLATFORMS) if (re.test(s)) return name;
  return null;
}

export function parseFrenchText(input: string): ExtractionResult {
  const text = input.replace(/ | /g, " ").replace(/\r\n?/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const events: ExtractedEvent[] = [];
  const warnings: string[] = [];
  let heading: string | null = null;
  let lastWasEvent = false;
  const allUrls = [...text.matchAll(URL)].map((m) => m[0]);

  for (const line of lines) {
    const date = findDate(line);
    if (!date) {
      const times = findTimes(line);
      const prev = events.at(-1);
      // Heure sur la ligne suivant une date sans heure.
      if (prev && lastWasEvent && times.start && !prev.startTime) {
        prev.startTime = times.start;
        prev.endTime = times.end;
        prev.uncertainFields = prev.uncertainFields.filter((f) => f !== "startTime");
        if (!times.end && !prev.uncertainFields.includes("endTime")) prev.uncertainFields.push("endTime");
        continue;
      }
      // Ligne de continuation, ex. « (⚠️ vacances) » sous un élément de liste.
      if (prev && lastWasEvent && /^\(.*\)$/u.test(line)) {
        const note = line.slice(1, -1).trim();
        prev.notes = prev.notes ? `${prev.notes} · ${note}` : note;
        continue;
      }
      const loc = LOCATION.exec(line);
      if (loc && prev && lastWasEvent) {
        prev.location = loc[1].trim().slice(0, 300);
        continue;
      }
      // Sinon : ligne d'en-tête / contexte pour les dates suivantes.
      if (!/^https?:\/\//iu.test(line) && line.length <= 200) heading = cleanResidual(line.replace(/:\s*$/u, ""));
      lastWasEvent = false;
      continue;
    }

    const times = findTimes(line);
    // Résidu = ligne sans la date ni les heures, pour en tirer un titre.
    const cut: [number, number][] = ([[date.index, date.index + date.raw.length], ...times.spans] as [number, number][]).sort((a, b) => a[0] - b[0]);
    let residual = "";
    let pos = 0;
    for (const [s, e] of cut) {
      if (s >= pos) residual += line.slice(pos, s) + " § ";
      pos = Math.max(pos, e);
    }
    residual += line.slice(pos);
    const urls = [...residual.matchAll(URL)].map((m) => m[0]);
    residual = residual.replace(URL, " ");
    const { text: withoutParens, notes } = extractParentheses(residual);
    const loc = LOCATION.exec(withoutParens);
    const titleCandidate = cleanResidual(loc ? withoutParens.slice(0, loc.index) : withoutParens);
    const hasOwnTitle = titleCandidate.replace(/[^\p{L}]/gu, "").length >= 3;
    const title = hasOwnTitle ? titleCandidate : heading;

    const uncertain: string[] = [];
    if (date.year === null) uncertain.push("date");
    if (!times.start) uncertain.push("startTime");
    if (!times.end) uncertain.push("endTime");
    if (!title) uncertain.push("title");

    let meetingUrl: string | null = urls[0] ?? null;
    if (!meetingUrl && allUrls.length === 1) {
      meetingUrl = allUrls[0];
      uncertain.push("meetingUrl");
    }

    const weekdayOk =
      date.weekday === null ||
      date.year === null ||
      normalizeWeekday(date.weekday) === weekdayIndex(date.year, date.month, date.day);
    if (!weekdayOk) uncertain.push("date");

    const missing = uncertain.length;
    events.push({
      title: title ?? null,
      date: { year: date.year, month: date.month, day: date.day, weekday: date.weekday, raw: date.raw },
      startTime: times.start,
      endTime: times.end,
      timezone: null,
      location: loc ? loc[1].trim().slice(0, 300) : null,
      meetingUrl,
      meetingPlatform: detectPlatform(line) ?? (heading ? detectPlatform(heading) : null),
      organizer: null,
      groupName: null,
      description: hasOwnTitle && heading ? heading : null,
      notes: notes.length ? notes.join(" · ") : null,
      recurrenceText: RECURRENCE.exec(line)?.[0] ?? null,
      confidence: Math.max(0.3, 0.9 - missing * 0.12),
      uncertainFields: [...new Set(uncertain)],
      sourceExcerpt: line.slice(0, 500),
    });
    lastWasEvent = true;
  }

  if (events.length === 0) warnings.push("Aucune date n'a été reconnue dans le texte.");
  return { events, contextNotes: heading, warnings };
}
