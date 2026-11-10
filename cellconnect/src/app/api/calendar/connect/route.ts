import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { unavailable } from "@/lib/errors";
import { buildAuthUrl } from "@/lib/integrations/google-calendar";

/** Démarre la connexion OAuth d'un calendrier externe ; renvoie l'URL d'autorisation. */
export const POST = api(async ({ req, ctx }) => {
  const { provider } = await body(req, z.object({ provider: z.enum(["google", "outlook"]) }));
  if (provider === "outlook") throw unavailable("La connexion Outlook (Microsoft Graph) est prévue pour une version ultérieure.");
  return { url: buildAuthUrl(ctx.userId, ctx.orgId) };
});
