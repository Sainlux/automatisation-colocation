"use client";

import Link from "next/link";
import { useState, type Ref } from "react";
import { ChevronRight, CircleCheck, RotateCw, Smartphone, TriangleAlert, Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { DateTile } from "@/components/app/date-tile";
import { fmtShortDate, frTypo, plural } from "@/components/app/format";
import { cn } from "@/lib/utils";
import { describe, isValidDate, timeLabel, type Draft, type GroupOption, type Summary } from "./draft-utils";

/** Fin du parcours : ce qui a été ajouté, puis la prochaine chose utile à faire. */
export function DonePanel({
  headingRef,
  summary,
  drafts,
  groups,
  commonTitle,
  onRetry,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  summary: Summary;
  drafts: Draft[];
  groups: readonly GroupOption[];
  commonTitle: string | null;
  onRetry: (keys: string[]) => void;
}) {
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  const n = summary.created.length;
  const allFailed = n === 0 && summary.failures.length > 0;
  const headline =
    n > 0
      ? `${plural(n, "date ajoutée", "dates ajoutées")} à votre agenda`
      : allFailed
        ? "Aucune date n'a pu être ajoutée"
        : "Vos choix sont enregistrés";

  const retryKeys = summary.failures.map((f) => f.key).filter((k) => byKey.has(k));

  // Dates rattachées à un groupe : proposer d'inviter ses membres.
  const byGroup = new Map<string, string[]>();
  for (const c of summary.created) {
    const groupId = byKey.get(c.key)?.groupId;
    if (groupId) byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), c.eventId]);
  }

  const conflicts = summary.conflictsRecorded;
  const withdrawn = summary.withdrawn.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className={cn("flex h-16 w-16 animate-pop-in items-center justify-center rounded-full", allFailed ? "bg-warning-bg text-warning" : "bg-success-bg text-success")}>
          {allFailed ? <TriangleAlert className="h-8 w-8" aria-hidden /> : <CircleCheck className="h-8 w-8" aria-hidden />}
        </span>
        <div role="status">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold tracking-tight focus:outline-none">
            {headline}
          </h2>
        </div>
        {withdrawn > 0 && (
          <p className="text-sm text-muted">
            Vous ne participez plus à {plural(withdrawn, "événement", "événements")}
            {summary.withdrawn.some((w) => w.notified) ? " ; l'organisateur a été prévenu" : ""}.
          </p>
        )}
      </div>

      {summary.failures.length > 0 && (
        <Alert
          tone="warning"
          live
          title={summary.failures.length === 1 ? "Un élément n'a pas pu être enregistré" : `${summary.failures.length} éléments n'ont pas pu être enregistrés`}
        >
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {summary.failures.map((f) => {
              const d = byKey.get(f.key);
              return <li key={f.key}>{d ? `${describe(d)} : ${f.message}` : f.message}</li>;
            })}
          </ul>
          {retryKeys.length > 0 && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onRetry(retryKeys)}>
              <RotateCw className="h-4 w-4" aria-hidden /> Réessayer ces dates
            </Button>
          )}
        </Alert>
      )}

      {n > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Dates ajoutées">
          {summary.created.map((c) => {
            const d = byKey.get(c.key);
            const showTitle = c.title.trim() !== (commonTitle ?? "");
            return (
              <li key={c.eventId}>
                <Link href={`/evenements/${c.eventId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-subtle">
                  {d && isValidDate(d.date) && <DateTile date={d.date} size="sm" tone="warm" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium first-letter:uppercase">{d && isValidDate(d.date) ? fmtShortDate(d.date) : frTypo(c.title)}</span>
                    <span className="block text-sm text-muted">
                      {d && <span className="tabular-nums">{timeLabel(d)}</span>}
                      {d && showTitle && <> · {frTypo(c.title)}</>}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {conflicts > 0 ? (
          <Link href="/conflits" className={buttonVariants({ size: "lg" })}>
            Résoudre mes conflits ({conflicts})
          </Link>
        ) : (
          <Link href="/calendrier" className={buttonVariants({ size: "lg" })}>
            Voir mon agenda
          </Link>
        )}
        {conflicts > 0 && (
          <Link href="/calendrier" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Voir mon agenda
          </Link>
        )}
      </div>

      {(byGroup.size > 0 || n > 0) && (
        <div className="space-y-3">
          {[...byGroup].map(([groupId, eventIds]) => (
            <InviteGroup key={groupId} groupId={groupId} name={groups.find((g) => g.id === groupId)?.name ?? null} eventIds={eventIds} />
          ))}
          {n > 0 && (
            <div>
              <a
                href={n === 1 ? `/api/events/${summary.created[0].eventId}/ics` : "/api/calendar/export"}
                download
                className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}
              >
                <Smartphone className="h-4 w-4" aria-hidden /> Ajouter à l&apos;agenda de mon téléphone
              </a>
              {n > 1 && <p className="mt-1 text-xs text-muted">Un fichier avec toutes les dates de votre agenda CellConnect, à ouvrir sur le téléphone.</p>}
            </div>
          )}
        </div>
      )}

      <p>
        <Link href="/capture" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2">
          Importer un autre message
        </Link>
      </p>
    </div>
  );
}

/** Invite tous les membres d'un groupe aux dates qui lui sont rattachées. */
function InviteGroup({ groupId, name, eventIds }: { groupId: string; name: string | null; eventIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const label = name ? `Inviter les membres de « ${frTypo(name)} »` : "Inviter les membres du groupe";

  async function invite() {
    setBusy(true);
    setResult(null);
    const invited = new Set<string>();
    try {
      for (const id of eventIds) {
        const r = await apiFetch<{ results: { userId: string; status: "invited" | "already" }[] }>(`/api/events/${id}/invite`, { method: "POST", json: { groupId } });
        for (const x of r.results) if (x.status === "invited") invited.add(x.userId);
      }
      const count = invited.size ? plural(invited.size, "membre invité", "membres invités") : "membres déjà invités";
      setResult({ ok: true, text: name ? `« ${frTypo(name)} » : ${count}` : count.charAt(0).toUpperCase() + count.slice(1) });
    } catch (e) {
      const text =
        e instanceof ApiError && e.status === 403
          ? "Seuls les responsables du groupe peuvent inviter tous ses membres. Demandez à un responsable de le faire."
          : e instanceof ApiError && e.message === "Aucun invité."
            ? "Ce groupe n'a pas encore d'autres membres à inviter."
            : e instanceof Error
              ? e.message
              : "Invitation impossible pour le moment.";
      setResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!result?.ok && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={invite} loading={busy}>
          <Users className="h-4 w-4" aria-hidden /> {label}
        </Button>
      )}
      <p role="status" className={cn("text-sm", result ? "mt-1" : "sr-only", result?.ok ? "text-success" : "text-danger")}>
        {result?.text}
      </p>
    </div>
  );
}
