"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Camera, CalendarPlus, FileText, ImagePlus, ShieldCheck, Trash2, Type } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { prepareImage } from "@/components/app/image-prep";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { relative } from "@/components/app/format";
import { cn } from "@/lib/utils";

type Mode = "image" | "text" | "ics";
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export default function CapturePage() {
  return (
    <Suspense>
      <Capture />
    </Suspense>
  );
}

function Capture() {
  const { me } = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  // Partage depuis une autre application (Web Share Target, texte) : /capture?text=…
  const shared = [sp.get("title"), sp.get("text"), sp.get("url")].filter(Boolean).join("\n");
  const [mode, setMode] = useState<Mode>(shared ? "text" : "image");
  const [files, setFiles] = useState<{ file: File; preview: string | null }[]>([]);
  const [text, setText] = useState(shared);
  const [ics, setIcs] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { data: jobs } = useApi<{ jobs: { id: string; status: string; created_at: string }[] }>("/api/extract-events");
  const aiOn = me.integrations.ai.available;

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const raw of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} fichiers par analyse.`);
        break;
      }
      const isPdf = raw.type === "application/pdf" || raw.name.toLowerCase().endsWith(".pdf");
      const isImage = raw.type.startsWith("image/") || /\.(heic|heif)$/i.test(raw.name);
      if (!isPdf && !isImage) {
        setError(`« ${raw.name} » : format non pris en charge (PNG, JPEG, WebP, HEIC, PDF).`);
        continue;
      }
      try {
        const file = isPdf ? raw : await prepareImage(raw);
        if (file.size > (isPdf ? 15 : 10) * 1024 * 1024) {
          setError(`« ${raw.name} » dépasse la taille maximale.`);
          continue;
        }
        next.push({ file, preview: isPdf ? null : URL.createObjectURL(file) });
      } catch {
        setError(`« ${raw.name} » n'a pas pu être lu. Pour une photo HEIC, faites plutôt une capture d'écran ou exportez-la en JPEG.`);
      }
    }
    setFiles(next);
  }

  async function analyze() {
    setError(null);
    const form = new FormData();
    if (mode === "image") {
      if (!files.length) return setError("Ajoutez au moins une image ou un PDF.");
      files.forEach((f) => form.append("files", f.file, f.file.name));
    } else if (mode === "text") {
      if (!text.trim()) return setError("Collez le texte du message.");
      form.append("text", text);
    } else {
      if (!ics) return setError("Choisissez un fichier .ics.");
      if (ics.size > MAX_BYTES) return setError("Fichier trop volumineux.");
      form.append("ics", ics, ics.name);
    }
    try {
      setBusy("Envoi sécurisé…");
      const up = await apiFetch<{ jobId: string }>("/api/uploads", { method: "POST", body: form });
      setBusy("Lancement de l'analyse…");
      await apiFetch("/api/extract-events", { method: "POST", json: { jobId: up.jobId } });
      router.push(`/capture/${up.jobId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible. Vérifiez votre connexion.");
      setBusy(null);
    }
  }

  const tabs: { id: Mode; label: string; icon: typeof Camera }[] = [
    { id: "image", label: "Capture / photo / PDF", icon: ImagePlus },
    { id: "text", label: "Texte collé", icon: Type },
    { id: "ics", label: "Fichier .ics", icon: CalendarPlus },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nouvelle capture"
        description="Importez le message reçu (WhatsApp, Telegram, e-mail…). Les événements seront extraits puis soumis à votre validation."
        actions={
          <Link href="/evenements/nouveau" className={buttonVariants({ variant: "outline" })}>
            Créer manuellement
          </Link>
        }
      />

      <div role="tablist" aria-label="Type d'import" className="grid grid-cols-3 gap-1 rounded-2xl bg-subtle p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={cn("flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs sm:flex-row sm:justify-center sm:text-sm", mode === tab.id ? "bg-card font-medium shadow-sm" : "text-muted")}
          >
            <tab.icon className="h-4 w-4" aria-hidden /> {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {mode === "image" && (
            <>
              {!aiOn && (
                <Alert tone="warning" title="Analyse d'images indisponible">
                  Aucune clé OpenAI n&apos;est configurée sur ce serveur : les images et PDF ne peuvent pas être analysés. Utilisez l&apos;onglet « Texte collé » (copiez le message depuis WhatsApp).
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-sm hover:bg-subtle"
                >
                  <Camera className="h-7 w-7 text-primary" aria-hidden />
                  Prendre une photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addFiles(e.dataTransfer.files);
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-sm hover:bg-subtle"
                >
                  <ImagePlus className="h-7 w-7 text-primary" aria-hidden />
                  Choisir des captures ou un PDF
                  <span className="text-xs text-muted">ou glissez-déposez ici</span>
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void addFiles(e.target.files)} aria-label="Prendre une photo" />
              <input ref={galleryRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf" multiple className="sr-only" onChange={(e) => void addFiles(e.target.files)} aria-label="Choisir des fichiers" />
              {files.length > 0 && (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Fichiers sélectionnés">
                  {files.map((f, i) => (
                    <li key={i} className="relative overflow-hidden rounded-xl border border-border bg-subtle">
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt={`Aperçu ${i + 1}`} className="h-40 w-full object-cover object-top" />
                      ) : (
                        <div className="flex h-40 flex-col items-center justify-center gap-1 text-sm text-muted">
                          <FileText className="h-8 w-8" aria-hidden /> {f.file.name}
                        </div>
                      )}
                      <button
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute right-1 top-1 rounded-full bg-card/90 p-1.5 shadow"
                        aria-label={`Retirer le fichier ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {mode === "text" && (
            <div>
              <label htmlFor="paste" className="mb-1 block text-sm font-medium">
                Texte du message
              </label>
              <Textarea
                id="paste"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"Formation Cellules « Zoom »\n1. Lundi 16 novembre 20h30 - 22h\n2. Lundi 14 décembre 20h30 - 22h"}
              />
              <p className="mt-1 text-xs text-muted">Le texte est d&apos;abord analysé localement, sans être transmis à un service d&apos;IA.</p>
            </div>
          )}

          {mode === "ics" && (
            <div>
              <label htmlFor="ics" className="mb-1 block text-sm font-medium">
                Fichier iCalendar (.ics)
              </label>
              <input id="ics" type="file" accept=".ics,text/calendar" onChange={(e) => setIcs(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
              Stockage privé. {me.profile.delete_captures_after_analysis ? "Les fichiers sont supprimés après l'analyse." : "Vous pouvez supprimer les fichiers après l'analyse."}
            </p>
            <Button size="lg" onClick={analyze} loading={Boolean(busy)} disabled={mode === "image" && !aiOn}>
              {busy ?? "Analyser"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {jobs && jobs.jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Analyses récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {jobs.jobs.map((j) => (
                <li key={j.id}>
                  <Link href={`/capture/${j.id}`} className="flex items-center justify-between py-2 text-sm hover:underline">
                    <span>Analyse {relative(j.created_at)}</span>
                    <Badge tone={j.status === "needs_review" ? "warning" : j.status === "failed" ? "danger" : j.status === "completed" ? "success" : "neutral"}>
                      {{ pending: "En attente", processing: "En cours", needs_review: "À valider", completed: "Terminée", failed: "Échec" }[j.status] ?? j.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
