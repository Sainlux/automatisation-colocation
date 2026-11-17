import { api } from "@/lib/http/api";
import type { Ctx } from "@/lib/context";
import { errMsg } from "@/lib/errors";
import { withExceptions } from "@/lib/agents/conflict-agent";
import { pullAllConnections } from "@/lib/worker";

/** Nombre maximal d'envois traités par demande manuelle (le reste part au prochain passage du worker). */
const MAX_TASKS = 20;

/**
 * Envoie les modifications en attente DE L'UTILISATEUR vers ses calendriers
 * connectés. Chaque tâche est réservée (pending → running) de façon atomique,
 * pour ne jamais être traitée en même temps par le worker.
 */
async function pushMyPendingSyncs(ctx: Ctx) {
  const now = ctx.now();
  const tasks = await ctx.store.select("agent_tasks", {
    where: [["user_id", "eq", ctx.userId], ["status", "eq", "pending"], ["run_after", "lte", now.toISOString()]],
    order: [{ column: "run_after" }],
    limit: MAX_TASKS,
  });
  let pushed = 0;
  let errors = 0;
  for (const t of tasks.filter((x) => x.type.startsWith("sync."))) {
    const [claimed] = await ctx.store.updateWhere("agent_tasks", [["id", "eq", t.id], ["status", "eq", "pending"]], {
      status: "running",
      attempts: t.attempts + 1,
      updated_at: now.toISOString(),
    });
    if (!claimed) continue;
    try {
      const { connectionId, eventId } = t.input as { connectionId: string; eventId: string };
      const conn = await ctx.store.get("calendar_connections", connectionId);
      const raw = await ctx.store.get("events", eventId);
      if (!conn || conn.user_id !== ctx.userId || conn.status !== "active" || !raw) throw new Error("Connexion ou événement indisponible");
      const { isConfigured, pushEvent } = await import("@/lib/integrations");
      if (!isConfigured(conn)) throw new Error(`Fournisseur ${conn.provider} non configuré`);
      const [event] = await withExceptions(ctx.store, [raw]);
      await pushEvent(ctx.store, conn, event, t.type.endsWith(".delete") ? "delete" : "upsert");
      await ctx.store.update("agent_tasks", t.id, { status: "completed", output: { ok: true }, updated_at: now.toISOString() });
      pushed++;
    } catch (e) {
      const failed = t.attempts + 1 >= 5;
      await ctx.store.update("agent_tasks", t.id, {
        status: failed ? "failed" : "pending",
        error: errMsg(e).slice(0, 500),
        run_after: new Date(now.getTime() + 2 ** (t.attempts + 1) * 60000).toISOString(),
        updated_at: now.toISOString(),
      });
      errors++;
    }
  }
  return { pushed, errors };
}

/** Synchronisation manuelle : envoie MES modifications en attente puis importe MES événements externes. */
export const POST = api(
  async ({ ctx }) => {
    const push = await pushMyPendingSyncs(ctx);
    const pull = await pullAllConnections(ctx.store, ctx.mailer, ctx.userId);
    return { pushed: push.pushed, pushErrors: push.errors, imported: pull.pulled };
  },
  { rateLimit: 6 },
);
