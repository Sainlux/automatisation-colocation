"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { CalendarPlus, Camera, ChevronRight, ClipboardPaste, FileText, ImagePlus, MessageSquareText, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { prepareImage } from "@/components/app/image-prep";
import { DEMO_MESSAGE } from "@/components/app/demo-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { ActionBar } from "@/components/ui/action-bar";
import { Disclosure } from "@/components/ui/disclosure";
import { ErrorState, PageHeader, StaleBanner } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { plural, relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type Mode = "text" | "image" | "ics";
type Job = { id: string; status: string; created_at: string };

const MAX_FILES = 5;
const MAX_IMAGE_MB = 10;
const MAX_PDF_MB = 15;
const MAX_ICS_MB = 1;
const MB = 1024 * 1024;

const JOB_STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "danger" | "success" }> = {
  pending: { label: "En attente", tone: "neutral" },
  processing: { label: "Lecture en cours", tone: "neutral" },
  needs_review: { label: "À vérifier", tone: "warning" },
  completed: { label: "Terminé", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
};

const noopSubscribe = () => () => undefined;

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
  const aiOn = me.integrations.ai.available;
  const admin = isAdmin(me.role);

  // Partage depuis une autre application (Web Share Target, texte) : /capture?text=…
  const shared = [sp.get("title"), sp.get("text"), sp.get("url")].filter(Boolean).join("\n");
  // Fichiers partagés (déposés par le service worker) ou partage de fichiers non transmis.
  const sharedFiles = sp.get("partage") === "1";
  const filesFallback = sp.get("fichiers") === "1";
  const example = sp.get("exemple") === "1";
  const modeParam = sp.get("mode");

  const [mode, setMode] = useState<Mode>(() => {
    if (sharedFiles || filesFallback || modeParam === "photo") return "image";
    if (modeParam === "ics") return "ics";
    if (modeParam === "texte" || shared || example || !aiOn) return "text";
    return "image";
  });
  const [files, setFiles] = useState<{ file: File; preview: string | null }[]>([]);
  const [text, setText] = useState(() => shared || (example ? DEMO_MESSAGE : ""));
  const [demo, setDemo] = useState(!shared && example);
  const [ics, setIcs] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ text: null, image: null, ics: null });
  const jobs = useApi<{ jobs: Job[] }>("/api/extract-events");

  const canReadClipboard = useSyncExternalStore(noopSubscribe, () => typeof navigator.clipboard?.readText === "function", () => false);
  const standalone = useSyncExternalStore(
    noopSubscribe,
    () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );

  // Le message partagé ne reste pas dans l'adresse (historique, captures d'écran…).
  useEffect(() => {
    if (shared) router.replace("/capture", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Libère les aperçus encore affichés quand on quitte la page.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  useEffect(() => {
    if (!sharedFiles || !("caches" in window)) return;
    let cancelled = false;
    (async () => {
      const cache = await caches.open("cc-share-target");
      const keys = await cache.keys();
      const list: File[] = [];
      for (const k of keys) {
        const r = await cache.match(k);
        if (!r) continue;
        const blob = await r.blob();
        list.push(new File([blob], decodeURIComponent(r.headers.get("x-filename") ?? "capture"), { type: blob.type }));
        await cache.delete(k);
      }
      if (!cancelled && list.length) {
        const dt = new DataTransfer();
        list.forEach((f) => dt.items.add(f));
        await addFiles(dt.files);
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFiles]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const raw of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setError(`Vous pouvez ajouter ${MAX_FILES} fichiers au plus par import.`);
        break;
      }
      const isPdf = raw.type === "application/pdf" || raw.name.toLowerCase().endsWith(".pdf");
      const isImage = raw.type.startsWith("image/") || /\.(heic|heif)$/i.test(raw.name);
      if (!isPdf && !isImage) {
        setError(`« ${raw.name} » n'est ni une image ni un PDF. Choisissez une capture d'écran, une photo ou un PDF.`);
        continue;
      }
      try {
        const file = isPdf ? raw : await prepareImage(raw);
        const maxMb = isPdf ? MAX_PDF_MB : MAX_IMAGE_MB;
        if (file.size > maxMb * MB) {
          setError(`Ce fichier est trop lourd (max. ${maxMb} Mo). Essayez une capture d'écran plutôt qu'une photo.`);
          continue;
        }
        next.push({ file, preview: isPdf ? null : URL.createObjectURL(file) });
      } catch {
        setError(`« ${raw.name} » n'a pas pu être ouvert. Pour une photo d'iPhone, faites plutôt une capture d'écran.`);
      }
    }
    setFiles(next);
  }

  function removeFile(i: number) {
    const f = files[i];
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setFiles(files.filter((_, j) => j !== i));
  }

  function chooseIcs(file: File | null) {
    setError(null);
    if (file && file.size > MAX_ICS_MB * MB) {
      setIcs(null);
      setError(`Ce fichier est trop lourd (max. ${MAX_ICS_MB} Mo). Exportez seulement les dates utiles depuis votre agenda.`);
      return;
    }
    setIcs(file);
  }

  async function pasteFromClipboard() {
    setPasteHint(null);
    try {
      const copied = await navigator.clipboard.readText();
      if (copied.trim()) {
        setText(copied);
        setDemo(false);
        setError(null);
        return;
      }
      setPasteHint("Rien à coller : copiez d'abord le message dans WhatsApp.");
    } catch {
      setPasteHint("Touchez la zone de texte, puis « Coller ».");
    }
    textRef.current?.focus();
  }

  function fillExample() {
    setText(DEMO_MESSAGE);
    setDemo(true);
    setError(null);
    setPasteHint(null);
  }

  function selectMode(m: Mode, focus = false) {
    setMode(m);
    setError(null);
    if (focus) tabRefs.current[m]?.focus();
  }

  const tabs: { id: Mode; label: string; srExtra?: string; icon: typeof Camera }[] = [
    { id: "text", label: "Coller le message", srExtra: " (Texte)", icon: MessageSquareText },
    { id: "image", label: "Photo ou capture", icon: ImagePlus },
    { id: "ics", label: "Fichier d'agenda (.ics)", icon: CalendarPlus },
  ];

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    const target = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (target === null) return;
    e.preventDefault();
    selectMode(tabs[target].id, true);
  }

  const imageBlocked = mode === "image" && !aiOn;
  const ready = mode === "text" ? Boolean(text.trim()) : mode === "image" ? aiOn && files.length > 0 : Boolean(ics);

  async function analyze() {
    if (!ready) return;
    setError(null);
    const form = new FormData();
    if (mode === "image") files.forEach((f) => form.append("files", f.file, f.file.name));
    else if (mode === "text") form.append("text", text);
    else if (ics) form.append("ics", ics, ics.name);
    try {
      setBusy("Envoi sécurisé…");
      const up = await apiFetch<{ jobId: string }>("/api/uploads", { method: "POST", body: form });
      setBusy("Lecture du message…");
      await apiFetch("/api/extract-events", { method: "POST", json: { jobId: up.jobId } });
      router.push(`/capture/${up.jobId}`);
    } catch (e) {
      setBusy(null);
      if (e instanceof ApiError && (e.status === 413 || e.message === "Envoi trop volumineux.")) {
        setError(`Ces fichiers sont trop lourds ensemble. Retirez-en un, ou utilisez des captures d'écran plutôt que des photos.`);
      } else {
        setError(e instanceof ApiError ? e.message : "Envoi impossible. Vérifiez votre connexion internet, puis réessayez.");
      }
    }
  }

  const status = busy
    ? busy
    : imageBlocked
      ? "Passez au texte pour continuer."
      : !ready
        ? mode === "text"
          ? "Collez le message pour continuer."
          : mode === "image"
            ? "Ajoutez une capture ou une photo."
            : "Choisissez un fichier .ics."
        : mode === "image"
          ? `${plural(files.length, "fichier prêt", "fichiers prêts")} à lire.`
          : mode === "ics"
            ? "Fichier prêt à lire."
            : "Message prêt à lire.";

  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.capture} description="CellConnect trouve les dates, vous les vérifiez avant tout ajout." />

      <div role="tablist" aria-label="Que voulez-vous importer ?" className="grid grid-cols-3 gap-1 rounded-2xl bg-subtle p-1">
        {tabs.map((tab, i) => {
          const selected = mode === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="capture-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectMode(tab.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center text-xs leading-tight text-balance transition-colors duration-(--dur-fast) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-row sm:text-sm",
                selected ? "bg-card font-semibold text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              <tab.icon className={cn("h-5 w-5 shrink-0", selected && "text-primary")} aria-hidden />
              <span>
                {tab.label}
                {tab.srExtra && <span className="sr-only">{tab.srExtra}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <Card id="capture-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {mode === "text" && (
            <>
              {canReadClipboard && (
                <Button type="button" variant="outline" size="lg" className="w-full" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="h-5 w-5" aria-hidden /> Coller le message copié
                </Button>
              )}
              <Field label="Texte du message" htmlFor="paste" hint={pasteHint ?? undefined}>
                <Textarea
                  ref={textRef}
                  id="paste"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (!e.target.value.trim()) setDemo(false);
                  }}
                  rows={6}
                  enterKeyHint="enter"
                  className="max-h-[40dvh]"
                  placeholder={"Ex. Formation Cellules « Zoom »\n1. Lundi 16 novembre 20h30 - 22h"}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={fillExample}>
                  <Sparkles className="h-4 w-4 text-warm" aria-hidden /> Essayer avec un exemple
                </Button>
                {demo && <p className="text-xs text-muted">Message d&apos;exemple. Rien n&apos;est enregistré avant votre validation finale.</p>}
              </div>
              <Disclosure summary="Comment copier un message WhatsApp ?">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Dans WhatsApp, appuyez longuement sur le message.</li>
                  <li>Touchez « Copier ».</li>
                  <li>Revenez ici et touchez {canReadClipboard ? "« Coller le message copié »" : "la zone de texte, puis « Coller »"}.</li>
                </ol>
                {standalone && <p className="mt-2 text-muted">Astuce : dans WhatsApp, touchez « Partager » puis choisissez CellConnect, le message arrive directement ici.</p>}
              </Disclosure>
            </>
          )}

          {mode === "image" && (
            <>
              {filesFallback && (
                <Alert tone="info" size="compact">
                  Le partage n&apos;a pas pu transmettre la capture : ajoutez-la ci-dessous.
                </Alert>
              )}
              {!aiOn ? (
                <div className="space-y-3">
                  <p className="text-sm">La lecture des photos n&apos;est pas encore activée. Copiez le texte du message.</p>
                  <Button type="button" variant="outline" onClick={() => selectMode("text")}>
                    <MessageSquareText className="h-4 w-4" aria-hidden /> Passer au texte
                  </Button>
                  {admin && <p className="text-xs text-muted">Administrateur : ajoutez une clé OpenAI (OPENAI_API_KEY) sur le serveur pour activer la lecture des photos.</p>}
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input-border p-5 text-sm font-medium hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input-border p-5 text-sm font-medium hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <ImagePlus className="h-7 w-7 text-primary" aria-hidden />
                      Choisir des captures ou un PDF
                      <span className="text-xs font-normal text-muted">ou glissez-les ici</span>
                    </button>
                  </div>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => void addFiles(e.target.files)} aria-label="Prendre une photo" />
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => void addFiles(e.target.files)}
                    aria-label="Choisir des fichiers"
                  />
                </>
              )}
              {files.length > 0 && (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Fichiers sélectionnés">
                  {files.map((f, i) => (
                    <li key={`${f.file.name}-${i}`} className="relative overflow-hidden rounded-xl border border-border bg-subtle">
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt={`Aperçu ${i + 1}`} className="h-40 w-full object-cover object-top" />
                      ) : (
                        <div className="flex h-40 flex-col items-center justify-center gap-1 p-2 text-center text-sm text-muted">
                          <FileText className="h-8 w-8" aria-hidden /> <span className="wrap-anywhere">{f.file.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-xl bg-card/90 shadow-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={`Retirer le fichier ${i + 1}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {mode === "ics" && (
            <Field label="Fichier d'agenda (.ics)" htmlFor="ics" hint={`Exporté depuis Google Agenda, Outlook ou Calendrier d'Apple (max. ${MAX_ICS_MB} Mo).`}>
              <input
                id="ics"
                type="file"
                accept=".ics,text/calendar"
                onChange={(e) => chooseIcs(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border file:border-solid file:border-input-border file:bg-card file:px-4 file:text-sm file:font-medium file:text-fg hover:file:bg-subtle"
              />
            </Field>
          )}

          {!imageBlocked && (
            <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted">
              {mode === "text" && (
                <p>
                  Lu par CellConnect, sans IA.
                  {aiOn && " Si le message est ambigu, il peut être transmis à l'IA (OpenAI) uniquement pour en extraire les dates."}
                </p>
              )}
              {mode === "image" && <p>Vos captures sont lues par l&apos;IA (OpenAI) pour repérer les dates. Astuce : recadrez sur l&apos;annonce.</p>}
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <span>
                  Stockage privé · {me.profile.delete_captures_after_analysis ? "supprimé après l'analyse" : "conservé pour une durée limitée"} ·{" "}
                  <Link href="/parametres#donnees" className="inline-flex min-h-6 items-center font-medium text-accent underline-offset-2 hover:underline">
                    Mes données
                  </Link>
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert tone="danger" live>
          {error}
        </Alert>
      )}

      <ActionBar status={status}>
        <Button size="lg" onClick={analyze} loading={Boolean(busy)} disabled={!ready} className="min-w-36">
          Analyser
        </Button>
      </ActionBar>

      <p className="text-center text-sm text-muted">
        Pas de message à importer ?{" "}
        <Link href="/evenements/nouveau" className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
          Créer un événement à la main
        </Link>
      </p>

      <RecentJobs jobs={jobs} />
    </div>
  );
}

function RecentJobs({ jobs }: { jobs: ReturnType<typeof useApi<{ jobs: Job[] }>> }) {
  const { data, error, loading, reload } = jobs;
  if (!data && loading) return null;
  if (error && !data) return <ErrorState status={error.status} message={error.message} onRetry={reload} />;
  if (!data || data.jobs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyses récentes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <StaleBanner onRetry={reload} />}
        <ul className="divide-y divide-border">
          {data.jobs.map((j) => {
            const s = JOB_STATUS[j.status] ?? { label: j.status, tone: "neutral" as const };
            return (
              <li key={j.id}>
                <Link href={`/capture/${j.id}`} className="flex min-h-12 items-center gap-2 py-2 text-sm hover:underline">
                  <span className="min-w-0 flex-1 first-letter:uppercase">Import {relative(j.created_at)}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
