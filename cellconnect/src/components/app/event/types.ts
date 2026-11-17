import type { t } from "@/i18n";
import type { EventRow } from "@/lib/types";
import type { OccurrenceInfo } from "./logic";

/** Réponse de GET /api/events/[id] (?occurrence= ajoute l'état de cette date). */
export interface EventDetails {
  event: EventRow;
  group: { id: string; name: string; color: string } | null;
  participants: {
    userId: string;
    name: string;
    role: "organizer" | "participant";
    status: keyof typeof t.participant;
  }[];
  me: { status: keyof typeof t.participant; role: string } | null;
  canEdit: boolean;
  changes: { id: string; change_type: string; created_at: string }[];
  reminders: { id: string; remind_at: string; offset_minutes: number }[];
  defaultWithdrawMessage: string;
  occurrence?: OccurrenceInfo | null;
}

export type Delivery = {
  channel: keyof typeof t.channel;
  status: keyof typeof t.delivery;
  error: string | null;
};

/** Résultat d'une action, affiché en haut de la fiche et annoncé aux lecteurs d'écran. */
export type ActionResult = {
  tone: "success" | "warning" | "danger";
  text: string;
  deliveries?: Delivery[];
};

export type Done = (r: ActionResult) => void;
