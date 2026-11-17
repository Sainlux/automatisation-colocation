import { z } from "zod";

/**
 * Règles des délais de rappel, partagées par le serveur et l'interface.
 * Aucun import serveur ici : ce module peut être utilisé côté navigateur.
 */

/** Délais en minutes : 5 min au minimum, 4 semaines au maximum, 6 délais au plus. */
export const REMINDER_LIMITS = { min: 5, max: 40320, count: 6 } as const;

/** Délais par défaut : la veille (24 h), 2 h avant et 30 min avant. */
export const DEFAULT_REMINDER_OFFSETS: number[] = [1440, 120, 30];

export const reminderOffsetsSchema = z.array(z.number().int().min(REMINDER_LIMITS.min).max(REMINDER_LIMITS.max)).max(REMINDER_LIMITS.count);
