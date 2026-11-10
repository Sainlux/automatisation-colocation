import "server-only";
import type { Store } from "@/lib/db/store";
import type { Ctx } from "@/lib/context";
import type { ChannelSender } from "@/lib/channels/email";
import { env } from "@/lib/env";
import { log } from "@/lib/audit";
import { runExtractionJob, startExtraction, type IncomingItem } from "@/lib/agents/orchestrator";
import { notify } from "@/lib/agents/notification-agent";
import { sharedRateLimit } from "@/lib/http/api";
import { AppError } from "@/lib/errors";

/**
 * Socle commun aux canaux entrants (e-mail transféré, bot Telegram).
 * Un message reçu devient une analyse « à vérifier », exactement comme un
 * import manuel : RIEN n'est ajouté à l'agenda sans validation dans l'app.
 */

/** Contexte d'un utilisateur identifié par le canal (adresse signée ou conversation liée), sans session web. */
export async function ctxForUser(store: Store, userId: string, mailer: ChannelSender): Promise<Ctx | null> {
  const profile = await store.get("profiles", userId);
  if (!profile) return null;
  const [m] = await store.select("organization_members", { where: [["user_id", "eq", userId]], order: [{ column: "created_at" }], limit: 1 });
  if (!m) return null;
  return { store, userId, email: profile.email, orgId: m.organization_id, orgRole: m.role, timezone: profile.timezone, now: () => new Date(), mailer };
}

/** Au plus 20 messages par minute et par utilisateur et canal (protection contre les envois en rafale). */
export async function inboundAllowed(channel: string, userId: string) {
  return sharedRateLimit(`inbound:${channel}:${userId}`, 20);
}

export function reviewPath(jobId: string) {
  return `/capture/${jobId}`;
}

export function reviewUrl(jobId: string) {
  return `${env.appUrl.replace(/\/$/, "")}${reviewPath(jobId)}`;
}

/** Crée l'analyse à partir des éléments reçus. Renvoie un message d'erreur lisible si le contenu est refusé. */
export async function ingest(ctx: Ctx, items: IncomingItem[]): Promise<{ jobId: string } | { error: string }> {
  try {
    const job = await startExtraction(ctx, items.slice(0, env.uploads.maxFilesPerAnalysis));
    return { jobId: job.id };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}

export interface AnalysisOutcome {
  status: "ready" | "none" | "failed" | "pending";
  count: number;
  error: string | null;
  url: string;
}

/** Lance l'analyse (texte lu sans IA d'abord) et résume le résultat pour la réponse au canal. */
export async function analyse(store: Store, jobId: string): Promise<AnalysisOutcome> {
  const job = await runExtractionJob(store, jobId);
  const url = reviewUrl(jobId);
  if (!job) return { status: "failed", count: 0, error: "Analyse introuvable.", url };
  if (job.status === "failed") return { status: "failed", count: 0, error: job.error, url };
  if (job.status === "pending" || job.status === "processing") return { status: "pending", count: 0, error: null, url };
  const rows = await store.select("extracted_events", { where: [["job_id", "eq", jobId]] });
  return { status: rows.length ? "ready" : "none", count: rows.length, error: null, url };
}

export function outcomeText(o: AnalysisOutcome): string {
  if (o.status === "ready") {
    const what = o.count === 1 ? "1 date trouvée" : `${o.count} dates trouvées`;
    return `${what}. Vérifiez-les avant de les ajouter à votre agenda :\n${o.url}`;
  }
  if (o.status === "none") return `Aucune date trouvée dans ce message. Vous pouvez l'ouvrir pour ajouter une date à la main :\n${o.url}`;
  if (o.status === "pending") return `Analyse en cours. Le résultat sera ici dans un instant :\n${o.url}`;
  return `Ce message n'a pas pu être lu${o.error ? ` : ${o.error}` : "."}\n${o.url}`;
}

/** Notification dans l'app (et par e-mail si l'utilisateur l'accepte) une fois l'analyse terminée. */
export async function notifyOutcome(ctx: Ctx, jobId: string, o: AnalysisOutcome, source: string, email: boolean) {
  const title = o.status === "ready" ? (o.count === 1 ? "1 date à vérifier" : `${o.count} dates à vérifier`) : o.status === "none" ? "Aucune date trouvée" : "Message reçu";
  try {
    await notify(
      ctx.store,
      { userId: ctx.userId, orgId: ctx.orgId, type: "system", title: `${title} (${source})`, body: outcomeText(o), data: { url: reviewPath(jobId), jobId }, dedupeKey: `inbound:${jobId}`, email },
      ctx.mailer,
    );
  } catch (e) {
    log("warn", "inbound_notify_failed", { error: (e as Error).message });
  }
}
