import { api } from "@/lib/http/api";
import { pullAllConnections, tick } from "@/lib/worker";

/** Synchronisation manuelle : envoie les modifications en attente puis importe les événements externes. */
export const POST = api(async ({ ctx }) => {
  const push = await tick(ctx.store, ctx.mailer);
  const pull = await pullAllConnections(ctx.store, ctx.mailer, ctx.userId);
  return { pushed: push.syncs, pushErrors: push.syncErrors, imported: pull.pulled };
}, { rateLimit: 6 });
