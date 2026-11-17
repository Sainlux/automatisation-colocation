/**
 * Règles d'affichage pures (sans React) de la fiche événement et des pages secondaires.
 * Testées dans tests/unit/pages-secondaires.test.ts.
 */
import { REMINDER_LIMITS } from "@/lib/schemas/reminder";

/* ───────────── Date affichée sur la fiche ───────────── */

export interface OccurrenceInfo {
  /** Début d'origine selon la règle (clé de la date). */
  originalStart: string;
  start: string;
  end: string;
  status: "scheduled" | "moved" | "cancelled";
}

const validIso = (v: string | null | undefined): v is string => typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v));

/**
 * Horaire effectif de la fiche :
 * 1. l'état de la date renvoyé par le serveur (déplacée : nouvel horaire) ;
 * 2. sinon `start` de l'adresse (date déplacée ouverte depuis une liste) ;
 * 3. sinon `occurrence` de l'adresse (date prévue d'une série), avec la durée de l'événement ;
 * 4. sinon l'horaire de l'événement.
 */
export function effectiveTimes(
  event: { starts_at: string; ends_at: string },
  occurrence: OccurrenceInfo | null | undefined,
  params: { occurrence?: string; start?: string } = {},
): { startIso: string; endIso: string } {
  if (occurrence && validIso(occurrence.start) && validIso(occurrence.end)) return { startIso: occurrence.start, endIso: occurrence.end };
  const duration = Date.parse(event.ends_at) - Date.parse(event.starts_at);
  const from = validIso(params.start) ? params.start : validIso(params.occurrence) ? params.occurrence : null;
  if (!from) return { startIso: event.starts_at, endIso: event.ends_at };
  const s = Date.parse(from);
  return { startIso: new Date(s).toISOString(), endIso: new Date(s + duration).toISOString() };
}

/* ───────────── Rappels ───────────── */

export type ReminderUnit = "minutes" | "hours" | "days";
export const REMINDER_UNITS: { value: ReminderUnit; label: string; minutes: number }[] = [
  { value: "minutes", label: "minutes", minutes: 1 },
  { value: "hours", label: "heures", minutes: 60 },
  { value: "days", label: "jours", minutes: 1440 },
];

export const REMINDER_RANGE_ERROR = "Choisissez un rappel entre 5 minutes et 4 semaines avant le début.";
export const REMINDER_COUNT_ERROR = `${REMINDER_LIMITS.count} rappels au plus : retirez-en un avant d'en ajouter un autre.`;

/**
 * Rappel saisi « [nombre] [unité] avant » → minutes.
 * Champ vide : `{ minutes: null }` (rien à ajouter). Valeur hors limites : `{ error }`.
 */
export function parseCustomReminder(amount: string, unit: ReminderUnit): { minutes: number | null; error?: string } {
  const raw = amount.trim().replace(",", ".");
  if (!raw) return { minutes: null };
  const n = Number(raw);
  const factor = REMINDER_UNITS.find((u) => u.value === unit)?.minutes ?? 1;
  const minutes = Math.round(n * factor);
  if (!Number.isFinite(n) || n <= 0 || minutes < REMINDER_LIMITS.min || minutes > REMINDER_LIMITS.max) return { minutes: null, error: REMINDER_RANGE_ERROR };
  return { minutes };
}

/** Liste finale envoyée au serveur (triée, sans doublon), ou une erreur à afficher. */
export function finalReminders(selected: readonly number[], custom: number | null): { offsets: number[]; error?: string } {
  const offsets = [...new Set([...selected, ...(custom !== null ? [custom] : [])])].sort((a, b) => b - a);
  if (offsets.some((o) => o < REMINDER_LIMITS.min || o > REMINDER_LIMITS.max)) return { offsets, error: REMINDER_RANGE_ERROR };
  if (offsets.length > REMINDER_LIMITS.count) return { offsets, error: REMINDER_COUNT_ERROR };
  return { offsets };
}

/* ───────────── Notifications ───────────── */

export interface NotificationData {
  url?: string;
  eventId?: string;
  conflictId?: string;
  invitationId?: string;
  occurrenceStart?: string;
}

/** Chemin interne sûr : commence par « / », mais ni « // » ni « /\ » (adresses externes déguisées). */
export const isInternalPath = (v: unknown): v is string => typeof v === "string" && /^\/(?![/\\])/.test(v);

/** Lien d'une notification : data.url interne, sinon le conflit, sinon l'événement (à la bonne date). */
export function notificationHref(data: NotificationData | null | undefined): string | null {
  if (!data) return null;
  if (isInternalPath(data.url)) return data.url;
  if (data.conflictId) return `/conflits#conflit-${encodeURIComponent(data.conflictId)}`;
  if (data.eventId) {
    const q = data.occurrenceStart ? `?occurrence=${encodeURIComponent(data.occurrenceStart)}` : "";
    return `/evenements/${encodeURIComponent(data.eventId)}${q}`;
  }
  return null;
}

/** Retire la dernière ligne du texte quand ce n'est qu'une adresse (le lien est déjà sur la carte). */
export function stripTrailingUrl(body: string): string {
  const lines = body.replace(/\s+$/, "").split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (lines.length && /^(https?:\/\/|\/)\S*$/.test(last)) lines.pop();
  return lines.join("\n").trim();
}

/* ───────────── Historique ───────────── */

export const HISTORY_LABELS: Record<string, string> = {
  "account.created": "Compte créé",
  "auth.login": "Connexion",
  "extraction.started": "Message importé",
  "upload.deleted": "Fichiers du message importé supprimés",
  "event.created": "Événement créé",
  "event.updated": "Événement modifié",
  "event.rescheduled": "Horaire modifié",
  "event.cancelled": "Événement annulé (pour tous)",
  "events.batch_committed": "Dates ajoutées depuis un message importé",
  "occurrence.cancel": "Une date annulée",
  "occurrence.move": "Une date déplacée",
  "occurrence.restore": "Une date rétablie",
  "participant.withdrawn": "Retrait d'un événement",
  "invitation.sent": "Invitations envoyées",
  "invitation.created": "Invitation par e-mail préparée",
  "invitation.email_sent": "Invitation envoyée par e-mail",
  "invitation.accepted": "Invitation acceptée",
  "invitation.declined": "Invitation refusée",
  "invitation.tentative": "Réponse « peut-être »",
  "conflict.keep_a": "Conflit réglé (un des deux événements gardé)",
  "conflict.keep_b": "Conflit réglé (un des deux événements gardé)",
  "conflict.keep_both": "Conflit accepté (les deux gardés)",
  "conflict.postpone": "Décision reportée",
  "conflict.propose_slot": "Autre créneau proposé",
  "conflict.request_change": "Changement demandé",
  "group.created": "Groupe créé",
  "group.updated": "Groupe modifié",
  "group.deleted": "Groupe supprimé",
  "group.member_added": "Membre ajouté au groupe",
  "group.member_removed": "Membre retiré du groupe",
  "org.created": "Église créée",
  "org.member_added": "Membre ajouté à l'église",
  "org.role_changed": "Rôle modifié",
  "profile.updated": "Paramètres modifiés",
  "calendar.connected": "Calendrier connecté",
  "calendar.disconnected": "Calendrier déconnecté",
  "inbound.email": "Message reçu par e-mail",
  "inbound.telegram": "Message reçu par Telegram",
  "inbound.telegram_linked": "Telegram relié au compte",
  "meeting.created": "Réunion en ligne créée",
  "push.subscribed": "Notifications activées sur un téléphone",
  "retention.purged": "Nettoyage automatique des anciennes données",
};

export const HISTORY_FALLBACK = "Autre action";

/** Libellé lisible d'une action ; jamais le code brut. */
export const historyLabel = (action: string) => HISTORY_LABELS[action] ?? HISTORY_FALLBACK;

/** Lien vers l'élément concerné, quand il a pu être nommé (événement ou groupe). */
export function historyHref(log: { entity_type: string; entity_id: string | null; title?: string | null; action?: string }): string | null {
  if (!log.entity_id || !log.title) return null;
  if (log.entity_type === "event" && log.action !== "event.deleted") return `/evenements/${encodeURIComponent(log.entity_id)}`;
  if (log.entity_type === "group" && log.action !== "group.deleted") return `/groupes/${encodeURIComponent(log.entity_id)}`;
  return null;
}

/* ───────────── Partage d'un lien d'invitation ───────────── */

/** Texte du message WhatsApp qui accompagne un lien d'invitation transmis à la main. */
export const inviteShareText = (link: string, what?: string | null) =>
  `${what ? `Je vous invite à « ${what} » sur CellConnect.` : "Je vous invite à rejoindre notre église sur CellConnect."}\nOuvrez ce lien pour répondre (valable 30 jours) :\n${link}`;

/** Adresses saisies (séparées par virgules, points-virgules, espaces ou retours à la ligne). */
export const splitEmails = (raw: string) => [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
