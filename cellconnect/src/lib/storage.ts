import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/db";
import type { UploadKind } from "@/lib/types";

/**
 * Stockage PRIVÉ des fichiers importés (captures, PDF, textes).
 * - mode local : dossier .data/uploads (hors /public, jamais servi) ;
 * - mode Supabase : bucket privé (aucune URL publique).
 * Le type réel est vérifié par signature binaire (« magic bytes »), pas
 * seulement par l'extension ou le type MIME déclaré.
 */

export interface DetectedFile {
  kind: UploadKind;
  mime: string;
}

export function detectFileType(buf: Buffer): DetectedFile | { kind: "heic" } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("ascii") === "PNG") return { kind: "image", mime: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { kind: "image", mime: "image/webp" };
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "mif1", "msf1", "heif"].includes(brand)) return { kind: "heic" };
  }
  return null;
}

export function validateBinaryUpload(buf: Buffer): DetectedFile {
  const t = detectFileType(buf);
  if (!t) throw badRequest("Format de fichier non pris en charge. Formats acceptés : PNG, JPEG, WebP, PDF.");
  if (t.kind === "heic") {
    throw badRequest("Les photos HEIC doivent être converties en JPEG. Sur iPhone, l'application le fait automatiquement lors de l'import ; sinon, utilisez une capture d'écran.");
  }
  const max = t.kind === "pdf" ? env.uploads.maxPdfBytes : env.uploads.maxImageBytes;
  if (buf.length > max) throw badRequest(`Fichier trop volumineux (maximum ${Math.round(max / 1024 / 1024)} Mo).`);
  return t;
}

function localPath(storagePath: string) {
  const base = path.resolve(env.dataDir, "uploads");
  const full = path.resolve(base, storagePath);
  if (!full.startsWith(base + path.sep)) throw new Error("Chemin de stockage invalide");
  return full;
}

export async function putObject(storagePath: string, data: Buffer, mime: string) {
  if (env.dataBackend === "supabase") {
    const { error } = await supabaseAdmin().storage.from(env.supabase.bucket).upload(storagePath, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Stockage : ${error.message}`);
    return;
  }
  const full = localPath(storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, data, { mode: 0o600 });
}

export async function getObject(storagePath: string): Promise<Buffer> {
  if (env.dataBackend === "supabase") {
    const { data, error } = await supabaseAdmin().storage.from(env.supabase.bucket).download(storagePath);
    if (error || !data) throw new Error(`Stockage : ${error?.message ?? "introuvable"}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(localPath(storagePath));
}

export async function deleteObject(storagePath: string) {
  if (env.dataBackend === "supabase") {
    await supabaseAdmin().storage.from(env.supabase.bucket).remove([storagePath]);
    return;
  }
  await fs.rm(localPath(storagePath), { force: true });
}
