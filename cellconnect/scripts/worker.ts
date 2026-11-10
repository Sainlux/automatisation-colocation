/**
 * Worker CellConnect : boucle de traitement des tâches persistantes
 * (analyses en attente, rappels, e-mails, synchronisations).
 *
 *   npm run worker              # boucle (intervalle WORKER_INTERVAL_MS, 30 s par défaut)
 *   npm run worker -- --once    # un seul passage (utile en cron)
 *
 * Toutes les tâches sont stockées en base : un redémarrage ne perd rien.
 */
import "./load-env";
import { getStore } from "@/lib/db";
import { smtpSender } from "@/lib/channels/email";
import { pullAllConnections, tick } from "@/lib/worker";

const interval = Number(process.env.WORKER_INTERVAL_MS ?? 30000);
const once = process.argv.includes("--once");
let stopping = false;
let lastPull = 0;

async function loop() {
  const store = getStore();
  do {
    try {
      const report = await tick(store, smtpSender);
      if (Date.now() - lastPull > 15 * 60000) {
        lastPull = Date.now();
        await pullAllConnections(store, smtpSender); // synchronisation de secours des calendriers
      }
      if (once) console.log(JSON.stringify(report));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "worker_tick_failed", error: (e as Error).message }));
    }
    if (!once && !stopping) await new Promise((r) => setTimeout(r, interval));
  } while (!once && !stopping);
}

process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
void loop();
