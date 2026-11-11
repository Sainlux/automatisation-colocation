import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { getStore } from "@/lib/db";
import { acceptInvitationToken, previewInvitation } from "@/lib/agents/invitation-agent";
import { getSessionUser, setActiveOrg } from "@/lib/auth/session";
import { smtpSender } from "@/lib/channels/email";
import { unauthorized } from "@/lib/errors";

/** Aperçu public minimal d'une invitation (aucune donnée personnelle hormis le prénom de l'expéditeur). */
export const GET = api(async ({ params }) => previewInvitation(getStore(), params.token), { auth: false, rateLimit: 30 });

/** Réponse à l'invitation par l'utilisateur connecté (rejoint l'organisation puis l'événement). */
export const POST = api(
  async ({ req, params }) => {
    const user = await getSessionUser();
    if (!user) throw unauthorized("Connectez-vous ou créez un compte pour répondre.");
    const { response } = await body(req, z.object({ response: z.enum(["accepted", "declined", "tentative"]) }));
    const store = getStore();
    const profile = await store.get("profiles", user.id);
    const r = await acceptInvitationToken(
      { store, userId: user.id, email: user.email, mailer: smtpSender, now: () => new Date(), timezone: profile?.timezone ?? "Europe/Zurich" },
      params.token,
      response,
    );
    if (r.organizationId) await setActiveOrg(r.organizationId);
    return r;
  },
  { auth: false, rateLimit: 10 },
);
