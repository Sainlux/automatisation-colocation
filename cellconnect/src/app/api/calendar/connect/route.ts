import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { buildAuthUrl } from "@/lib/integrations/oauth";

/** Démarre la connexion OAuth d'un service externe ; renvoie l'URL d'autorisation. */
export const POST = api(async ({ req, ctx }) => {
  const { provider } = await body(req, z.object({ provider: z.enum(["google", "outlook", "zoom"]) }));
  return { url: buildAuthUrl(provider, ctx.userId, ctx.orgId) };
});
