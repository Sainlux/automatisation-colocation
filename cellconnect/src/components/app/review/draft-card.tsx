"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { DateTile } from "@/components/app/date-tile";
import { fmtFullDate, fmtMinutes, fmtRecurrence, frTypo, plural, RECURRENCES } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  addMinutes,
  cardIssues,
  draftStatus,
  hasYearIssue,
  isLowConfidence,
  isValidDate,
  liveErrors,
  minutesBetween,
  needsConfirm,
  replaceYear,
  timeLabel,
  yearOptions,
  type Draft,
  type GroupOption,
} from "./draft-utils";

const DURATIONS = [60, 90, 120];

const STATUS = {
  ready: { tone: "success", label: t.reviewStatus.ready },
  toReview: { tone: "warning", label: t.reviewStatus.toReview },
  incomplete: { tone: "danger", label: t.reviewStatus.incomplete },
} as const;

export interface DraftCardProps {
  draft: Draft;
  included: boolean;
  onInclude: (key: string, included: boolean) => void;
  onChange: (key: string, patch: Partial<Draft>) => void;
  groups: readonly GroupOption[];
  /** Titre commun à toutes les dates : affiché une fois au-dessus de la liste, pas dans chaque carte. */
  commonTitle: string | null;
  /** Natures de problèmes déjà signalées une seule fois au-dessus de la liste. */
  grouped: ReadonlySet<string>;
  /** Change (> 0) quand la page demande d'ouvrir cette carte et d'y placer le focus. */
  reveal: number;
}

/**
 * Une date importée : résumé d'une ligne, détail à la demande.
 * Ouverte d'office seulement s'il y a quelque chose à corriger ou à confirmer,
 * rouverte quand une erreur apparaît, refermée quand l'utilisateur confirme.
 */
export const DraftCard = memo(function DraftCard({ draft: d, included, onInclude, onChange, groups, commonTitle, grouped, reveal }: DraftCardProps) {
  const errs = liveErrors(d);
  const hasErr = Object.keys(errs).length > 0;
  const urlErr = Boolean(errs.meetingUrl);
  const warn = needsConfirm(d);

  const [open, setOpen] = useState(hasErr || (warn && !d.confirmed));
  const [moreOpen, setMoreOpen] = useState(urlErr);
  // Ajustements d'état pendant le rendu (et non dans un effet) quand une erreur apparaît, quand la date est confirmée
  // ou quand la page demande d'afficher cette carte.
  const [seen, setSeen] = useState({ hasErr, urlErr, confirmed: d.confirmed, reveal });
  if (seen.hasErr !== hasErr || seen.urlErr !== urlErr || seen.confirmed !== d.confirmed || seen.reveal !== reveal) {
    if (hasErr && !seen.hasErr) setOpen(true);
    if (urlErr && !seen.urlErr) setMoreOpen(true);
    if (d.confirmed && !seen.confirmed && !hasErr) setOpen(false);
    if (reveal && reveal !== seen.reveal) {
      setOpen(true);
      if (urlErr) setMoreOpen(true);
    }
    setSeen({ hasErr, urlErr, confirmed: d.confirmed, reveal });
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();

  // « Voir la suivante » : focus sur le premier champ en erreur, sinon sur « C'est correct ».
  useEffect(() => {
    if (!reveal) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root?.querySelector<HTMLElement>("[data-confirm]") ?? toggleRef.current;
    target?.focus({ preventScroll: true });
  }, [reveal]);

  const set = (patch: Partial<Draft>) => onChange(d.key, patch);
  /** La carte se replie : le focus revient sur son résumé pour ne pas être perdu. */
  const confirmWith = (patch: Partial<Draft>) => {
    set({ ...patch, confirmed: true });
    if (!hasErr) toggleRef.current?.focus();
  };

  const validDate = isValidDate(d.date);
  const dateLabel = validDate ? fmtFullDate(d.date!) : "Date à compléter";
  const showTitle = d.title.trim() !== (commonTitle ?? "") || !d.title.trim();
  const displayTitle = d.title.trim() ? frTypo(d.title) : "Sans titre";
  const status = draftStatus(d);
  const f = (name: string) => `${d.key}-${name}`;

  const issues = cardIssues(d, grouped);
  const yearLine = hasYearIssue(d) && !d.confirmed ? d.yearSuggestion : null;
  const years = yearLine ? yearOptions(d) : [];
  const askConfirm = !d.confirmed && !hasErr && (warn || isLowConfidence(d));
  const duration = minutesBetween(d.startTime, d.endTime);
  const currentYear = validDate ? Number(d.date!.slice(0, 4)) : null;
  const filled = [d.location && "lieu", d.meetingUrl && "lien", d.groupId && "groupe", d.recurrenceRule && "répétition", d.description && "description"].filter(Boolean);
  const customRule = d.recurrenceRule && !RECURRENCES.some((r) => r.value === d.recurrenceRule) ? d.recurrenceRule : null;
  const groupMissing = d.groupId && !groups.some((g) => g.id === d.groupId);

  return (
    <div ref={rootRef} className={cn("rounded-2xl border border-border shadow-sm", included ? "bg-card" : "bg-subtle shadow-none")}>
      <h3 className="sr-only">
        {dateLabel}
        {showTitle ? `, ${displayTitle}` : ""}
      </h3>
      <div className="flex items-center gap-1 py-1 pr-1 pl-3">
        <Switch
          className="gap-0"
          checked={included}
          onChange={(e) => onInclude(d.key, e.target.checked)}
          label={<span className="sr-only">Inclure : {validDate ? `${dateLabel}, ${timeLabel(d)}` : displayTitle}</span>}
        />
        {included ? (
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-subtle"
          >
            <Tile date={validDate ? d.date : null} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-balance first-letter:uppercase">{dateLabel}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span className="tabular-nums">{timeLabel(d)}</span>
                <Badge tone={STATUS[status].tone}>
                  {STATUS[status].label}
                  <span className="sr-only"> (lecture fiable à {Math.round(d.confidence * 100)} %)</span>
                </Badge>
              </span>
              {showTitle && <span className="mt-0.5 block truncate text-sm">{displayTitle}</span>}
            </span>
            <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 text-muted transition-transform duration-(--dur-fast) ease-out", open && "rotate-180")} />
          </button>
        ) : (
          <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-muted">
            <Tile date={validDate ? d.date : null} muted />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block first-letter:uppercase line-through decoration-1">{dateLabel}</span>
              <span className="block">Ne sera pas ajoutée</span>
            </span>
          </div>
        )}
      </div>

      {included && open && (
        <div id={bodyId} className="animate-step-in space-y-4 border-t border-border px-3 pt-3 pb-4 sm:px-4">
          {d.sourceExcerpt && <p className="rounded-xl bg-subtle px-3 py-2 text-xs text-muted wrap-anywhere">{frTypo(`Lu dans le message : « ${d.sourceExcerpt} »`)}</p>}

          {(issues.length > 0 || askConfirm || yearLine) && (
            <div className={cn("space-y-3 rounded-xl border p-3 text-sm", askConfirm ? "border-warning/30 bg-warning-bg" : "border-border bg-subtle")}>
              {(issues.length > 0 || yearLine) && (
                <ul className="space-y-1.5">
                  {yearLine && (
                    <li className="flex gap-2">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      <span>{frTypo(yearLine.reason)}</span>
                    </li>
                  )}
                  {issues.map((i, k) => (
                    <li key={k} className="flex gap-2">
                      {i.severity === "info" ? (
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                      ) : i.severity === "warning" ? (
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      ) : (
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                      )}
                      <span>{frTypo(i.message)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {askConfirm && !issues.length && !yearLine && <p>La lecture de cette date est incertaine : relisez le jour et l&apos;heure.</p>}
              {years.length > 0 && (
                <div role="group" aria-label="Année de cette date" className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">C&apos;est en :</span>
                  {years.map((y) => (
                    <Button key={y.year} size="sm" variant="outline" pressed={y.year === currentYear} onClick={() => confirmWith({ date: replaceYear(d.date!, y.year) })}>
                      <span className="tabular-nums">{y.year}</span>
                      <span className="font-normal text-muted">({y.weekday})</span>
                    </Button>
                  ))}
                </div>
              )}
              {askConfirm && (
                <Button data-confirm size="sm" variant="outline" onClick={() => confirmWith({})}>
                  <Check className="h-4 w-4" aria-hidden /> {t.reviewStatus.confirm}
                </Button>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre" htmlFor={f("title")} error={errs.title} className="sm:col-span-2">
              <Input id={f("title")} value={d.title} onChange={(e) => set({ title: e.target.value, confirmed: false })} />
            </Field>
            <Field label="Date" htmlFor={f("date")} error={errs.date} hint={validDate ? fmtFullDate(d.date!) : undefined}>
              <Input id={f("date")} type="date" value={d.date ?? ""} onChange={(e) => set({ date: e.target.value || null, confirmed: false })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Début" htmlFor={f("start")} error={errs.startTime}>
                <Input id={f("start")} type="time" className="tabular-nums" value={d.startTime ?? ""} onChange={(e) => set({ startTime: e.target.value || null, confirmed: false })} />
              </Field>
              <Field label="Fin" htmlFor={f("end")} error={errs.endTime}>
                <Input id={f("end")} type="time" className="tabular-nums" value={d.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value || null, confirmed: false })} />
              </Field>
            </div>
            <div role="group" aria-label="Durée" className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <span className="text-xs text-muted">Durée :</span>
              {DURATIONS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  pressed={duration === m}
                  disabled={!d.startTime}
                  onClick={() => d.startTime && set({ endTime: addMinutes(d.startTime, m), confirmed: false })}
                >
                  {fmtMinutes(m)}
                </Button>
              ))}
              {!d.startTime && <span className="text-xs text-muted">Indiquez d&apos;abord le début.</span>}
            </div>
          </div>

          <Disclosure
            open={moreOpen}
            onToggle={setMoreOpen}
            summary={
              <>
                Plus d&apos;options
                {filled.length > 0 && <span className="font-normal text-muted"> · {filled.join(", ")}</span>}
              </>
            }
          >
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <Field label="Lieu" htmlFor={f("loc")}>
                <Input id={f("loc")} value={d.location ?? ""} onChange={(e) => set({ location: e.target.value || null })} placeholder="Adresse ou salle" />
              </Field>
              <Field label="Lien de réunion" htmlFor={f("url")} error={errs.meetingUrl}>
                <Input id={f("url")} type="url" inputMode="url" value={d.meetingUrl ?? ""} onChange={(e) => set({ meetingUrl: e.target.value || null })} placeholder="https://zoom.us/j/…" />
              </Field>
              <Field label="Groupe" htmlFor={f("group")}>
                <Select id={f("group")} value={d.groupId ?? ""} onChange={(e) => set({ groupId: e.target.value || null })}>
                  <option value="">Personnel (aucun groupe)</option>
                  {groupMissing && <option value={d.groupId!}>Groupe actuel</option>}
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Répétition" htmlFor={f("rec")}>
                <Select id={f("rec")} value={d.recurrenceRule ?? ""} onChange={(e) => set({ recurrenceRule: e.target.value || null })}>
                  {RECURRENCES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                  {customRule && <option value={customRule}>{fmtRecurrence(customRule)}</option>}
                </Select>
              </Field>
              <Field label="Description" htmlFor={f("desc")} className="sm:col-span-2">
                <Textarea id={f("desc")} rows={2} value={d.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} />
              </Field>
            </div>
          </Disclosure>
        </div>
      )}
    </div>
  );
});

/** Tuile date, ou case « ? » quand la date manque encore. */
function Tile({ date, muted }: { date: string | null; muted?: boolean }) {
  if (!date)
    return (
      <span aria-hidden className="flex h-[4.375rem] w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-input-border text-xl font-bold text-muted">
        ?
      </span>
    );
  return <DateTile date={date} size="sm" tone={muted ? "default" : "warm"} />;
}

/**
 * « Pour toutes les dates » : titre, groupe, lien et lieu appliqués d'un coup aux dates sélectionnées.
 * Seules les valeurs remplies sont appliquées.
 */
export function ApplyToAll({
  count,
  groups,
  commonTitle,
  onApply,
}: {
  count: number;
  groups: readonly GroupOption[];
  commonTitle: string | null;
  onApply: (patch: Partial<Draft>) => void;
}) {
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const label = count === 1 ? "Appliquer à la date sélectionnée" : `Appliquer aux ${count} dates`;

  function apply() {
    const link = url.trim();
    if (link && !/^https:\/\/\S+$/.test(link)) {
      setUrlError("Le lien doit commencer par https://");
      setFeedback("");
      return;
    }
    setUrlError(null);
    if (count === 0) return setFeedback("Aucune date n'est sélectionnée.");
    const patch: Partial<Draft> = {};
    if (title.trim()) patch.title = title.trim();
    if (groupId) patch.groupId = groupId;
    if (link) patch.meetingUrl = link;
    if (location.trim()) patch.location = location.trim();
    if (!Object.keys(patch).length) return setFeedback("Remplissez au moins un champ.");
    onApply(patch);
    setTitle("");
    setGroupId("");
    setUrl("");
    setLocation("");
    setFeedback(count === 1 ? "Appliqué à la date sélectionnée." : `Appliqué aux ${plural(count, "date", "dates")}.`);
  }

  return (
    <Disclosure
      summary={
        <>
          Pour toutes les dates
          <span className="font-normal text-muted"> · titre, groupe, lien, lieu</span>
        </>
      }
    >
      <div className="space-y-3 pt-1">
        <p className="text-xs text-muted">Laissez vide ce qui ne change pas.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titre" htmlFor="all-title">
            <Input id="all-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={commonTitle ?? undefined} />
          </Field>
          <Field label="Groupe" htmlFor="all-group">
            <Select id="all-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Ne pas changer</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lien de réunion" htmlFor="all-url" error={urlError}>
            <Input id="all-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://zoom.us/j/…" />
          </Field>
          <Field label="Lieu" htmlFor="all-loc">
            <Input id="all-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse ou salle" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={apply}>
            {label}
          </Button>
          <p role="status" className="text-sm text-muted">
            {feedback}
          </p>
        </div>
      </div>
    </Disclosure>
  );
}
