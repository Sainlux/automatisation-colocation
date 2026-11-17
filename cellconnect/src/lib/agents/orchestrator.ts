import "server-only";
import { DateTime } from "luxon";
import type { Ctx } from "@/lib/context";
import type { Store } from "@/lib/db/store";
import { audit, log } from "@/lib/audit";
import { env } from "@/lib/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { sha256Hex } from "@/lib/auth/crypto";
import { serverNow } from "@/lib/clock";
import { deleteObject, getObject, putObject, validateBinaryUpload } from "@/lib/storage";
import { icsToExtraction } from "@/lib/ics";
import { draftDecisionSchema, readyDraftSchema, type DraftDecision, type EventDraft, type ReadyDraft } from "@/lib/schemas/draft";
import type { ExtractionResult } from "@/lib/schemas/extraction";
import type { ExtractedEventRow, ExtractionJob, Upload } from "@/lib/types";
import type { ChannelSender } from "@/lib/channels/email";
import { ExtractionError, getProviders, selectProvider, TextParserProvider, type ExtractionInput, type ExtractionProvider } from "./vision-agent";
import { validateExtraction } from "./validation-agent";
import { checkDrafts, type DraftConflict } from "./conflict-agent";
import { createEvent, withdrawFromEvent } from "./calendar-agent";
import { detectForUserEvent } from "./conflict-agent";

/**
 * AIOrchestrator — coordonne le parcours « capture → événements ».
 *
 *   1. réception (uploads privés)          → extraction_jobs.step = received
 *   2. VisionAgent (IA ou analyse locale)  → analyzing / extracted
 *   3. ValidationAgent (déterministe)      → review (brouillons à vérifier)
 *   4. ConflictManagerAgent (avant création)
 *   5. CalendarAgent + ReminderAgent + NotificationAgent (après confirmation)
 *
 * Les agents PROPOSENT ; seules les fonctions backend, après validation
 * explicite de l'utilisateur, exécutent les actions.
 */

export type IncomingItem =
  | { type: "file"; data: Buffer; name: string | null }
  | { type: "text"; text: string }
  | { type: "ics"; text: string; name: string | null };

const MAX_ATTEMPTS = 3;

/** Canal d'arrivée d'un message transféré (pour lui répondre une fois l'analyse terminée). */
export interface ExtractionSource {
  channel: NonNullable<ExtractionJob["source_channel"]>;
  /** Telegram : identifiant de la conversation ; e-mail : null (la réponse part à l'adresse du compte). */
  ref: string | null;
}

export async function startExtraction(ctx: Ctx, items: IncomingItem[], source: ExtractionSource | null = null): Promise<ExtractionJob> {
  if (items.length === 0) throw badRequest("Aucun contenu à analyser.");
  if (items.length > env.uploads.maxFilesPerAnalysis) throw badRequest(`Maximum ${env.uploads.maxFilesPerAnalysis} éléments par analyse.`);

  const uploads: Upload[] = [];
  for (const item of items) {
    let data: Buffer;
    let kind: Upload["kind"];
    let mime: string;
    if (item.type === "file") {
      const t = validateBinaryUpload(item.data);
      data = item.data;
      kind = t.kind;
      mime = t.mime;
    } else {
      const text = item.text.trim();
      if (!text) throw badRequest("Le texte est vide.");
      if (text.length > env.uploads.maxTextChars) throw badRequest(`Texte trop long (maximum ${env.uploads.maxTextChars} caractères).`);
      if (item.type === "ics" && !/BEGIN:VCALENDAR/.test(text)) throw badRequest("Ce fichier n'est pas un calendrier iCalendar valide.");
      data = Buffer.from(text, "utf8");
      kind = item.type === "ics" ? "ics" : "text";
      mime = item.type === "ics" ? "text/calendar" : "text/plain";
    }
    const id = crypto.randomUUID();
    const storagePath = `${ctx.orgId}/${ctx.userId}/${id}`;
    await putObject(storagePath, data, mime);
    uploads.push(
      await ctx.store.insert("uploads", {
        id,
        organization_id: ctx.orgId,
        user_id: ctx.userId,
        kind,
        mime_type: mime,
        size_bytes: data.length,
        sha256: sha256Hex(data),
        storage_path: storagePath,
        original_name: item.type === "text" ? null : (item.name?.slice(0, 200) ?? null),
        deleted_at: null,
      }),
    );
  }

  const job = await ctx.store.insert("extraction_jobs", {
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    upload_ids: uploads.map((u) => u.id),
    status: "pending",
    step: "received",
    provider: null,
    error: null,
    warnings: [],
    context_notes: null,
    attempts: 0,
    updated_at: ctx.now().toISOString(),
    completed_at: null,
    source_channel: source?.channel ?? null,
    source_ref: source?.ref?.slice(0, 64) ?? null,
  });
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "extraction.started", entityType: "extraction_job", entityId: job.id, metadata: { items: uploads.map((u) => u.kind) } });
  return job;
}

/** Choix du fournisseur : le texte est d'abord analysé localement (aucune donnée envoyée à l'IA). */
async function extract(inputs: ExtractionInput[], tz: string, now: Date, providers: ExtractionProvider[]): Promise<{ result: ExtractionResult; provider: string }> {
  const ctx = { today: DateTime.fromJSDate(now).setZone(tz).toISODate()!, timezone: tz };
  if (inputs.every((i) => i.kind === "text")) {
    const local = providers.find((p) => p instanceof TextParserProvider) ?? new TextParserProvider();
    const r = await local.extract(inputs, ctx);
    const usable = r.events.length > 0 && r.events.every((e) => e.date.month && e.date.day && e.title);
    const ai = providers.find((p) => !(p instanceof TextParserProvider));
    if (usable || !ai) return { result: r, provider: local.name };
    return { result: await ai.extract(inputs, ctx), provider: ai.name };
  }
  const p = selectProvider(inputs, providers);
  return { result: await p.extract(inputs, ctx), provider: p.name };
}

/** Analyse les fichiers d'agenda (.ics) : lecture directe, sans IA. */
async function extractIcs(uploads: Upload[], tz: string): Promise<ExtractionResult> {
  const text = (await Promise.all(uploads.map((u) => getObject(u.storage_path!)))).map((b) => b.toString("utf8")).join("\n");
  return icsToExtraction(text, tz);
}

async function toInputs(uploads: Upload[]): Promise<ExtractionInput[]> {
  return Promise.all(
    uploads.map(async (u): Promise<ExtractionInput> => {
      const data = await getObject(u.storage_path!);
      if (u.kind === "text") return { kind: "text", text: data.toString("utf8") };
      if (u.kind === "pdf") return { kind: "pdf", mimeType: "application/pdf", data, name: u.original_name ?? undefined };
      return { kind: "image", mimeType: u.mime_type, data };
    }),
  );
}

/** Clé de doublon : même date, même heure, même titre. */
function eventKey(e: ExtractionResult["events"][number]) {
  return [e.date.year ?? "", e.date.month ?? "", e.date.day ?? "", e.startTime ?? "", (e.title ?? "").trim().toLowerCase()].join("|");
}

/** Fusionne deux résultats (ex. invitation .ics + texte du message) en retirant les doublons. */
export function mergeExtractions(a: ExtractionResult, b: ExtractionResult): ExtractionResult {
  const seen = new Set(a.events.map(eventKey));
  const extra = b.events.filter((e) => {
    const k = eventKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const notes = [a.contextNotes, b.contextNotes].filter(Boolean);
  return {
    ...a,
    events: [...a.events, ...extra],
    warnings: [...new Set([...a.warnings, ...b.warnings])],
    contextNotes: notes.length ? notes.join("\n") : null,
  };
}

const EXHAUSTED_MESSAGE = "L'analyse n'a pas abouti : relancez l'import.";

export async function runExtractionJob(
  store: Store,
  jobId: string,
  opts: { now?: () => Date; providers?: ExtractionProvider[]; mailer?: ChannelSender } = {},
) {
  const now = opts.now ?? serverNow;
  const job = await store.get("extraction_jobs", jobId);
  if (!job || !["pending", "failed"].includes(job.status)) return job;
  if (job.attempts >= MAX_ATTEMPTS) {
    if (job.status === "failed") return job;
    // Tentatives épuisées (ex. job remis en attente par le worker) : échec explicite plutôt qu'une attente sans fin.
    const failed = await store.update("extraction_jobs", job.id, { status: "failed", step: "received", error: EXHAUSTED_MESSAGE, updated_at: now().toISOString() });
    await finishInbound(store, failed, opts.mailer);
    return failed;
  }
  // Prise atomique : si deux exécutions démarrent en même temps, une seule analyse le message.
  const [claimed] = await store.updateWhere("extraction_jobs", [["id", "eq", job.id], ["status", "in", ["pending", "failed"]]], {
    status: "processing",
    step: "analyzing",
    attempts: job.attempts + 1,
    error: null,
    updated_at: now().toISOString(),
  });
  if (!claimed) return store.get("extraction_jobs", job.id);

  const profile = await store.get("profiles", job.user_id);
  const tz = profile?.timezone ?? env.defaultTimezone;
  const uploads = (await store.select("uploads", { where: [["id", "in", job.upload_ids], ["user_id", "eq", job.user_id]] })).filter((u) => !u.deleted_at && u.storage_path);
  try {
    if (uploads.length !== job.upload_ids.length) throw new ExtractionError("Fichier source supprimé : relancez l'import.", false);
    let result: ExtractionResult;
    let provider: string;
    const ics = uploads.filter((u) => u.kind === "ics");
    const others = uploads.filter((u) => u.kind !== "ics");
    const providers = opts.providers ?? getProviders();
    if (ics.length) {
      result = await extractIcs(ics, tz);
      provider = "ics";
      if (others.length) {
        // Invitation accompagnée d'un message, d'une capture ou d'un PDF : on lit les deux et on fusionne.
        const inputs = await toInputs(others);
        // Minimisation : si l'invitation suffit, le texte d'accompagnement est lu localement, sans IA.
        const localOnly = result.events.length > 0 && inputs.every((i) => i.kind === "text");
        try {
          const other = await extract(inputs, tz, now(), localOnly ? providers.filter((p) => p instanceof TextParserProvider) : providers);
          result = mergeExtractions(result, other.result);
          provider = `ics+${other.provider}`;
        } catch (e) {
          if (result.events.length === 0) throw e;
          log("warn", "extraction_partial", { jobId: job.id, error: (e as Error).message });
          result = { ...result, warnings: [...result.warnings, "Une partie du message n'a pas pu être lue : seules les dates de l'invitation sont proposées."] };
        }
      }
    } else {
      ({ result, provider } = await extract(await toInputs(others), tz, now(), providers));
    }
    await store.update("extraction_jobs", job.id, { step: "extracted", provider });

    const groups = await store.select("groups", { where: [["organization_id", "eq", job.organization_id]] });
    const drafts = validateExtraction(result, { now: now(), timezone: tz, groups: groups.map((g) => ({ id: g.id, name: g.name })) });
    await store.deleteWhere("extracted_events", [["job_id", "eq", job.id]]);
    await store.insertMany(
      "extracted_events",
      drafts.map((d, i) => ({
        job_id: job.id,
        organization_id: job.organization_id,
        user_id: job.user_id,
        position: i,
        raw: result.events[i],
        draft: d,
        status: "pending" as const,
        event_id: null,
      })),
    );
    const updated = await store.update("extraction_jobs", job.id, {
      status: "needs_review",
      step: "review",
      warnings: result.warnings.slice(0, 20),
      context_notes: result.contextNotes,
      updated_at: now().toISOString(),
    });
    if (profile?.delete_captures_after_analysis) await purgeUploads(store, uploads, now());
    log("info", "extraction_done", { jobId: job.id, provider, events: drafts.length });
    await finishInbound(store, updated, opts.mailer);
    return updated;
  } catch (e) {
    const retryable = e instanceof ExtractionError ? e.retryable : !(e instanceof AppError);
    // Seul un message lisible est montré ; le détail technique reste dans les journaux.
    const message = e instanceof ExtractionError ? e.userMessage : e instanceof AppError ? e.message : "Erreur inattendue pendant l'analyse.";
    log("error", "extraction_failed", { jobId: job.id, error: (e as Error).message });
    const failed = await store.update("extraction_jobs", job.id, {
      status: "failed",
      step: "received",
      error: message + (retryable && job.attempts + 1 < MAX_ATTEMPTS ? " Vous pouvez relancer l'analyse." : ""),
      attempts: retryable ? job.attempts + 1 : MAX_ATTEMPTS,
      updated_at: now().toISOString(),
    });
    await finishInbound(store, failed, opts.mailer);
    return failed;
  }
}

/** Message reçu par un canal entrant : prévient l'utilisateur du résultat, même si l'analyse s'est faite hors de la requête (worker). */
async function finishInbound(store: Store, job: ExtractionJob, mailer?: ChannelSender) {
  if (!job.source_channel) return;
  try {
    const { notifyInboundOutcome } = await import("@/lib/inbound/common");
    await notifyInboundOutcome(store, job, mailer);
  } catch (e) {
    log("warn", "inbound_outcome_failed", { jobId: job.id, error: (e as Error).message });
  }
}

export async function purgeUploads(store: Store, uploads: Upload[], now: Date) {
  for (const u of uploads) {
    if (u.storage_path) await deleteObject(u.storage_path).catch(() => undefined);
    await store.update("uploads", u.id, { storage_path: null, deleted_at: now.toISOString() });
  }
}

/**
 * Analyse de l'utilisateur. Elle reste ouvrable depuis une autre organisation
 * dont il est membre (ex. message transféré pendant que l'organisation
 * personnelle était active) : `organizationId` permet à l'interface de basculer.
 */
export async function getJob(ctx: Ctx, jobId: string) {
  const job = await ctx.store.get("extraction_jobs", jobId);
  if (!job || job.user_id !== ctx.userId) throw notFound("Analyse introuvable.");
  if (job.organization_id !== ctx.orgId) {
    const [m] = await ctx.store.select("organization_members", { where: [["organization_id", "eq", job.organization_id], ["user_id", "eq", ctx.userId]], limit: 1 });
    if (!m) throw notFound("Analyse introuvable.");
  }
  const [rows, uploads] = await Promise.all([
    ctx.store.select("extracted_events", { where: [["job_id", "eq", job.id]], order: [{ column: "position" }] }),
    ctx.store.select("uploads", { where: [["id", "in", job.upload_ids], ["user_id", "eq", job.user_id]] }),
  ]);
  return {
    job: { ...job, canRetry: job.status === "failed" && job.attempts < MAX_ATTEMPTS },
    organizationId: job.organization_id,
    drafts: rows.map((r) => ({ ...(r.draft as EventDraft), status: r.status, eventId: r.event_id })),
    uploads: uploads.map((u) => ({ id: u.id, kind: u.kind, deleted: Boolean(u.deleted_at), name: u.original_name })),
  };
}

export async function listJobs(ctx: Ctx, limit = 20) {
  return ctx.store.select("extraction_jobs", {
    where: [["user_id", "eq", ctx.userId], ["organization_id", "eq", ctx.orgId]],
    order: [{ column: "created_at", ascending: false }],
    limit,
  });
}

export async function retryJob(ctx: Ctx, jobId: string) {
  const { job } = await getJob(ctx, jobId);
  if (!job.canRetry) throw badRequest("Cette analyse ne peut pas être relancée.");
  await ctx.store.update("extraction_jobs", job.id, { status: "pending", step: "received", error: null });
  return job;
}

export async function deleteJobSources(ctx: Ctx, jobId: string) {
  const { job } = await getJob(ctx, jobId);
  const uploads = await ctx.store.select("uploads", { where: [["id", "in", job.upload_ids], ["user_id", "eq", job.user_id]] });
  await purgeUploads(ctx.store, uploads.filter((u) => !u.deleted_at), ctx.now());
  await audit(ctx.store, { orgId: ctx.orgId, actorId: ctx.userId, action: "upload.deleted", entityType: "extraction_job", entityId: job.id });
}

// ---------------------------------------------------------------------------
// Validation finale et création
// ---------------------------------------------------------------------------

export function parseReadyDrafts(drafts: unknown[]): { ready: ReadyDraft[]; errors: { key: string; messages: string[] }[] } {
  const ready: ReadyDraft[] = [];
  const errors: { key: string; messages: string[] }[] = [];
  for (const d of drafts) {
    const r = readyDraftSchema.safeParse(d);
    if (r.success) {
      const unconfirmed = r.data.issues.some((i) => i.severity === "warning") && !r.data.confirmed;
      if (unconfirmed) errors.push({ key: r.data.key, messages: ["Des informations incertaines doivent être confirmées."] });
      else ready.push(r.data);
    } else {
      errors.push({ key: (d as { key?: string })?.key ?? "?", messages: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
  }
  return { ready, errors };
}

export async function checkDraftConflicts(ctx: Ctx, drafts: unknown[]): Promise<{ conflicts: DraftConflict[]; errors: { key: string; messages: string[] }[] }> {
  const { ready, errors } = parseReadyDrafts(drafts.map((d) => ({ ...(d as object), confirmed: true })));
  const profile = await ctx.store.get("profiles", ctx.userId);
  return { conflicts: await checkDrafts(ctx, ready, profile?.travel_buffer_minutes ?? 0), errors };
}

export interface CommitSummary {
  created: { key: string; eventId: string; title: string }[];
  skipped: string[];
  withdrawn: { eventId: string; notified: boolean }[];
  conflictsRecorded: number;
  failures: { key: string; message: string }[];
}

export async function commitDrafts(ctx: Ctx, input: { jobId?: string | null; drafts: unknown[]; decisions: unknown[] }): Promise<CommitSummary> {
  const { ready, errors } = parseReadyDrafts(input.drafts);
  if (errors.length) throw badRequest("Certains événements sont incomplets ou non confirmés.", errors);
  const decisions = new Map<string, DraftDecision>(input.decisions.map((d) => draftDecisionSchema.parse(d)).map((d) => [d.key, d]));

  // Brouillons enregistrés de l'analyse, chargés une seule fois (clé → ligne).
  const rowsByKey = new Map<string, ExtractedEventRow>();
  if (input.jobId) {
    const { job } = await getJob(ctx, input.jobId); // vérifie l'appartenance
    if (job.organization_id !== ctx.orgId) throw badRequest("Cette analyse appartient à une autre organisation : basculez vers celle-ci pour ajouter les dates.");
    const rows = await ctx.store.select("extracted_events", { where: [["job_id", "eq", job.id]] });
    for (const r of rows) rowsByKey.set((r.draft as EventDraft).key, r);
    // Déjà validée (double envoi, onglet resté ouvert) : on renvoie le résultat sans rien recréer.
    if (job.status === "completed") {
      return {
        created: rows.filter((r) => r.status === "created" && r.event_id).map((r) => ({ key: (r.draft as EventDraft).key, eventId: r.event_id!, title: (r.draft as EventDraft).title })),
        skipped: rows.filter((r) => r.status === "rejected").map((r) => (r.draft as EventDraft).key),
        withdrawn: [],
        conflictsRecorded: 0,
        failures: [],
      };
    }
  }
  const mark = async (key: string, status: "created" | "rejected", eventId: string | null) => {
    const row = rowsByKey.get(key);
    if (row) rowsByKey.set(key, await ctx.store.update("extracted_events", row.id, { status, event_id: eventId }));
  };

  const summary: CommitSummary = { created: [], skipped: [], withdrawn: [], conflictsRecorded: 0, failures: [] };
  const withdrawTargets = new Map<string, { notify: boolean; message: string | null }>();

  for (const d of ready) {
    const decision = decisions.get(d.key) ?? { key: d.key, action: "create", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null };
    const existing = rowsByKey.get(d.key);
    if (existing && (existing.status === "created" || existing.status === "rejected")) {
      // Déjà traité lors d'un envoi précédent : jamais de doublon.
      summary.skipped.push(d.key);
      continue;
    }
    if (decision.action === "skip") {
      summary.skipped.push(d.key);
      await mark(d.key, "rejected", null);
      continue;
    }
    try {
      const event = await createEvent(
        ctx,
        {
          title: d.title,
          description: d.description,
          location: d.location,
          meetingUrl: d.meetingUrl,
          date: d.date,
          startTime: d.startTime,
          endTime: d.endTime,
          timezone: d.timezone,
          recurrenceRule: d.recurrenceRule,
          groupId: d.groupId,
        },
        { source: input.jobId ? "capture" : "manual", sourceJobId: input.jobId ?? null, detectConflicts: false },
      );
      summary.created.push({ key: d.key, eventId: event.id, title: event.title });
      await mark(d.key, "created", event.id);
      for (const id of decision.withdrawFrom) withdrawTargets.set(id, { notify: decision.notifyOrganizers, message: decision.withdrawMessage });
    } catch (e) {
      summary.failures.push({ key: d.key, message: e instanceof AppError ? e.message : "Création impossible." });
      log("error", "commit_draft_failed", { key: d.key, error: (e as Error).message });
    }
  }

  // Désistements choisis par l'utilisateur pour résoudre les conflits.
  for (const [eventId, w] of withdrawTargets) {
    try {
      const r = await withdrawFromEvent(ctx, eventId, { notifyOrganizer: w.notify, message: w.message });
      summary.withdrawn.push({ eventId, notified: r.notified });
    } catch (e) {
      summary.failures.push({ key: eventId, message: e instanceof AppError ? e.message : "Désistement impossible." });
    }
  }

  // Conflits restants (choix « garder les deux ») : enregistrés pour suivi.
  for (const c of summary.created) {
    summary.conflictsRecorded += (await detectForUserEvent(ctx.store, ctx.mailer, ctx.userId, c.eventId, ctx.now())).length;
  }

  if (input.jobId && summary.failures.length === 0) {
    await ctx.store.update("extraction_jobs", input.jobId, { status: "completed", step: "ready", completed_at: ctx.now().toISOString() });
  }
  await audit(ctx.store, {
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "events.batch_committed",
    entityType: "extraction_job",
    entityId: input.jobId ?? null,
    metadata: { created: summary.created.length, skipped: summary.skipped.length, withdrawn: summary.withdrawn.length, failures: summary.failures.length },
  });
  return summary;
}

/** Met à jour les brouillons enregistrés (corrections de l'utilisateur). */
export async function saveDrafts(ctx: Ctx, jobId: string, drafts: EventDraft[]) {
  await getJob(ctx, jobId);
  const rows = await ctx.store.select("extracted_events", { where: [["job_id", "eq", jobId]] });
  for (const d of drafts) {
    const row = rows.find((r) => (r.draft as EventDraft).key === d.key);
    if (row && row.status === "pending") await ctx.store.update("extracted_events", row.id, { draft: d });
  }
}
