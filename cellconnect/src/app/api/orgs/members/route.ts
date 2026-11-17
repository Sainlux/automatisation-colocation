import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { addOrgMemberByEmail, listOrgMembers } from "@/lib/agents/group-agent";

export const GET = api(async ({ ctx }) => ({ members: await listOrgMembers(ctx) }));

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch)."),
  role: z.enum(["org_admin", "group_leader", "member", "guest"]).default("member"),
});

/**
 * Ajout d'un membre : envoie toujours une invitation (lien à usage unique).
 * Réponse identique que l'adresse corresponde à un compte ou non.
 */
export const POST = api(
  async ({ req, ctx }) => {
    const { email, role } = await body(req, schema);
    return addOrgMemberByEmail(ctx, email, role, env.appUrl);
  },
  { rateLimit: 10 },
);
