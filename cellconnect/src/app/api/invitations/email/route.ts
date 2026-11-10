import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { inviteByEmail } from "@/lib/agents/invitation-agent";
import { env } from "@/lib/env";

const schema = z.object({
  emails: z.array(z.string().trim().email("E-mail invalide")).min(1).max(50),
  eventId: z.string().uuid().nullish(),
  orgRole: z.enum(["org_admin", "group_leader", "member", "guest"]).nullish(),
});

/** Invitation par e-mail (lien à usage unique) — événement ou organisation. */
export const POST = api(async ({ req, ctx }) => ({ results: await inviteByEmail(ctx, await body(req, schema), env.appUrl) }), { rateLimit: 20 });
