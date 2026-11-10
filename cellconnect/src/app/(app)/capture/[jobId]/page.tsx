"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleCheck, Info, LoaderCircle, RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { apiFetch, ApiError, newIdempotencyKey, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { fmtFullDate, fmtRange } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface Issue {
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
}
interface Draft {
  key: string;
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  description: string | null;
  groupId: string | null;
  recurrenceRule: string | null;
  confidence: number;
  sourceExcerpt: string | null;
  issues: Issue[];
  yearSuggestion: { year: number; reason: string } | null;
  confirmed: boolean;
  status?: "pending" | "created" | "rejected";
  eventId?: string | null;
}
interface JobData {
  job: { id: string; status: string; step: keyof typeof t.steps; error: string | null; warnings: string[]; context_notes: string | null; provider: string | null; canRetry: boolean };
  drafts: Draft[];
  uploads: { id: string; kind: string; deleted: boolean; name: string | null }[];
}
interface DraftConflict {
  draftKey: string;
  kind: "full" | "partial" | "travel_buffer";
  overlapMinutes: number;
  existing?: { id: string; title: string; start: string; end: string; isOrganizer: boolean; groupId: string | null };
  otherDraftKey?: string;
}
type Choice = "keep_both" | "withdraw_existing" | "skip_new";
interface Summary {
  created: { key: string; eventId: string; title: string }[];
  skipped: string[];
  withdrawn: { eventId: string; notified: boolean }[];
  conflictsRecorded: number;
  failures: { key: string; message: string }[];
}

const STEPS: (keyof typeof t.steps)[] = ["received", "analyzing", "extracted", "review", "ready"];
const RECURRENCES = [
  { value: "", label: "Pas de répétition" },
  { value: "FREQ=WEEKLY", label: "Chaque semaine" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Toutes les deux semaines" },
  { value: "FREQ=MONTHLY", label: "Chaque mois" },
];

/** Erreurs bloquantes recalculées en direct à partir des valeurs saisies. */
function liveErrors(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = "Titre obligatoire.";
  if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) e.date = "Date obligatoire.";
  if (!d.startTime) e.startTime = "Heure de début obligatoire.";
  if (!d.endTime) e.endTime = "Heure de fin obligatoire.";
  if (d.meetingUrl && !/^https:\/\/\S+$/.test(d.meetingUrl)) e.meetingUrl = "Le lien doit commencer par https://";
  return e;
}
const visibleIssues = (d: Draft) => d.issues.filter((i) => i.severity !== "error" || liveErrors(d)[i.field] !== undefined || !["title", "date", "startTime", "endTime"].includes(i.field));
const needsConfirm = (d: Draft) => d.issues.some((i) => i.severity === "warning");

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const { me, refreshCounters } = useMe();
  const { data, error, reload } = useApi<JobData>(`/api/extract-events/${jobId}`);
  const groups = useApi<{ groups: { id: string; name: string }[] }>("/api/groups");
  const [edited, setEdited] = useState<Draft[] | null>(null);
  const [includeOverrides, setInclude] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<"edit" | "conflicts" | "recap" | "done">("edit");
  const [conflicts, setConflicts] = useState<DraftConflict[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [notify, setNotify] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const idemKey = useRef(newIdempotencyKey());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tz = me.profile.timezone;

  // Suivi de la progression tant que l'analyse est en cours.
  useEffect(() => {
    if (!data || !["pending", "processing"].includes(data.job.status)) return;
    const id = setTimeout(reload, 1500);
    return () => clearTimeout(id);
  }, [data, reload]);

  const loaded = data && data.job.status !== "pending" && data.job.status !== "processing" ? data.drafts : [];
  const drafts = edited ?? loaded;
  const include: Record<string, boolean> = Object.fromEntries(drafts.map((d) => [d.key, includeOverrides[d.key] ?? d.status !== "rejected"]));

  function persist(next: Draft[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void apiFetch(`/api/extract-events/${jobId}/drafts`, { method: "PUT", json: { drafts: next.filter((d) => d.status === "pending" || !d.status).map(stripClient) } }).catch(() => undefined);
    }, 800);
  }

  function setDrafts(next: Draft[]) {
    setEdited(next);
    persist(next);
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const pending = drafts.filter((d) => d.status !== "created" && d.status !== "rejected");
  const selected = pending.filter((d) => include[d.key]);
  const blocking = selected.filter((d) => Object.keys(liveErrors(d)).length > 0 || (needsConfirm(d) && !d.confirmed));

  async function checkConflicts() {
    setActionError(null);
    setBusy(true);
    try {
      const r = await apiFetch<{ conflicts: DraftConflict[]; errors: { key: string; messages: string[] }[] }>("/api/conflicts/check", {
        method: "POST",
        json: { drafts: selected.map(stripClient) },
      });
      if (r.errors.length) throw new Error(r.errors.map((e) => e.messages.join(" ")).join(" "));
      setConflicts(r.conflicts);
      setPhase(r.conflicts.length ? "conflicts" : "recap");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  const decisions = (() => {
    const byKey = new Map<string, { key: string; action: "create" | "skip"; withdrawFrom: string[]; notifyOrganizers: boolean; withdrawMessage: string | null }>();
    for (const d of selected) byKey.set(d.key, { key: d.key, action: "create", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null });
    conflicts.forEach((c, i) => {
      const id = conflictId(c, i);
      const choice = choices[id] ?? "keep_both";
      const dec = byKey.get(c.draftKey);
      if (!dec) return;
      if (choice === "skip_new") dec.action = "skip";
      if (choice === "withdraw_existing" && c.existing) {
        dec.withdrawFrom.push(c.existing.id);
        dec.notifyOrganizers = dec.notifyOrganizers || Boolean(notify[id]);
        if (messages[id]?.trim()) dec.withdrawMessage = messages[id].trim();
      }
    });
    return [...byKey.values()];
  })();

  async function commit() {
    setActionError(null);
    setBusy(true);
    try {
      const s = await apiFetch<Summary>("/api/events/batch", {
        method: "POST",
        idempotencyKey: idemKey.current,
        json: {
          jobId,
          drafts: selected.map(stripClient),
          decisions: [...decisions, ...pending.filter((d) => !include[d.key]).map((d) => ({ key: d.key, action: "skip" }))],
        },
      });
      setSummary(s);
      setPhase("done");
      refreshCounters();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    await apiFetch(`/api/extract-events/${jobId}/retry`, { method: "POST" }).catch((e) => setActionError(e.message));
    reload();
  }

  async function deleteSources() {
    await apiFetch(`/api/extract-events/${jobId}/sources`, { method: "DELETE" });
    reload();
  }

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <Loading />;
  const { job } = data;
  const running = job.status === "pending" || job.status === "processing";
  const stepIndex = phase === "recap" || phase === "done" ? 4 : STEPS.indexOf(job.step);

  return (
    <div className="space-y-5">
      <Link href="/capture" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Nouvelle capture
      </Link>
      <PageHeader title="Vérification des événements" description={job.context_notes ? `Contexte : ${job.context_notes}` : undefined} />

      <ol className="grid grid-cols-5 gap-1" aria-label="Progression">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                i < stepIndex || (i === stepIndex && !running && job.status !== "failed") ? "bg-success text-white" : i === stepIndex ? "bg-primary text-primary-fg" : "bg-subtle text-muted",
              )}
              aria-current={i === stepIndex ? "step" : undefined}
            >
              {i < stepIndex ? <Check className="h-4 w-4" /> : i === stepIndex && running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : i + 1}
            </span>
            <span className="text-[11px] leading-tight text-muted sm:text-xs">{t.steps[s]}</span>
          </li>
        ))}
      </ol>

      {running && <Alert tone="info" title="Analyse en cours…">Lecture du contenu et extraction des dates. Cela prend généralement quelques secondes.</Alert>}
      {job.status === "failed" && (
        <Alert tone="danger" title="L'analyse a échoué" action={job.canRetry ? <Button size="sm" variant="outline" onClick={retry}><RotateCw className="h-4 w-4" /> Relancer</Button> : undefined}>
          {job.error}
        </Alert>
      )}
      {job.warnings.map((w) => (
        <Alert key={w} tone="warning">
          {w}
        </Alert>
      ))}
      {job.provider && (
        <p className="text-xs text-muted">
          Analyse : {job.provider === "openai" ? "IA (OpenAI)" : job.provider === "ics" ? "fichier iCalendar" : "analyse locale du texte (sans IA)"}.{" "}
          {data.uploads.some((u) => !u.deleted) ? (
            <button className="underline" onClick={deleteSources}>
              Supprimer les fichiers source
            </button>
          ) : (
            "Fichiers source supprimés."
          )}
        </p>
      )}

      {!running && job.status !== "failed" && drafts.length === 0 && (
        <Alert tone="warning" title="Aucun événement trouvé">
          Essayez avec une capture plus nette, ou <Link href="/evenements/nouveau" className="underline">créez l&apos;événement manuellement</Link>.
        </Alert>
      )}

      {phase === "edit" && pending.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {pending.length} événement(s) détecté(s) · {selected.length} sélectionné(s)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDrafts(drafts.map((d) => (include[d.key] && Object.keys(liveErrors(d)).length === 0 ? { ...d, confirmed: true } : d)));
              }}
            >
              <CircleCheck className="h-4 w-4" /> Tout confirmer
            </Button>
          </div>
          <ul className="space-y-4">
            {pending.map((d, idx) => (
              <li key={d.key}>
                <DraftCard index={idx + 1} draft={d} included={Boolean(include[d.key])} onInclude={(v) => setInclude({ ...includeOverrides, [d.key]: v })} onChange={(p) => update(d.key, p)} groups={groups.data?.groups ?? []} />
              </li>
            ))}
          </ul>
          {drafts.some((d) => d.status === "created") && <p className="text-sm text-muted">{drafts.filter((d) => d.status === "created").length} événement(s) déjà créé(s) depuis cette analyse.</p>}
          {actionError && <Alert tone="danger">{actionError}</Alert>}
          <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
            <p className="text-sm">
              {blocking.length ? (
                <span className="text-warning">{blocking.length} événement(s) à compléter ou confirmer.</span>
              ) : (
                <span className="text-success">Tout est prêt pour la vérification d&apos;agenda.</span>
              )}
            </p>
            <Button onClick={checkConflicts} disabled={blocking.length > 0 || selected.length === 0} loading={busy}>
              Vérifier mon agenda
            </Button>
          </div>
        </>
      )}

      {phase === "conflicts" && (
        <div className="space-y-4">
          <Alert tone="danger" title="Attention, des événements se chevauchent.">
            Pour chaque conflit, indiquez lequel vous souhaitez maintenir. Un désistement ne concerne que vous : l&apos;événement reste maintenu pour les autres participants.
          </Alert>
          {conflicts.map((c, i) => {
            const id = conflictId(c, i);
            const draft = drafts.find((d) => d.key === c.draftKey)!;
            const other = c.otherDraftKey ? drafts.find((d) => d.key === c.otherDraftKey) : null;
            const choice = choices[id] ?? "keep_both";
            return (
              <Card key={id}>
                <CardContent className="space-y-3 pt-4 sm:pt-5">
                  <p className="text-sm font-medium">
                    {c.kind === "travel_buffer" ? "Temps de déplacement insuffisant entre deux événements" : `Chevauchement de ${c.overlapMinutes} minutes`} — lequel souhaitez-vous maintenir ?
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Side label="Nouvel événement" title={draft.title} when={`${draft.date ? fmtFullDate(draft.date) : ""} · ${draft.startTime} – ${draft.endTime}`} tone="primary" />
                    {c.existing ? (
                      <Side label={c.existing.isOrganizer ? "Déjà dans votre agenda (vous organisez)" : "Déjà dans votre agenda"} title={c.existing.title} when={fmtRange(c.existing.start, c.existing.end, tz)} tone="neutral" />
                    ) : (
                      other && <Side label="Autre événement importé" title={other.title} when={`${other.date ? fmtFullDate(other.date) : ""} · ${other.startTime} – ${other.endTime}`} tone="neutral" />
                    )}
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="sr-only">Décision</legend>
                    <Radio name={id} checked={choice === "keep_both"} onChange={() => setChoices({ ...choices, [id]: "keep_both" })} label="Garder les deux pour l'instant (le conflit restera visible dans « Conflits d'agenda »)" />
                    {c.existing && (
                      <Radio
                        name={id}
                        checked={choice === "withdraw_existing"}
                        onChange={() => setChoices({ ...choices, [id]: "withdraw_existing" })}
                        label={`Maintenir le nouvel événement et me désister de « ${c.existing.title} »`}
                      />
                    )}
                    <Radio name={id} checked={choice === "skip_new"} onChange={() => setChoices({ ...choices, [id]: "skip_new" })} label={`Ne pas ajouter « ${draft.title} » (${draft.date ? fmtFullDate(draft.date) : ""})`} />
                  </fieldset>
                  {choice === "withdraw_existing" && c.existing && !c.existing.isOrganizer && (
                    <div className="space-y-2 rounded-xl bg-subtle p-3">
                      <Checkbox checked={Boolean(notify[id])} onChange={(e) => setNotify({ ...notify, [id]: e.target.checked })} label="Prévenir l'organisateur de mon absence" />
                      {notify[id] && (
                        <Field label="Message (facultatif)" hint="Par défaut, un message poli est envoyé. L'autre événement n'est jamais mentionné.">
                          <Textarea rows={3} value={messages[id] ?? ""} onChange={(e) => setMessages({ ...messages, [id]: e.target.value })} placeholder="Bonjour, je ne pourrai pas participer à cette réunion en raison d'un conflit d'agenda. Merci de votre compréhension." />
                        </Field>
                      )}
                    </div>
                  )}
                  {choice === "withdraw_existing" && c.existing?.isOrganizer && (
                    <Alert tone="info">Vous êtes l&apos;organisateur : s&apos;il n&apos;a pas d&apos;autre participant, cet événement sera retiré de votre agenda. Sinon, il reste maintenu pour les autres.</Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setPhase("edit")}>
              Retour
            </Button>
            <Button onClick={() => setPhase("recap")}>Voir le récapitulatif</Button>
          </div>
        </div>
      )}

      {phase === "recap" && (
        <Card>
          <CardContent className="space-y-4 pt-4 sm:pt-5">
            <h2 className="font-semibold">Récapitulatif des actions</h2>
            <RecapList title="Événements ajoutés à votre agenda" items={decisions.filter((d) => d.action === "create").map((d) => describe(drafts.find((x) => x.key === d.key)!))} tone="success" />
            <RecapList
              title="Événements non ajoutés"
              items={[...decisions.filter((d) => d.action === "skip"), ...pending.filter((d) => !include[d.key])].map((d) => describe(drafts.find((x) => x.key === d.key)!))}
              tone="neutral"
            />
            <RecapList
              title="Désistements (vous seul·e)"
              items={conflicts
                .map((c, i) => ({ c, id: conflictId(c, i) }))
                .filter(({ id, c }) => choices[id] === "withdraw_existing" && c.existing)
                .map(({ c, id }) => `${c.existing!.title} — ${fmtRange(c.existing!.start, c.existing!.end, tz)}${notify[id] ? " · l'organisateur sera prévenu" : ""}`)}
              tone="warning"
            />
            <RecapList
              title="Conflits conservés (à résoudre plus tard)"
              items={conflicts
                .map((c, i) => ({ c, id: conflictId(c, i) }))
                .filter(({ id }) => (choices[id] ?? "keep_both") === "keep_both")
                .map(({ c }) => `${drafts.find((d) => d.key === c.draftKey)?.title} ↔ ${c.existing?.title ?? drafts.find((d) => d.key === c.otherDraftKey)?.title}`)}
              tone="danger"
            />
            <p className="text-xs text-muted">
              Rappels programmés selon vos préférences ({me.profile.reminder_offsets.map((o) => (o >= 1440 ? `${o / 1440} j` : o >= 60 ? `${o / 60} h` : `${o} min`)).join(", ")} avant).
            </p>
            {actionError && <Alert tone="danger">{actionError}</Alert>}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setPhase(conflicts.length ? "conflicts" : "edit")}>
                Retour
              </Button>
              <Button size="lg" onClick={commit} loading={busy}>
                Confirmer et enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "done" && summary && (
        <Card>
          <CardContent className="space-y-3 pt-4 sm:pt-5">
            <Alert tone={summary.failures.length ? "warning" : "success"} title={`${summary.created.length} événement(s) enregistré(s)`}>
              {summary.withdrawn.length > 0 && <p>{summary.withdrawn.length} désistement(s) enregistré(s){summary.withdrawn.some((w) => w.notified) ? ", organisateur(s) prévenu(s)" : ""}.</p>}
              {summary.conflictsRecorded > 0 && <p>{summary.conflictsRecorded} conflit(s) restent à résoudre.</p>}
            </Alert>
            {summary.failures.map((f) => (
              <Alert key={f.key} tone="danger">
                {f.message}
              </Alert>
            ))}
            <ul className="space-y-1">
              {summary.created.map((c) => (
                <li key={c.eventId}>
                  <Link href={`/evenements/${c.eventId}`} className="text-sm text-accent hover:underline">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href="/calendrier" className={buttonVariants()}>
                Voir le calendrier
              </Link>
              {summary.conflictsRecorded > 0 && (
                <Link href="/conflits" className={buttonVariants({ variant: "outline" })}>
                  Résoudre les conflits
                </Link>
              )}
              <Link href="/capture" className={buttonVariants({ variant: "ghost" })}>
                Nouvelle capture
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function stripClient(d: Draft) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status, eventId, ...rest } = d;
  return { ...rest, issues: visibleIssues(d) };
}

function conflictId(c: DraftConflict, i: number) {
  return `${c.draftKey}:${c.existing?.id ?? c.otherDraftKey}:${i}`;
}

function describe(d: Draft) {
  return `${d.title} — ${d.date ? fmtFullDate(d.date) : "?"}, ${d.startTime} – ${d.endTime}`;
}

function Side({ label, title, when, tone }: { label: string; title: string; when: string; tone: "primary" | "neutral" }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "primary" ? "border-accent/40 bg-info-bg" : "border-border bg-subtle")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted first-letter:uppercase">{when}</p>
    </div>
  );
}

function Radio({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm", checked ? "border-accent bg-info-bg" : "border-border")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

function RecapList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "neutral" | "warning" | "danger" }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium">
        <Badge tone={tone}>{items.length}</Badge> {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
        {items.map((i, k) => (
          <li key={k} className="first-letter:uppercase">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftCard({ index, draft: d, included, onInclude, onChange, groups }: { index: number; draft: Draft; included: boolean; onInclude: (v: boolean) => void; onChange: (p: Partial<Draft>) => void; groups: { id: string; name: string }[] }) {
  const errs = liveErrors(d);
  const issues = visibleIssues(d).filter((i) => !(i.severity === "error" && ["title", "date", "startTime", "endTime"].includes(i.field)));
  const warn = needsConfirm(d);
  const id = (f: string) => `${d.key}-${f}`;
  return (
    <Card className={cn(!included && "opacity-60", included && Object.keys(errs).length > 0 && "border-warning/60")}>
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone="primary">#{index}</Badge>
            <Badge tone={d.confidence >= 0.8 ? "success" : d.confidence >= 0.5 ? "warning" : "danger"}>Confiance {Math.round(d.confidence * 100)} %</Badge>
          </div>
          <Checkbox checked={included} onChange={(e) => onInclude(e.target.checked)} label="Ajouter" />
        </div>

        {included && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Titre" htmlFor={id("title")} error={errs.title} className="sm:col-span-2">
                <Input id={id("title")} value={d.title} onChange={(e) => onChange({ title: e.target.value, confirmed: false })} />
              </Field>
              <Field label="Date" htmlFor={id("date")} error={errs.date} hint={d.date ? fmtFullDate(d.date) : undefined}>
                <Input id={id("date")} type="date" value={d.date ?? ""} onChange={(e) => onChange({ date: e.target.value || null, confirmed: false })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Début" htmlFor={id("start")} error={errs.startTime}>
                  <Input id={id("start")} type="time" value={d.startTime ?? ""} onChange={(e) => onChange({ startTime: e.target.value || null })} />
                </Field>
                <Field label="Fin" htmlFor={id("end")} error={errs.endTime}>
                  <Input id={id("end")} type="time" value={d.endTime ?? ""} onChange={(e) => onChange({ endTime: e.target.value || null })} />
                </Field>
              </div>
              {!d.endTime && d.startTime && (
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <span className="text-xs text-muted">Durée :</span>
                  {[60, 90, 120].map((m) => (
                    <Button key={m} size="sm" variant="outline" onClick={() => onChange({ endTime: addMinutes(d.startTime!, m) })}>
                      {m === 60 ? "1 h" : m === 90 ? "1 h 30" : "2 h"}
                    </Button>
                  ))}
                </div>
              )}
              <Field label="Lieu" htmlFor={id("loc")}>
                <Input id={id("loc")} value={d.location ?? ""} onChange={(e) => onChange({ location: e.target.value || null })} placeholder="Adresse ou salle" />
              </Field>
              <Field label="Lien de réunion" htmlFor={id("url")} error={errs.meetingUrl}>
                <Input id={id("url")} type="url" inputMode="url" value={d.meetingUrl ?? ""} onChange={(e) => onChange({ meetingUrl: e.target.value || null })} placeholder="https://zoom.us/j/…" />
              </Field>
              <Field label="Groupe" htmlFor={id("group")}>
                <Select id={id("group")} value={d.groupId ?? ""} onChange={(e) => onChange({ groupId: e.target.value || null })}>
                  <option value="">Personnel (aucun groupe)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Répétition" htmlFor={id("rec")}>
                <Select id={id("rec")} value={d.recurrenceRule ?? ""} onChange={(e) => onChange({ recurrenceRule: e.target.value || null })}>
                  {RECURRENCES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" htmlFor={id("desc")} className="sm:col-span-2">
                <Textarea id={id("desc")} rows={2} value={d.description ?? ""} onChange={(e) => onChange({ description: e.target.value || null })} />
              </Field>
            </div>

            {issues.length > 0 && (
              <ul className="space-y-1.5">
                {issues.map((i, k) => (
                  <li key={k} className={cn("flex gap-2 text-sm", i.severity === "warning" ? "text-warning" : i.severity === "error" ? "text-danger" : "text-muted")}>
                    {i.severity === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            )}

            {d.sourceExcerpt && (
              <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
                Source : « {d.sourceExcerpt} »
              </p>
            )}

            {warn && (
              <Checkbox
                className={cn("rounded-xl border p-3", d.confirmed ? "border-success/50 bg-success-bg" : "border-warning/50 bg-warning-bg")}
                checked={d.confirmed}
                onChange={(e) => onChange({ confirmed: e.target.checked })}
                label={<span className="font-medium">J&apos;ai vérifié ces informations{d.date ? ` (${fmtFullDate(d.date)})` : ""}</span>}
              />
            )}
          </>
        )}
        {!included && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Trash2 className="h-4 w-4" aria-hidden /> {d.title || "Événement"} ne sera pas ajouté.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
