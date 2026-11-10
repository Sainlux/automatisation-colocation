import { z } from "zod";
import { rrulestr } from "rrule";
import { isValidIsoDate, isValidTimezone } from "@/lib/time";
import { timeString } from "./extraction";

export const rruleSchema = z
  .string()
  .max(300)
  .refine((r) => {
    if (!/^(RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+\-:]+)*$/i.test(r)) return false;
    try {
      rrulestr(r.replace(/^RRULE:/i, ""));
      return true;
    } catch {
      return false;
    }
  }, "Règle de récurrence invalide (format RRULE attendu, ex. FREQ=WEEKLY;BYDAY=MO)");

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("Lien invalide")
  .refine((u) => u.startsWith("https://"), "Le lien doit commencer par https://");

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, "Titre obligatoire").max(200),
  description: z.string().max(4000).nullish(),
  location: z.string().max(300).nullish(),
  meetingUrl: httpsUrl.nullish(),
  date: z.string().refine(isValidIsoDate, "Date invalide"),
  startTime: timeString,
  endTime: timeString,
  timezone: z.string().refine(isValidTimezone, "Fuseau horaire invalide").default("Europe/Zurich"),
  recurrenceRule: rruleSchema.nullish(),
  groupId: z.string().uuid().nullish(),
  visibility: z.enum(["private", "group", "organization"]).optional(),
  /** Inviter automatiquement les membres du groupe (responsables uniquement). */
  inviteGroup: z.boolean().optional(),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const eventPatchSchema = eventInputSchema
  .omit({ inviteGroup: true })
  .partial()
  .extend({ expectedVersion: z.number().int().optional(), notifyParticipants: z.boolean().default(true) });

export type EventPatch = z.infer<typeof eventPatchSchema>;
