import { api } from "@/lib/http/api";
import { AppError, badRequest } from "@/lib/errors";
import { startExtraction, type IncomingItem } from "@/lib/agents/orchestrator";
import { env } from "@/lib/env";

/**
 * Réception des contenus à analyser (multipart/form-data) :
 *  - files : images (PNG/JPEG/WebP) ou PDF ;
 *  - ics   : fichier iCalendar ;
 *  - text  : texte collé.
 * Les fichiers sont stockés de manière privée ; renvoie l'identifiant de l'analyse.
 */
export const POST = api(
  async ({ req, ctx }) => {
    // Taille annoncée obligatoire : on refuse avant de lire le corps (pas de flux sans limite).
    const declared = req.headers.get("content-length");
    const len = declared === null ? NaN : Number(declared);
    if (!Number.isFinite(len) || len < 0) throw new AppError(411, "length_required", "La taille de l'envoi est inconnue. Rechargez la page, puis réessayez.");
    const max = env.uploads.maxPdfBytes * env.uploads.maxFilesPerAnalysis;
    if (len > max) throw new AppError(413, "too_large", "Envoi trop volumineux. Envoyez moins de fichiers à la fois.");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw badRequest("Formulaire d'envoi invalide.");
    }
    const items: IncomingItem[] = [];
    for (const f of form.getAll("files")) {
      if (typeof f === "string") continue;
      items.push({ type: "file", data: Buffer.from(await f.arrayBuffer()), name: f.name || null });
    }
    const ics = form.get("ics");
    if (ics && typeof ics !== "string") {
      if (ics.size > 1024 * 1024) throw badRequest("Fichier .ics trop volumineux (1 Mo max).");
      items.push({ type: "ics", text: await ics.text(), name: ics.name || null });
    }
    const text = form.get("text");
    if (typeof text === "string" && text.trim()) items.push({ type: "text", text });
    const job = await startExtraction(ctx, items);
    return { jobId: job.id, status: job.status, step: job.step };
  },
  { rateLimit: 20 },
);
