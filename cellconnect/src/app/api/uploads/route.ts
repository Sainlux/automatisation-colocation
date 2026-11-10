import { api } from "@/lib/http/api";
import { badRequest } from "@/lib/errors";
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
    const len = Number(req.headers.get("content-length") ?? 0);
    const max = env.uploads.maxPdfBytes * env.uploads.maxFilesPerAnalysis;
    if (len > max) throw badRequest("Envoi trop volumineux.");
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
