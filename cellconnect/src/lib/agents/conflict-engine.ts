import { DateTime } from "luxon";
import { RRule, rrulestr } from "rrule";
import type { ConflictKind } from "@/lib/types";

/**
 * Moteur pur de détection de chevauchements (utilisé par ConflictManagerAgent).
 *
 * Deux créneaux A et B se chevauchent si  startA < endB && startB < endA,
 * comparés en instants UTC (millisecondes). Deux événements consécutifs
 * (fin de A == début de B) ne se chevauchent PAS. Un temps de déplacement
 * optionnel signale les créneaux trop rapprochés (kind = "travel_buffer").
 */

export interface SlotSource {
  eventId: string;
  title: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  timezone: string;
  recurrenceRule?: string | null;
  allDay?: boolean;
}

export interface Occurrence {
  eventId: string;
  title: string;
  start: number;
  end: number;
}

export interface Overlap {
  a: Occurrence;
  b: Occurrence;
  overlapMinutes: number;
  kind: ConflictKind;
}

export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

const MAX_OCCURRENCES = 500;

/**
 * Développe un événement (éventuellement récurrent) en occurrences dans la
 * fenêtre [from, to]. La récurrence est calculée en heure murale du fuseau
 * de l'événement : une réunion à 20h30 reste à 20h30 après le passage à
 * l'heure d'été (l'instant UTC, lui, change).
 */
export function expandOccurrences(src: SlotSource, from: number, to: number): Occurrence[] {
  const start = Date.parse(src.startsAt);
  const end = Date.parse(src.endsAt);
  const duration = end - start;
  if (!src.recurrenceRule) {
    return overlaps(start, end, from, to) ? [{ eventId: src.eventId, title: src.title, start, end }] : [];
  }

  const local = DateTime.fromMillis(start, { zone: src.timezone });
  // rrule travaille en « UTC flottant » : on encode l'heure murale comme si elle était UTC.
  const floatingStart = new Date(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second));
  let rule: RRule;
  try {
    const parsed = rrulestr(src.recurrenceRule.replace(/^RRULE:/i, ""), { dtstart: floatingStart });
    rule = parsed instanceof RRule ? parsed : new RRule({ ...(parsed as unknown as RRule).options, dtstart: floatingStart });
  } catch {
    // Règle invalide : on se rabat sur la première occurrence.
    return overlaps(start, end, from, to) ? [{ eventId: src.eventId, title: src.title, start, end }] : [];
  }

  const toFloating = (ms: number) => {
    const d = DateTime.fromMillis(ms, { zone: src.timezone });
    return new Date(Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second));
  };
  const out: Occurrence[] = [];
  const dates = rule.between(toFloating(from - duration - 86400000), toFloating(to + 86400000), true);
  for (const f of dates.slice(0, MAX_OCCURRENCES)) {
    const wall = DateTime.fromObject(
      {
        year: f.getUTCFullYear(),
        month: f.getUTCMonth() + 1,
        day: f.getUTCDate(),
        hour: f.getUTCHours(),
        minute: f.getUTCMinutes(),
        second: f.getUTCSeconds(),
      },
      { zone: src.timezone },
    );
    const s = wall.toMillis();
    const e = s + duration;
    if (overlaps(s, e, from, to)) out.push({ eventId: src.eventId, title: src.title, start: s, end: e });
  }
  return out;
}

/**
 * Compare des occurrences candidates à des occurrences existantes.
 * @param bufferMinutes temps de déplacement minimal entre deux événements.
 */
export function findOverlaps(candidates: Occurrence[], existing: Occurrence[], bufferMinutes = 0): Overlap[] {
  const buffer = Math.max(0, bufferMinutes) * 60000;
  const out: Overlap[] = [];
  const sorted = [...existing].sort((x, y) => x.start - y.start);
  for (const a of candidates) {
    for (const b of sorted) {
      if (b.start >= a.end + buffer) break;
      if (a.eventId === b.eventId && a.start === b.start) continue;
      if (overlaps(a.start, a.end, b.start, b.end)) {
        const minutes = Math.round((Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000);
        const full = (a.start <= b.start && a.end >= b.end) || (b.start <= a.start && b.end >= a.end);
        out.push({ a, b, overlapMinutes: minutes, kind: full ? "full" : "partial" });
      } else if (buffer > 0 && overlaps(a.start - buffer, a.end + buffer, b.start, b.end)) {
        out.push({ a, b, overlapMinutes: 0, kind: "travel_buffer" });
      }
    }
  }
  return out;
}

/** Détecte les chevauchements à l'intérieur d'un même ensemble (ex. brouillons entre eux). */
export function findInternalOverlaps(occ: Occurrence[], bufferMinutes = 0): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < occ.length; i++) {
    out.push(...findOverlaps([occ[i]], occ.slice(i + 1), bufferMinutes).filter((o) => o.a.eventId !== o.b.eventId));
  }
  return out;
}
