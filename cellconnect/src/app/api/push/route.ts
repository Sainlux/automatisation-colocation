import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { env } from "@/lib/env";
import { unavailable } from "@/lib/errors";
import { audit } from "@/lib/audit";

/** Clé publique VAPID + état de l'abonnement de l'utilisateur. */
export const GET = api(async ({ ctx }) => {
  const subs = await ctx.store.select("push_subscriptions", { where: [["user_id", "eq", ctx.userId], ["disabled_at", "is", null]] });
  return { available: env.push.configured, publicKey: env.push.publicKey ?? null, devices: subs.length };
});

const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Point de terminaison https requis"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Abonne cet appareil (une ligne par navigateur). */
export const POST = api(async ({ req, ctx }) => {
  if (!env.push.configured) throw unavailable("Notifications push non configurées sur ce serveur.");
  const sub = await body(req, subSchema);
  const [existing] = await ctx.store.select("push_subscriptions", { where: [["endpoint", "eq", sub.endpoint]] });
  const row = { user_id: ctx.userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null, disabled_at: null, last_error: null };
  if (existing) await ctx.store.update("push_subscriptions", existing.id, row);
  else await ctx.store.insert("push_subscriptions", { endpoint: sub.endpoint, ...row });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "push.subscribed", entityType: "profile", entityId: ctx.userId });
  return { ok: true };
}, { rateLimit: 10 });

/** Désabonne un appareil (ou tous si aucun endpoint n'est fourni). */
export const DELETE = api(async ({ req, ctx }) => {
  const { endpoint } = await body(req, z.object({ endpoint: z.string().max(1000).nullish() }));
  const subs = await ctx.store.select("push_subscriptions", { where: [["user_id", "eq", ctx.userId]] });
  for (const s of subs) if (!endpoint || s.endpoint === endpoint) await ctx.store.delete("push_subscriptions", s.id);
  return { ok: true };
});
