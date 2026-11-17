import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { inviteByEmail } from "@/lib/agents/invitation-agent";
import { env } from "@/lib/env";

const schema = z.object({
  emails: z.array(z.string().trim().email("Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch).")).min(1, "Indiquez au moins une adresse e-mail.").max(50, "50 adresses maximum à la fois."),
  eventId: z.string().uuid().nullish(),
  orgRole: z.enum(["org_admin", "group_leader", "member", "guest"]).nullish(),
  groupId: z.string().uuid().nullish(),
});

/** Invitation par e-mail (lien à usage unique) — événement, organisation, et éventuellement groupe. */
export const POST = api(async ({ req, ctx }) => ({ results: await inviteByEmail(ctx, await body(req, schema), env.appUrl) }), { rateLimit: 10 });
