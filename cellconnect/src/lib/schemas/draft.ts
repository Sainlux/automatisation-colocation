import { z } from "zod";
import { isValidIsoDate, isValidTimezone } from "@/lib/time";
import { timeString } from "./extraction";

/**
 * Brouillon d'événement soumis à la validation de l'utilisateur
 * (produit par ValidationAgent, corrigé dans l'interface).
 */

export const issueSchema = z.object({
  field: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
});

export const draftSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().trim().max(200),
  date: z.string().nullable(),
  startTime: timeString.nullable(),
  endTime: timeString.nullable(),
  timezone: z.string().refine(isValidTimezone, "Fuseau horaire invalide"),
  location: z.string().max(300).nullable(),
  meetingUrl: z.string().max(500).nullable(),
  description: z.string().max(4000).nullable(),
  groupId: z.string().uuid().nullable(),
  recurrenceRule: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(500).nullable(),
  issues: z.array(issueSchema),
  yearSuggestion: z.object({ year: z.number().int(), reason: z.string() }).nullable(),
  /** L'utilisateur a explicitement confirmé les champs incertains. */
  confirmed: z.boolean(),
});

export type Issue = z.infer<typeof issueSchema>;
export type EventDraft = z.infer<typeof draftSchema>;

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "Le lien doit commencer par https://");

/** Brouillon prêt à être enregistré : tous les champs obligatoires sont présents. */
export const readyDraftSchema = draftSchema.extend({
  title: z.string().trim().min(1, "Titre obligatoire").max(200),
  date: z.string().refine(isValidIsoDate, "Date invalide (AAAA-MM-JJ)"),
  startTime: timeString,
  endTime: timeString,
  meetingUrl: httpsUrl.nullable(),
});

export type ReadyDraft = z.infer<typeof readyDraftSchema>;

/** Décisions de l'utilisateur face aux conflits détectés pour un brouillon. */
export const draftDecisionSchema = z.object({
  key: z.string(),
  /** create : créer ; skip : ne pas créer. */
  action: z.enum(["create", "skip"]),
  /** Événements existants dont l'utilisateur se désiste au profit de celui-ci. */
  withdrawFrom: z.array(z.string().uuid()).default([]),
  notifyOrganizers: z.boolean().default(false),
  withdrawMessage: z.string().max(1000).nullable().default(null),
});

export type DraftDecision = z.infer<typeof draftDecisionSchema>;
