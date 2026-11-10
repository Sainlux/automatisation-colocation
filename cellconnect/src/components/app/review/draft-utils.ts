import { DateTime } from "luxon";
import { fmtDay, fmtShortDate, fmtTime, fmtTimeRange, frTypo } from "@/components/app/format";

/* ───────────── Types partagés par l'écran de vérification d'un import ───────────── */

export interface Issue {
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface Draft {
  key: string;
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  description: string | null;
  groupId: string | null;
  recurrenceRule: string | null;
  confidence: number;
  sourceExcerpt: string | null;
  issues: Issue[];
  yearSuggestion: { year: number; reason: string } | null;
  confirmed: boolean;
  status?: "pending" | "created" | "rejected";
  eventId?: string | null;
}

export interface DraftConflict {
  draftKey: string;
  kind: "full" | "partial" | "travel_buffer";
  overlapMinutes: number;
  existing?: { id: string; title: string; start: string; end: string; isOrganizer: boolean; groupId: string | null };
  otherDraftKey?: string;
}

export type Choice = "keep_both" | "withdraw_existing" | "skip_new";

export interface Summary {
  created: { key: string; eventId: string; title: string }[];
  skipped: string[];
  withdrawn: { eventId: string; notified: boolean }[];
  conflictsRecorded: number;
  failures: { key: string; message: string }[];
}

export interface GroupOption {
  id: string;
  name: string;
}

/* ───────────── Règles de validation (identiques à la version d'origine) ───────────── */

const CORE_FIELDS = ["title", "date", "startTime", "endTime"];

/** Erreurs bloquantes recalculées en direct à partir des valeurs saisies. */
export function liveErrors(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = "Titre obligatoire.";
  if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) e.date = "Date obligatoire.";
  if (!d.startTime) e.startTime = "Heure de début obligatoire.";
  if (!d.endTime) e.endTime = "Heure de fin obligatoire.";
  if (d.meetingUrl && !/^https:\/\/\S+$/.test(d.meetingUrl)) e.meetingUrl = "Le lien doit commencer par https://";
  return e;
}

export const visibleIssues = (d: Draft) =>
  d.issues.filter((i) => i.severity !== "error" || liveErrors(d)[i.field] !== undefined || !CORE_FIELDS.includes(i.field));

export const needsConfirm = (d: Draft) => d.issues.some((i) => i.severity === "warning");

export const hasErrors = (d: Draft) => Object.keys(liveErrors(d)).length > 0;

/** Une date bloque la suite tant qu'elle a une erreur ou un avertissement non confirmé. */
export const isBlocking = (d: Draft) => hasErrors(d) || (needsConfirm(d) && !d.confirmed);

/** Lecture peu sûre : « À relire » (le pourcentage n'est jamais affiché, seulement lu aux lecteurs d'écran). */
export const isLowConfidence = (d: Draft) => d.confidence < 0.8;

export type DraftStatus = "ready" | "toReview" | "incomplete";

export function draftStatus(d: Draft): DraftStatus {
  if (hasErrors(d)) return "incomplete";
  if (!d.confirmed && (needsConfirm(d) || isLowConfidence(d))) return "toReview";
  return "ready";
}

/** Brouillon envoyé à l'API : sans les champs propres au client, avec les seuls problèmes encore pertinents. */
export function stripClient(d: Draft) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status, eventId, ...rest } = d;
  return { ...rest, issues: visibleIssues(d) };
}

export function conflictId(c: DraftConflict, i: number) {
  return `${c.draftKey}:${c.existing?.id ?? c.otherDraftKey}:${i}`;
}

/* ───────────── Dates et heures ───────────── */

export const isValidDate = (s: string | null): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid);

export function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Durée en minutes entre deux heures « HH:mm » (fin le lendemain si elle précède le début). */
export function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = toMin(end) - toMin(start);
  return Number.isFinite(diff) ? (diff <= 0 ? diff + 1440 : diff) : null;
}

/** Horaire affichable : « 20h30 – 22h00 ». */
export const timeLabel = (d: Pick<Draft, "startTime" | "endTime">) => (d.startTime ? fmtTimeRange(d.startTime, d.endTime) : "Heure à compléter");

/** Début et fin en ISO (UTC) dans le fuseau du brouillon, pour la frise de chevauchement. */
export function draftSpan(d: Draft): { start: string; end: string } | null {
  if (!isValidDate(d.date) || !d.startTime) return null;
  const zone = d.timezone || "Europe/Zurich";
  const s = DateTime.fromISO(`${d.date}T${d.startTime}`, { zone });
  if (!s.isValid) return null;
  let e = d.endTime ? DateTime.fromISO(`${d.date}T${d.endTime}`, { zone }) : s.plus({ hours: 1 });
  if (!e.isValid) return null;
  if (e <= s) e = e.plus({ days: 1 });
  const start = s.toUTC().toISO();
  const end = e.toUTC().toISO();
  return start && end ? { start, end } : null;
}

/** Résumé d'une ligne : « Formation Cellules — lun. 16 nov., 20h30 – 22h00 ». */
export function describe(d: Draft) {
  return `${frTypo(d.title || "Sans titre")} — ${isValidDate(d.date) ? fmtShortDate(d.date) : "date à compléter"}, ${timeLabel(d)}`;
}

/** Titre commun à toutes les dates (affiché une seule fois), sinon null. */
export function commonTitleOf(drafts: Draft[]): string | null {
  if (drafts.length < 2) return null;
  const first = drafts[0].title.trim();
  return first && drafts.every((d) => d.title.trim() === first) ? first : null;
}

/* ───────────── Année déduite ───────────── */

export const YEAR_KIND = "year";

/** Nature d'un problème, pour regrouper ceux qui se répètent sur toutes les dates. */
export function issueKind(d: Draft, i: Issue) {
  if (i.field === "date" && i.severity === "warning" && d.yearSuggestion && i.message.includes(d.yearSuggestion.reason)) return YEAR_KIND;
  return `${i.field}|${i.severity}|${i.message}`;
}

export const hasYearIssue = (d: Draft) => Boolean(d.yearSuggestion) && d.issues.some((i) => issueKind(d, i) === YEAR_KIND);

const WEEKDAY = new Intl.DateTimeFormat("fr-CH", { weekday: "long", timeZone: "UTC" });

/** Deux années possibles pour une date sans année (la proposée et la suivante), avec leur jour de semaine. */
export function yearOptions(d: Draft): { year: number; weekday: string }[] {
  if (!d.yearSuggestion || !isValidDate(d.date)) return [];
  const [, month, day] = d.date.split("-").map(Number);
  return [d.yearSuggestion.year, d.yearSuggestion.year + 1].flatMap((year) => {
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.getUTCMonth() === month - 1 ? [{ year, weekday: WEEKDAY.format(dt) }] : [];
  });
}

export const replaceYear = (date: string, year: number) => `${year}${date.slice(4)}`;

/* ───────────── Avertissements groupés ───────────── */

export interface GroupedIssue {
  kind: string;
  label: string;
  severity: Issue["severity"];
}

/** Problèmes (hors erreurs) présents sur TOUTES les dates sélectionnées : affichés une seule fois. */
export function groupedIssues(selected: Draft[]): GroupedIssue[] {
  if (selected.length < 2) return [];
  const perDraft = selected.map((d) => {
    const m = new Map<string, Issue>();
    for (const i of d.issues) if (i.severity !== "error") m.set(issueKind(d, i), i);
    return m;
  });
  const [first, ...rest] = perDraft;
  return [...first.entries()]
    .filter(([kind]) => rest.every((m) => m.has(kind)))
    .map(([kind, i]) => ({
      kind,
      severity: i.severity,
      label: kind === YEAR_KIND ? "L'année n'était pas écrite dans le message : elle a été déduite du jour de la semaine." : frTypo(i.message),
    }));
}

/** Problèmes propres à une carte : sans les erreurs déjà signalées sous les champs, ni l'année, ni ceux regroupés en haut. */
export function cardIssues(d: Draft, grouped: ReadonlySet<string>) {
  return visibleIssues(d).filter((i) => {
    if (i.severity === "error" && CORE_FIELDS.includes(i.field)) return false;
    const kind = issueKind(d, i);
    return kind !== YEAR_KIND && !grouped.has(kind);
  });
}

/* ───────────── Retrait ───────────── */

/** Aperçu du message poli envoyé par défaut à l'organisateur (l'autre engagement n'est jamais mentionné). */
export const defaultWithdrawMessage = (title: string, startIso: string, tz: string) =>
  `Bonjour, je vous informe que je ne pourrai pas participer à « ${title} » du ${fmtDay(startIso, tz)} à ${fmtTime(startIso, tz)} en raison d'un conflit d'agenda. Merci de votre compréhension.`;

/** Préférence système « réduire les animations ». */
export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");
