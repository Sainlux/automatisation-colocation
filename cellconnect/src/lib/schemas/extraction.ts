import { z } from "zod";

/**
 * Schéma de sortie de VisionAgent.
 *
 * Les dates sont PARTIELLES : chaque composante (année, mois, jour) peut être
 * inconnue (null). Rien n'est déduit à ce stade — la complétion éventuelle
 * (année manquante, par exemple) est faite et justifiée par ValidationAgent,
 * puis confirmée par l'utilisateur.
 */

const nullableString = (max: number) => z.string().max(max).nullable();

export const partialDateSchema = z.object({
  year: z.number().int().min(1900).max(2200).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  day: z.number().int().min(1).max(31).nullable(),
  /** Jour de semaine tel qu'écrit dans la source (« Lundi »), sans interprétation. */
  weekday: nullableString(20),
  /** Texte brut de la date dans la source. */
  raw: nullableString(120),
});

export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:mm attendu");

export const extractedEventSchema = z.object({
  title: nullableString(200),
  date: partialDateSchema,
  startTime: timeString.nullable(),
  endTime: timeString.nullable(),
  timezone: nullableString(64),
  location: nullableString(300),
  meetingUrl: nullableString(500),
  /** Plateforme de visioconférence mentionnée sans lien (ex. « Zoom »). */
  meetingPlatform: nullableString(40),
  organizer: nullableString(120),
  groupName: nullableString(120),
  description: nullableString(2000),
  /** Instructions particulières (« ⚠️ vacances », « apporter un repas »…). */
  notes: nullableString(500),
  /** Récurrence telle qu'écrite (« tous les mardis »), non interprétée. */
  recurrenceText: nullableString(200),
  confidence: z.number().min(0).max(1),
  uncertainFields: z.array(z.string().max(40)).max(20),
  sourceExcerpt: nullableString(500),
});

export const extractionResultSchema = z.object({
  events: z.array(extractedEventSchema).max(50),
  /** Contexte général (ex. titre commun à une liste de dates). */
  contextNotes: nullableString(1000),
  warnings: z.array(z.string().max(300)).max(20),
});

export type PartialDate = z.infer<typeof partialDateSchema>;
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** JSON Schema strict équivalent, transmis au modèle (sorties structurées). */
const ns = (maxLength?: number) => ({ type: ["string", "null"], ...(maxLength ? { maxLength } : {}) });
export const extractionJsonSchema = {
  name: "cellconnect_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["events", "contextNotes", "warnings"],
    properties: {
      contextNotes: ns(),
      warnings: { type: "array", items: { type: "string" } },
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "date",
            "startTime",
            "endTime",
            "timezone",
            "location",
            "meetingUrl",
            "meetingPlatform",
            "organizer",
            "groupName",
            "description",
            "notes",
            "recurrenceText",
            "confidence",
            "uncertainFields",
            "sourceExcerpt",
          ],
          properties: {
            title: ns(),
            date: {
              type: "object",
              additionalProperties: false,
              required: ["year", "month", "day", "weekday", "raw"],
              properties: {
                year: { type: ["integer", "null"] },
                month: { type: ["integer", "null"] },
                day: { type: ["integer", "null"] },
                weekday: ns(),
                raw: ns(),
              },
            },
            startTime: { ...ns(), description: "HH:mm (24h) ou null si absent" },
            endTime: { ...ns(), description: "HH:mm (24h) ou null si absent" },
            timezone: ns(),
            location: ns(),
            meetingUrl: { ...ns(), description: "URL exacte présente dans la source, sinon null" },
            meetingPlatform: ns(),
            organizer: ns(),
            groupName: ns(),
            description: ns(),
            notes: ns(),
            recurrenceText: ns(),
            confidence: { type: "number" },
            uncertainFields: { type: "array", items: { type: "string" } },
            sourceExcerpt: ns(),
          },
        },
      },
    },
  },
} as const;
