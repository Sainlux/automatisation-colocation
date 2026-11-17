"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type Ref, type SetStateAction } from "react";
import { Check, ChevronLeft, LoaderCircle, MessageSquareText, Pencil, RotateCw, Trash2 } from "lucide-react";
import { apiFetch, ApiError, errorText, newIdempotencyKey, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ActionBar, ActionBarSpacer } from "@/components/ui/action-bar";
import { Disclosure } from "@/components/ui/disclosure";
import { Stepper } from "@/components/ui/stepper";
import { EmptyState, ErrorState, PageHeader, Skeleton, StaleBanner } from "@/components/ui/states";
import { frTypo, plural } from "@/components/app/format";
import { ApplyToAll, DraftCard } from "@/components/app/review/draft-card";
import { ConflictCard } from "@/components/app/review/conflict-card";
import { RecapSummary } from "@/components/app/review/recap-summary";
import { DonePanel } from "@/components/app/review/done-panel";
import {
  buildDecisions,
  buildRecap,
  commonTitleOf,
  conflictId,
  draftStatus,
  groupedIssues,
  hasErrors,
  includedByDefault,
  isBlocking,
  liveErrors,
  needsConfirm,
  stripClient,
  uniqueConflicts,
  type Choice,
  type Draft,
  type DraftConflict,
  type GroupOption,
  type Summary,
} from "@/components/app/review/draft-utils";
import { scrollBehavior } from "@/components/app/motion";
import { t } from "@/i18n";

interface JobData {
  /** Organisation de l'import (peut différer de l'organisation active). */
  organizationId?: string;
  job: { id: string; status: string; step: keyof typeof t.steps; error: string | null; warnings: string[]; context_notes: string | null; provider: string | null; canRetry: boolean };
  drafts: Draft[];
  uploads: { id: string; kind: string; deleted: boolean; name: string | null }[];
}
type Phase = "edit" | "conflicts" | "recap" | "done";
type SaveState = "idle" | "saving" | "saved" | "error";

const PHASE_TITLES: Record<Phase, string> = {
  edit: t.reviewTitles.review,
  conflicts: "Choisissez pour chaque chevauchement",
  recap: "Avant d'enregistrer",
  done: "C'est dans votre agenda",
};
const BACK = { href: "/capture", label: t.nav.captureShort };
const NO_DRAFTS: Draft[] = [];
const NO_GROUPS: GroupOption[] = [];
/** Intervalle de suivi de l'analyse : 1 s, puis 2 s, puis 4 s. */
const POLL_DELAYS = [1000, 2000];
const POLL_MAX_DELAY = 4000;
const POLL_PATIENCE_MS = 90_000;

const isRunning = (status: string) => status === "pending" || status === "processing";

/** Étape gardée dans l'adresse (?etape=…) : un rechargement ou un retour arrière ne fait pas tout perdre. */
const STEP_PARAM: Partial<Record<Phase, string>> = { conflicts: "conflits", recap: "recap" };
const PHASE_OF_PARAM: Record<string, Phase> = { conflits: "conflicts", recap: "recap" };

/** Choix faits pendant la vérification, gardés pour cet onglet (sessionStorage), par import. */
interface StoredChoices {
  choices: Record<string, Choice>;
  notify: Record<string, boolean>;
  messages: Record<string, string>;
}
const storageKey = (jobId: string) => `cc-review-${jobId}`;
function readStored(jobId: string): StoredChoices | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(storageKey(jobId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredChoices>;
    return { choices: v.choices ?? {}, notify: v.notify ?? {}, messages: v.messages ?? {} };
  } catch {
    return null;
  }
}
function writeStored(jobId: string, v: StoredChoices | null) {
  try {
    if (v) window.sessionStorage.setItem(storageKey(jobId), JSON.stringify(v));
    else window.sessionStorage.removeItem(storageKey(jobId));
  } catch {
    // Navigation privée ou stockage plein : les choix restent seulement en mémoire.
  }
}
function readFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // Stockage indisponible : sans conséquence.
  }
}
function writeStepParam(phase: Phase) {
  try {
    const url = new URL(window.location.href);
    const value = STEP_PARAM[phase];
    if (value) url.searchParams.set("etape", value);
    else url.searchParams.delete("etape");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  } catch {
    // Sans conséquence : l'étape n'est simplement pas gardée dans l'adresse.
  }
}

/** Le serveur ajoute parfois « Vous pouvez relancer l'analyse. » : le bouton « Relancer » le dit déjà. */
const cleanJobError = (msg: string | null) => (msg ? msg.replace(/\s*Vous pouvez relancer l'analyse\.\s*$/, "").trim() || null : null);

const SAVE_FAILED = "Rien n'a été enregistré. Vérifiez votre connexion puis touchez Ajouter à nouveau.";
/** Seuls les brouillons encore en attente sont enregistrés (comme avant). */
const savePayload = (list: Draft[]) => ({ drafts: list.filter((d) => d.status === "pending" || !d.status).map(stripClient) });

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const { me, refreshCounters } = useMe();
  // Lu une seule fois, au montage (null côté serveur : ces choix ne sont pas affichés avant le chargement).
  const [stored] = useState(() => readStored(jobId));
  const { data, error, loading, reload } = useApi<JobData>(`/api/extract-events/${jobId}`);
  const groups = useApi<{ groups: GroupOption[] }>("/api/groups");
  const [edited, setEdited] = useState<Draft[] | null>(null);
  const [includeOverrides, setInclude] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("edit");
  const [conflicts, setConflicts] = useState<DraftConflict[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>(stored?.choices ?? {});
  const [notify, setNotify] = useState<Record<string, boolean>>(stored?.notify ?? {});
  const [messages, setMessages] = useState<Record<string, string>>(stored?.messages ?? {});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [reveal, setReveal] = useState<{ key: string; n: number } | null>(null);
  const [slow, setSlow] = useState(false);
  const idemKey = useRef(newIdempotencyKey());
  const committing = useRef(false);
  const tz = me.profile.timezone;
  const groupList = groups.data?.groups ?? NO_GROUPS;

  /* ───────────── Suivi de l'analyse ───────────── */

  const running = Boolean(data && isRunning(data.job.status));
  const polling = running && !slow;
  const pollCount = useRef(0);
  const pollStart = useRef<number | null>(null);

  // Relancé après chaque réponse, y compris une erreur ; en pause quand l'onglet est caché.
  useEffect(() => {
    if (!polling || loading) return;
    if (pollStart.current === null) pollStart.current = Date.now();
    const delay = POLL_DELAYS[pollCount.current] ?? POLL_MAX_DELAY;
    const id = setTimeout(() => {
      if (Date.now() - (pollStart.current ?? Date.now()) > POLL_PATIENCE_MS) return setSlow(true);
      if (document.hidden) return; // repris au retour sur l'onglet
      pollCount.current += 1;
      reload();
    }, delay);
    return () => clearTimeout(id);
  }, [polling, loading, data, error, reload]);

  useEffect(() => {
    if (!polling) return;
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [polling, reload]);

  function restartPolling() {
    pollStart.current = Date.now();
    pollCount.current = 0;
    setSlow(false);
    reload();
  }

  /* ───────────── Brouillons et sauvegarde ───────────── */

  const loaded = data && !running ? data.drafts : NO_DRAFTS;
  const drafts = edited ?? loaded;
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Coché par défaut, sauf les dates refusées ou déjà passées (avertissement du serveur affiché sur la carte).
  const include: Record<string, boolean> = Object.fromEntries(drafts.map((d) => [d.key, includeOverrides[d.key] ?? includedByDefault(d)]));

  const saveUrl = `/api/extract-events/${jobId}/drafts`;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsaved = useRef<Draft[] | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  /** Envoie la dernière version en attente (les envois sont faits l'un après l'autre). */
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const next = unsaved.current;
    if (!next) return saveChain.current;
    unsaved.current = null;
    saveChain.current = saveChain.current.then(async () => {
      try {
        await apiFetch(saveUrl, { method: "PUT", json: savePayload(next) });
        if (!unsaved.current) setSaveState("saved");
      } catch {
        unsaved.current ??= next;
        setSaveState("error");
      }
    });
    return saveChain.current;
  }, [saveUrl]);

  const persist = useCallback(
    (next: Draft[]) => {
      unsaved.current = next;
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  // Départ de la page (onglet fermé, navigation) : envoi immédiat, qui survit à la fermeture.
  useEffect(() => {
    const sendNow = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const next = unsaved.current;
      if (!next) return;
      unsaved.current = null;
      void apiFetch(saveUrl, { method: "PUT", json: savePayload(next), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", sendNow);
    return () => {
      window.removeEventListener("pagehide", sendNow);
      sendNow();
    };
  }, [saveUrl]);

  const setDrafts = useCallback(
    (next: Draft[]) => {
      draftsRef.current = next;
      setEdited(next);
      persist(next);
    },
    [persist],
  );

  // Rappels stables : DraftCard est mémoïsée, seule la carte modifiée se redessine.
  const update = useCallback((key: string, patch: Partial<Draft>) => setDrafts(draftsRef.current.map((d) => (d.key === key ? { ...d, ...patch } : d))), [setDrafts]);
  const onInclude = useCallback((key: string, value: boolean) => setInclude((prev) => ({ ...prev, [key]: value })), []);

  const pending = drafts.filter((d) => d.status !== "created" && d.status !== "rejected");
  const selected = pending.filter((d) => include[d.key]);
  const blocking = selected.filter(isBlocking);
  const commonTitle = commonTitleOf(pending);
  const grouped = groupedIssues(selected);
  const groupedKinds = useKindSet(grouped.map((g) => g.kind));

  /** « Ces N dates sont justes » (même règle que l'ancien « Tout confirmer ») : confirme les dates sélectionnées sans erreur. */
  function confirmAll() {
    setDrafts(drafts.map((d) => (include[d.key] && Object.keys(liveErrors(d)).length === 0 ? { ...d, confirmed: true } : d)));
  }

  function applyToAll(patch: Partial<Draft>) {
    setDrafts(drafts.map((d) => (include[d.key] && d.status !== "created" && d.status !== "rejected" ? { ...d, ...patch } : d)));
  }

  /* ───────────── Navigation entre les phases ───────────── */

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  const goTo = useCallback((next: Phase) => {
    setActionError(null);
    setReveal(null);
    focusHeading.current = true;
    setPhase(next);
    writeStepParam(next);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, []);

  // Les choix faits pour les conflits survivent à un rechargement de l'onglet.
  useEffect(() => {
    if (phase === "done") return;
    writeStored(jobId, { choices, notify, messages });
  }, [jobId, phase, choices, notify, messages]);

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /** « Voir la suivante » : amène la première date bloquante à l'écran et l'ouvre. */
  function showNextBlocking() {
    const first = blocking[0];
    if (!first) return;
    document.getElementById(`draft-${first.key}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    setReveal((r) => ({ key: first.key, n: (r?.n ?? 0) + 1 }));
  }

  /* ───────────── Appels API (inchangés) ───────────── */

  /**
   * Vérifie l'agenda pour les dates sélectionnées.
   * `target` : étape demandée par l'adresse au rechargement (on n'y va que si elle a encore un sens).
   */
  async function checkConflicts(target?: Phase) {
    setActionError(null);
    setBusy(true);
    try {
      const r = await apiFetch<{ conflicts: DraftConflict[]; errors: { key: string; messages: string[] }[] }>("/api/conflicts/check", {
        method: "POST",
        json: { drafts: selected.map(stripClient) },
      });
      if (r.errors.length) {
        setActionError(r.errors.map((e) => e.messages.join(" ")).join(" "));
        if (target) writeStepParam("edit");
        return;
      }
      const found = uniqueConflicts(r.conflicts);
      setConflicts(found);
      const allChosen = found.every((c, i) => Boolean(choices[conflictId(c, i)]));
      goTo(found.length && !(target === "recap" && allChosen) ? "conflicts" : "recap");
    } catch (e) {
      setActionError(errorText(e, "Vérification de l'agenda impossible. Vérifiez votre connexion, puis réessayez."));
      if (target) writeStepParam("edit");
    } finally {
      setBusy(false);
    }
  }

  const decisions = buildDecisions(selected, conflicts, choices, notify, messages);

  async function commit() {
    // Double appui : un seul envoi (le serveur protège aussi par la clé d'idempotence).
    if (committing.current) return;
    committing.current = true;
    setActionError(null);
    setBusy(true);
    try {
      await flush(); // les corrections en attente partent avant la création
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
      writeStored(jobId, null);
      goTo("done");
      refreshCounters();
    } catch (e) {
      const unreachable = !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
      setActionError(unreachable ? SAVE_FAILED : `${errorText(e, "Enregistrement impossible.")} Rien n'a été enregistré.`);
    } finally {
      committing.current = false;
      setBusy(false);
    }
  }

  /** « Réessayer ces dates » : nouvel envoi limité aux dates en échec, avec une nouvelle clé d'idempotence. */
  function retryFailed(keys: string[]) {
    if (!summary) return;
    const created = new Map(summary.created.map((c) => [c.key, c.eventId]));
    const skipped = new Set(summary.skipped);
    const next = drafts.map((d): Draft =>
      created.has(d.key) ? { ...d, status: "created", eventId: created.get(d.key) } : skipped.has(d.key) ? { ...d, status: "rejected" } : d,
    );
    draftsRef.current = next;
    setEdited(next);
    setInclude(Object.fromEntries(next.filter((d) => d.status !== "created" && d.status !== "rejected").map((d) => [d.key, keys.includes(d.key)])));
    idemKey.current = newIdempotencyKey();
    setSummary(null);
    goTo("recap");
  }

  async function retry() {
    await apiFetch(`/api/extract-events/${jobId}/retry`, { method: "POST" }).catch((e) => setActionError(errorText(e, "Relance impossible. Réessayez dans un instant.")));
    restartPolling();
  }

  async function deleteSources() {
    setActionError(null);
    setDeleting(true);
    try {
      await apiFetch(`/api/extract-events/${jobId}/sources`, { method: "DELETE" });
      reload();
    } catch (e) {
      setActionError(errorText(e, "Suppression impossible pour le moment."));
    } finally {
      setDeleting(false);
    }
  }

  /* ───────────── Import d'une autre organisation ───────────── */

  // Lien ouvert alors qu'une autre église est active : on bascule sur celle de l'import, puis on recharge.
  const switching = useRef(false);
  const activeOrgId = me.organization?.id ?? null;
  const jobOrgId = data?.organizationId ?? null;
  const wrongOrg = Boolean(jobOrgId && activeOrgId && jobOrgId !== activeOrgId);
  useEffect(() => {
    const flag = `cc-org-switch-${jobId}`;
    if (!wrongOrg) {
      // Bonne église : on oublie la tentative de bascule précédente.
      if (jobOrgId) writeFlag(flag, false);
      return;
    }
    if (!jobOrgId || switching.current) return;
    switching.current = true;
    // Une seule tentative par onglet : si la bascule n'a pas pris effet, on ne recharge pas en boucle.
    if (readFlag(flag)) {
      writeFlag(flag, false);
      void Promise.resolve().then(() =>
        setActionError("Cet import appartient à une autre église. Choisissez-la dans le menu, puis rouvrez cet import."),
      );
      return;
    }
    writeFlag(flag, true);
    apiFetch("/api/orgs/switch", { method: "POST", json: { orgId: jobOrgId } })
      .then(() => window.location.reload())
      .catch((e) => {
        switching.current = false;
        setActionError(errorText(e, "Impossible d'ouvrir l'église de cet import. Réessayez."));
      });
  }, [wrongOrg, jobOrgId, jobId]);

  /* ───────────── Reprise de l'étape indiquée dans l'adresse ───────────── */

  const resumed = useRef(false);
  const readyToResume = Boolean(data && !running && !wrongOrg && pending.length > 0);
  useEffect(() => {
    if (resumed.current || !readyToResume) return;
    resumed.current = true;
    const target = PHASE_OF_PARAM[new URLSearchParams(window.location.search).get("etape") ?? ""];
    if (!target) return;
    // La vérification de l'agenda est refaite : elle seule dit s'il reste des chevauchements.
    if (selected.length > 0 && blocking.length === 0) void Promise.resolve().then(() => checkConflicts(target));
    else writeStepParam("edit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToResume]);

  /* ───────────── Rendu ───────────── */

  if (error && !data)
    return (
      <div>
        <PageHeader title={PHASE_TITLES.edit} back={BACK} />
        <ErrorState status={error.status} message={error.message} onRetry={reload} back={BACK} />
      </div>
    );

  const job = data?.job;
  // Pendant la bascule vers l'église de l'import, rien d'autre n'est affiché.
  const analysing = !data || running || (wrongOrg && !actionError);
  const failed = job?.status === "failed";
  const errorAlert = actionError && <ActionError message={actionError} />;

  const conflictSteps = [
    { id: "edit", label: t.flow.review },
    { id: "conflicts", label: phase === "recap" && conflicts.length === 0 ? `${t.flow.conflicts} : aucun` : t.flow.conflicts },
    { id: "recap", label: t.flow.save },
  ];
  const showStepper = !analysing && !failed && phase !== "done" && (phase !== "edit" || pending.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader title={failed ? t.reviewTitles.failed : PHASE_TITLES[phase]} back={BACK} />
      {showStepper && <Stepper steps={conflictSteps} current={phase} />}
      {error && data && <StaleBanner onRetry={reload} />}

      {analysing && <Analysing initial={!data} step={job?.step} slow={slow} onRestart={restartPolling} />}

      {failed && job && (
        <section className="space-y-3">
          <Alert
            tone="danger"
            action={
              job.canRetry ? (
                <Button size="sm" variant="outline" onClick={retry}>
                  <RotateCw className="h-4 w-4" aria-hidden /> Relancer
                </Button>
              ) : undefined
            }
          >
            {cleanJobError(job.error) ?? "Le message n'a pas pu être lu."}
          </Alert>
          <Link href="/capture" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2">
            Essayer un autre message
          </Link>
          {errorAlert}
        </section>
      )}

      {!analysing && !failed && drafts.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="Aucune date trouvée dans ce message"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/capture" className={buttonVariants()}>
                Essayer un autre message
              </Link>
              <Link href="/evenements/nouveau" className={buttonVariants({ variant: "outline" })}>
                Créer l&apos;événement à la main
              </Link>
            </div>
          }
        >
          Une capture plus nette, ou le texte copié directement, donne souvent de meilleurs résultats.
        </EmptyState>
      )}

      {!analysing && !failed && phase === "edit" && drafts.length > 0 && pending.length === 0 && (
        <EmptyState
          icon={Check}
          title="Ces dates sont déjà traitées"
          action={
            <Link href="/calendrier" className={buttonVariants()}>
              Voir mon agenda
            </Link>
          }
        >
          {plural(drafts.filter((d) => d.status === "created").length, "date de ce message est", "dates de ce message sont")} dans votre agenda.
        </EmptyState>
      )}

      {!analysing && phase === "edit" && pending.length > 0 && (
        <section key="edit" className="animate-step-in space-y-4">
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
              {commonTitle ? frTypo(commonTitle) : "Dates trouvées"}
            </h2>
            <p className="text-sm text-muted">
              {plural(pending.length, "date trouvée", "dates trouvées")} dans le message
              {selected.length !== pending.length && ` · ${plural(selected.length, "sélectionnée", "sélectionnées")}`}
            </p>
            {drafts.some((d) => d.status === "created") && (
              <p className="text-sm text-muted">
                {plural(drafts.filter((d) => d.status === "created").length, "autre date est déjà", "autres dates sont déjà")} dans votre agenda.
              </p>
            )}
          </div>

          <Notices
            warnings={job?.warnings ?? []}
            grouped={grouped}
            count={selected.length}
            canConfirm={grouped.some((g) => g.severity === "warning") && selected.some((d) => needsConfirm(d) && !d.confirmed && !hasErrors(d))}
            onConfirm={confirmAll}
          />

          {pending.length > 1 && <ApplyToAll count={selected.length} groups={groupList} commonTitle={commonTitle} onApply={applyToAll} />}

          <ul className="space-y-3">
            {pending.map((d) => (
              <li key={d.key} id={`draft-${d.key}`} className="scroll-mt-20">
                <DraftCard
                  draft={d}
                  included={Boolean(include[d.key])}
                  onInclude={onInclude}
                  onChange={update}
                  groups={groupList}
                  commonTitle={commonTitle}
                  grouped={groupedKinds}
                  reveal={reveal?.key === d.key ? reveal.n : 0}
                />
              </li>
            ))}
          </ul>
          {errorAlert}
          <ActionBarSpacer />
          <ActionBar status={<EditStatus selected={selected} blocking={blocking.length} saveState={saveState} onRetrySave={() => void flush()} />}>
            {/* Les compléments sr-only gardent les noms accessibles « Vérifier mon agenda » et « Voir la suivante (n) ». */}
            {selected.length === 0 ? (
              <Button disabled>
                Continuer<span className="sr-only"> : vérifier mon agenda</span>
              </Button>
            ) : blocking.length > 0 ? (
              <Button onClick={showNextBlocking}>
                Date à corriger ({blocking.length})<span className="sr-only">, voir la suivante ({blocking.length})</span>
              </Button>
            ) : (
              <Button onClick={() => void checkConflicts()} loading={busy}>
                Continuer<span className="sr-only"> : vérifier mon agenda</span>
              </Button>
            )}
          </ActionBar>
        </section>
      )}

      {!analysing && phase === "conflicts" && (
        <ConflictsPhase
          headingRef={headingRef}
          conflicts={conflicts}
          drafts={drafts}
          choices={choices}
          setChoices={setChoices}
          notify={notify}
          setNotify={setNotify}
          messages={messages}
          setMessages={setMessages}
          tz={tz}
          errorAlert={errorAlert}
          onBack={() => goTo("edit")}
          onNext={() => goTo("recap")}
        />
      )}

      {!analysing && phase === "recap" && (
        <section key="recap" className="animate-step-in space-y-4">
          <RecapSummary
            headingRef={headingRef}
            data={buildRecap({ drafts, selected, excluded: pending.filter((d) => !include[d.key]), conflicts, choices, notify, decisions })}
            commonTitle={commonTitle} reminderOffsets={me.profile.reminder_offsets} tz={tz} />
          {errorAlert}
          <ActionBarSpacer />
          <ActionBar
            leading={
              <Button variant="ghost" onClick={() => goTo(conflicts.length ? "conflicts" : "edit")} disabled={busy}>
                <Pencil className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Modifier</span>
              </Button>
            }
            status={busy ? "Enregistrement…" : actionError ? "Rien n'a été enregistré." : undefined}
            tone={actionError && !busy ? "danger" : "default"}
          >
            <Button onClick={commit} loading={busy}>
              <CommitLabel n={decisions.filter((d) => d.action === "create").length} />
            </Button>
          </ActionBar>
        </section>
      )}

      {!analysing && phase === "done" && summary && (
        <section key="done" className="animate-step-in space-y-4">
          <DonePanel headingRef={headingRef} summary={summary} drafts={drafts} groups={groupList} commonTitle={commonTitle} onRetry={retryFailed} />
          {errorAlert}
        </section>
      )}

      {data && !analysing && (
        <HowItWasRead
          job={data.job}
          uploads={data.uploads}
          deleting={deleting}
          onDelete={deleteSources}
          errorAlert={failed || phase !== "edit" || pending.length > 0 ? null : errorAlert}
        />
      )}
    </div>
  );
}

/** Ensemble de natures de problèmes, stable tant que son contenu ne change pas (pour DraftCard mémoïsée). */
function useKindSet(kinds: string[]): ReadonlySet<string> {
  const key = kinds.join("\n");
  return useMemo(() => new Set(key ? key.split("\n") : []), [key]);
}

/* ───────────── Morceaux de l'écran ───────────── */

/** Pendant l'analyse : une ligne d'état et la forme des cartes à venir, sans alerte. */
function Analysing({ initial, step, slow, onRestart }: { initial: boolean; step?: keyof typeof t.steps; slow: boolean; onRestart: () => void }) {
  const found = step === "extracted" || step === "review" || step === "ready";
  const text = initial ? t.states.loading : found ? "Dates trouvées, préparation…" : "Lecture du message…";
  return (
    <section className="space-y-3">
      <div aria-live="polite" className="text-sm text-muted">
        {slow ? (
          <div className="space-y-2">
            <p className="font-medium text-fg">Ça prend plus de temps que prévu.</p>
            <p>La lecture continue de son côté. Vous pouvez relancer le suivi, ou revenir plus tard : vous retrouverez ce message sur la page Importer.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onRestart}>
                <RotateCw className="h-4 w-4" aria-hidden /> Relancer
              </Button>
              <Link href="/" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                Revenir plus tard
              </Link>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {text}
          </p>
        )}
      </div>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <Skeleton className="h-[4.375rem] w-12 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </section>
  );
}

/** Une seule alerte compacte : messages de l'analyse et remarques communes à toutes les dates. */
function Notices({
  warnings,
  grouped,
  count,
  canConfirm,
  onConfirm,
}: {
  warnings: string[];
  grouped: { kind: string; label: string }[];
  count: number;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const items = [...warnings.map(frTypo), ...grouped.map((g) => g.label)];
  if (!items.length) return null;
  return (
    <Alert tone={canConfirm || warnings.length ? "warning" : "info"} size="compact">
      {grouped.length > 0 && <p className="font-semibold">{count > 1 ? `Pour les ${count} dates` : "À savoir"}</p>}
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {items.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      {canConfirm && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onConfirm}>
          <Check className="h-4 w-4" aria-hidden /> Ces {count} dates sont justes
        </Button>
      )}
    </Alert>
  );
}

function EditStatus({ selected, blocking, saveState, onRetrySave }: { selected: Draft[]; blocking: number; saveState: SaveState; onRetrySave: () => void }) {
  const total = selected.length;
  const ready = total - blocking;
  const softReview = selected.filter((d) => !isBlocking(d) && draftStatus(d) === "toReview").length;
  const main =
    total === 0
      ? "Aucune date sélectionnée"
      : blocking > 0
        ? `${ready} sur ${total} ${ready > 1 ? "prêtes" : "prête"}`
        : softReview > 0
          ? `${softReview} à relire`
          : total === 1
            ? "La date est prête"
            : `Les ${total} dates sont prêtes`;
  return (
    <>
      <span className="block font-medium text-fg">{main}</span>
      {saveState === "saving" && <span className="block">Sauvegarde du brouillon…</span>}
      {saveState === "saved" && <span className="block">Brouillon gardé · pas encore dans l&apos;agenda</span>}
      {saveState === "error" && (
        <span className="block">
          <span className="text-danger">Modifications non enregistrées.</span>{" "}
          <button type="button" className="font-medium text-accent underline underline-offset-2" onClick={onRetrySave}>
            Réessayer
          </button>
        </span>
      )}
    </>
  );
}

function CommitLabel({ n }: { n: number }) {
  if (n === 0) return <>Enregistrer mes choix</>;
  const full = n === 1 ? "Ajouter cette date à mon agenda" : `Ajouter les ${n} dates à mon agenda`;
  const short = n === 1 ? "Ajouter cette date" : `Ajouter les ${n} dates`;
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

function ConflictsPhase({
  headingRef,
  conflicts,
  drafts,
  choices,
  setChoices,
  notify,
  setNotify,
  messages,
  setMessages,
  tz,
  errorAlert,
  onBack,
  onNext,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  conflicts: DraftConflict[];
  drafts: Draft[];
  choices: Record<string, Choice>;
  setChoices: Dispatch<SetStateAction<Record<string, Choice>>>;
  notify: Record<string, boolean>;
  setNotify: Dispatch<SetStateAction<Record<string, boolean>>>;
  messages: Record<string, string>;
  setMessages: Dispatch<SetStateAction<Record<string, string>>>;
  tz: string;
  errorAlert: ReactNode;
  onBack: () => void;
  onNext: () => void;
}) {
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  const ids = conflicts.map((c, i) => conflictId(c, i));
  const missing = ids.filter((id) => !choices[id]);
  const datesInConflict = new Set(conflicts.map((c) => c.draftKey)).size;

  const choose = useCallback(
    (id: string, choice: Choice, c: DraftConflict) => {
      setChoices((prev) => ({ ...prev, [id]: choice }));
      // Retrait : l'organisateur est prévenu par défaut (sauf si l'on organise soi-même).
      if (choice === "withdraw_existing" && c.existing && !c.existing.isOrganizer) setNotify((prev) => (id in prev ? prev : { ...prev, [id]: true }));
    },
    [setChoices, setNotify],
  );
  const onNotify = useCallback((id: string, v: boolean) => setNotify((prev) => ({ ...prev, [id]: v })), [setNotify]);
  const onMessage = useCallback((id: string, v: string) => setMessages((prev) => ({ ...prev, [id]: v })), [setMessages]);

  function showNextMissing() {
    const index = ids.indexOf(missing[0]);
    const el = document.getElementById(`conflict-${index}`);
    el?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    el?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({ preventScroll: true });
  }

  return (
    <section key="conflicts" className="animate-step-in space-y-4">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
          {plural(conflicts.length, "chevauchement", "chevauchements")}
        </h2>
        <p className="text-sm text-muted">
          {plural(datesInConflict, "date tombe", "dates tombent")} en même temps qu&apos;un autre engagement. Choisissez ce que vous préférez.
        </p>
      </div>
      <ul className="space-y-4">
        {conflicts.map((c, i) => {
          const draft = byKey.get(c.draftKey);
          if (!draft) return null;
          const id = ids[i];
          return (
            <li key={id}>
              <ConflictCard
                domId={`conflict-${i}`}
                id={id}
                conflict={c}
                draft={draft}
                other={c.otherDraftKey ? (byKey.get(c.otherDraftKey) ?? null) : null}
                choice={choices[id]}
                onChoose={choose}
                notify={Boolean(notify[id])}
                onNotify={onNotify}
                message={messages[id] ?? ""}
                onMessage={onMessage}
                tz={tz}
              />
            </li>
          );
        })}
      </ul>
      {errorAlert}
      <ActionBarSpacer />
      <ActionBar
        leading={
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Retour</span>
          </Button>
        }
        status={missing.length > 0 ? `${plural(missing.length, "choix à faire", "choix à faire")}` : "Tous les choix sont faits"}
      >
        {missing.length > 0 ? (
          <Button onClick={showNextMissing}>
            <span className="sm:hidden">Conflit suivant ({missing.length})</span>
            <span className="hidden sm:inline">Choisir pour le conflit suivant ({missing.length})</span>
          </Button>
        ) : (
          <Button onClick={onNext}>Voir le récapitulatif</Button>
        )}
      </ActionBar>
    </section>
  );
}

const PROVIDER_TEXT: Record<string, string> = {
  openai: "Lu par l'IA (OpenAI).",
  ics: "Lu depuis un fichier d'agenda, sans IA.",
};

/** En bas de page, replié : comment le message a été lu et ce qui en est gardé. */
function HowItWasRead({
  job,
  uploads,
  deleting,
  onDelete,
  errorAlert,
}: {
  job: JobData["job"];
  uploads: JobData["uploads"];
  deleting: boolean;
  onDelete: () => void;
  /** Erreur affichée ici seulement quand aucune section de phase ne l'affiche déjà. */
  errorAlert: ReactNode;
}) {
  const kept = uploads.filter((u) => !u.deleted);
  const origin = originLabel(uploads);
  return (
    <Disclosure summary="Comment ce message a été lu" className="mt-8">
      <div className="space-y-2 text-muted">
        {job.provider && <p>{PROVIDER_TEXT[job.provider] ?? "Lu par CellConnect, sans IA."}</p>}
        {job.context_notes && <p>{frTypo(`Contexte repéré : ${job.context_notes}`)}</p>}
        <p>
          Seules les dates que vous enregistrez restent dans votre agenda. Le message et cette vérification sont effacés automatiquement après un délai de
          conservation.
        </p>
        {uploads.length > 0 &&
          (kept.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p>{origin.kept}</p>
              <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete} loading={deleting}>
                <Trash2 className="h-4 w-4" aria-hidden /> Supprimer maintenant
              </Button>
            </div>
          ) : (
            <p>{origin.deleted}</p>
          ))}
        {errorAlert}
      </div>
    </Disclosure>
  );
}

/** « La capture d'origine est encore conservée » : accord en genre et en nombre selon les fichiers importés. */
function originLabel(uploads: JobData["uploads"]): { kept: string; deleted: string } {
  const many = uploads.length > 1;
  if (uploads.every((u) => u.kind === "image"))
    return many
      ? { kept: "Les captures d'origine sont encore conservées.", deleted: "Les captures d'origine ont déjà été supprimées." }
      : { kept: "La capture d'origine est encore conservée.", deleted: "La capture d'origine a déjà été supprimée." };
  const noun = uploads.every((u) => u.kind === "text") ? "message" : "fichier";
  return many
    ? { kept: `Les ${noun}s d'origine sont encore conservés.`, deleted: `Les ${noun}s d'origine ont déjà été supprimés.` }
    : { kept: `Le ${noun} d'origine est encore conservé.`, deleted: `Le ${noun} d'origine a déjà été supprimé.` };
}

/** Erreur d'action : annoncée, et amenée à l'écran (au-dessus de la barre collante grâce au scroll-padding). */
function ActionError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [message]);
  return (
    <div ref={ref}>
      <Alert tone="danger" live>
        {message}
      </Alert>
    </div>
  );
}
