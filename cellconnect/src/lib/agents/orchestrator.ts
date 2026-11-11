import "server-only";
import { DateTime } from "luxon";
import type { Ctx } from "@/lib/context";
import type { Store } from "@/lib/db/store";
import { audit, log } from "@/lib/audit";
import { env } from "@/lib/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { sha256Hex } from "@/lib/auth/crypto";
import { deleteObject, getObject, putObject, validateBinaryUpload } from "@/lib/storage";
import { icsToExtraction } from "@/lib/ics";
import { draftDecisionSchema, readyDraftSchema, type DraftDecision, type EventDraft, type ReadyDraft } from "@/lib/schemas/draft";
import type { ExtractionResult } from "@/lib/schemas/extraction";
import type { ExtractionJob, Upload } from "@/lib/types";
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

export async function startExtraction(ctx: Ctx, items: IncomingItem[]): Promise<ExtractionJob> {
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

export async function runExtractionJob(store: Store, jobId: string, opts: { now?: () => Date; providers?: ExtractionProvider[] } = {}) {
  const now = opts.now ?? (() => new Date());
  const job = await store.get("extraction_jobs", jobId);
  if (!job || !["pending", "failed"].includes(job.status)) return job;
  if (job.attempts >= MAX_ATTEMPTS) return job;
  await store.update("extraction_jobs", job.id, { status: "processing", step: "analyzing", attempts: job.attempts + 1, error: null });

  const profile = await store.get("profiles", job.user_id);
  const tz = profile?.timezone ?? env.defaultTimezone;
  const uploads = (await store.select("uploads", { where: [["id", "in", job.upload_ids]] })).filter((u) => !u.deleted_at && u.storage_path);
  try {
    if (uploads.length !== job.upload_ids.length) throw new ExtractionError("Fichier source supprimé : relancez l'import.", false);
    let result: ExtractionResult;
    let provider: string;
    const ics = uploads.filter((u) => u.kind === "ics");
    if (ics.length) {
      const text = (await Promise.all(ics.map((u) => getObject(u.storage_path!)))).map((b) => b.toString("utf8")).join("\n");
      result = icsToExtraction(text, tz);
      provider = "ics";
    } else {
      const inputs: ExtractionInput[] = await Promise.all(
        uploads.map(async (u): Promise<ExtractionInput> => {
          const data = await getObject(u.storage_path!);
          if (u.kind === "text") return { kind: "text", text: data.toString("utf8") };
          if (u.kind === "pdf") return { kind: "pdf", mimeType: "application/pdf", data, name: u.original_name ?? undefined };
          return { kind: "image", mimeType: u.mime_type, data };
        }),
      );
      ({ result, provider } = await extract(inputs, tz, now(), opts.providers ?? getProviders()));
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
    return updated;
  } catch (e) {
    const retryable = e instanceof ExtractionError ? e.retryable : !(e instanceof AppError);
    const message = e instanceof ExtractionError || e instanceof AppError ? e.message : "Erreur inattendue pendant l'analyse.";
    log("error", "extraction_failed", { jobId: job.id, error: (e as Error).message });
    return store.update("extraction_jobs", job.id, {
      status: "failed",
      step: "received",
      error: message + (retryable && job.attempts + 1 < MAX_ATTEMPTS ? " Vous pouvez relancer l'analyse." : ""),
      attempts: retryable ? job.attempts + 1 : MAX_ATTEMPTS,
      updated_at: now().toISOString(),
    });
  }
}

export async function purgeUploads(store: Store, uploads: Upload[], now: Date) {
  for (const u of uploads) {
    if (u.storage_path) await deleteObject(u.storage_path).catch(() => undefined);
    await store.update("uploads", u.id, { storage_path: null, deleted_at: now.toISOString() });
  }
}

export async function getJob(ctx: Ctx, jobId: string) {
  const job = await ctx.store.get("extraction_jobs", jobId);
  if (!job || job.user_id !== ctx.userId || job.organization_id !== ctx.orgId) throw notFound("Analyse introuvable.");
  const rows = await ctx.store.select("extracted_events", { where: [["job_id", "eq", job.id]], order: [{ column: "position" }] });
  const uploads = await ctx.store.select("uploads", { where: [["id", "in", job.upload_ids]] });
  return {
    job: { ...job, canRetry: job.status === "failed" && job.attempts < MAX_ATTEMPTS },
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
  const uploads = await ctx.store.select("uploads", { where: [["id", "in", job.upload_ids]] });
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
  if (input.jobId) await getJob(ctx, input.jobId); // vérifie l'appartenance

  const summary: CommitSummary = { created: [], skipped: [], withdrawn: [], conflictsRecorded: 0, failures: [] };
  const withdrawTargets = new Map<string, { notify: boolean; message: string | null }>();

  for (const d of ready) {
    const decision = decisions.get(d.key) ?? { key: d.key, action: "create", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null };
    if (decision.action === "skip") {
      summary.skipped.push(d.key);
      if (input.jobId) await markExtracted(ctx, input.jobId, d.key, "rejected", null);
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
      if (input.jobId) await markExtracted(ctx, input.jobId, d.key, "created", event.id);
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

async function markExtracted(ctx: Ctx, jobId: string, key: string, status: "created" | "rejected", eventId: string | null) {
  const rows = await ctx.store.select("extracted_events", { where: [["job_id", "eq", jobId]] });
  const row = rows.find((r) => (r.draft as EventDraft).key === key);
  if (row) await ctx.store.update("extracted_events", row.id, { status, event_id: eventId });
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
