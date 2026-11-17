"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, CalendarPlus, CalendarX, Ellipsis, MapPin, Pencil, Repeat, Share2, Undo2, UserMinus, UserPlus, Users, Video } from "lucide-react";
import { DateTime } from "luxon";
import { apiFetch, errorText, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";
import { DateTile } from "@/components/app/date-tile";
import { EventForm, toPayload } from "@/components/app/event-form";
import { fmtDateTime, fmtLongDate, fmtOffset, fmtRange, fmtRecurrence, fmtShortDate, fmtTimeRange, frTypo, plural, relative } from "@/components/app/format";
import { scrollBehavior } from "@/components/app/motion";
import { CancelDialog, EditScopeDialog, InviteDialog, RemindersDialog, WithdrawDialog, type EditScope } from "@/components/app/event/dialogs";
import { OccurrencePanel, type OccurrenceMode } from "@/components/app/event/occurrence-panel";
import { MeetingItems, SheetItem, sheetItemClass } from "@/components/app/event/sheet-items";
import { LiveRegion, useScrollIntoView } from "@/components/app/event/live-region";
import { effectiveTimes } from "@/components/app/event/logic";
import type { ActionResult, Done, EventDetails } from "@/components/app/event/types";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type ConflictSide = { id: string; title: string; start: string; end: string } | null;
type ConflictLite = { id: string; a: ConflictSide; b: ConflictSide };
type DialogName = null | "cancel" | "withdraw" | "invite" | "reminders" | "scope";

const CHANGE_LABEL: Record<string, string> = {
  created: "Créé",
  updated: "Modifié",
  rescheduled: "Horaire modifié",
  cancelled: "Annulé",
  participant_withdrawn: "Un participant s'est retiré",
  participant_responded: "Réponse d'un participant",
  participants_invited: "Invitations envoyées",
};

/** Lien « retour » selon la page d'origine (?from=) ; l'Agenda par défaut. */
function backFor(from: string | undefined, jobId: string | null) {
  if (from === "accueil") return { href: "/", label: t.nav.home };
  if (from === "conflits") return { href: "/conflits", label: t.nav.conflicts };
  if (from === "import") return { href: jobId ? `/capture/${jobId}` : "/capture", label: "Import" };
  return { href: "/calendrier", label: t.nav.calendar };
}

/** « dans 6 jours », « demain », « en cours », « il y a 3 jours »… */
function fmtWhen(startIso: string, endIso: string, tz: string) {
  const now = DateTime.now().setZone(tz);
  const s = DateTime.fromISO(startIso, { zone: "utc" }).setZone(tz);
  const e = DateTime.fromISO(endIso, { zone: "utc" }).setZone(tz);
  if (now >= s && now < e) return "En cours";
  const days = Math.abs(s.diff(now, "days").days);
  return s.toRelativeCalendar({ base: now, locale: "fr", ...(days < 14 ? { unit: "days" as const } : {}) }) ?? "";
}

const validIso = (v: string | undefined) => Boolean(v && !Number.isNaN(Date.parse(v)));

export default function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ occurrence?: string; from?: string; start?: string }> }) {
  const { id } = use(params);
  const { occurrence, from, start } = use(searchParams);
  const occParam = validIso(occurrence) ? occurrence : undefined;
  const { me, refreshCounters } = useMe();
  const { data, error, reload } = useApi<EventDetails>(`/api/events/${id}${occParam ? `?occurrence=${encodeURIComponent(occParam)}` : ""}`);
  const conflicts = useApi<{ conflicts: ConflictLite[] }>("/api/conflicts");
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [occMode, setOccMode] = useState<OccurrenceMode>(null);
  /** Incrémenté pour amener le panneau « Cette date uniquement » dans la vue. */
  const [occFocus, setOccFocus] = useState(0);
  const editRef = useRef<HTMLDivElement>(null);
  const occRef = useRef<HTMLDivElement>(null);
  const resultRef = useScrollIntoView<HTMLDivElement>(result);
  const tz = me.profile.timezone;
  const title = data?.event.title;

  useEffect(() => {
    if (editing) editRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [editing]);
  useEffect(() => {
    if (occFocus) occRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [occFocus]);
  // Titre de l'onglet (et de l'historique du navigateur) : le titre de l'événement.
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${t.app.name}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (error) return <ErrorState status={error.status} message={error.message} onRetry={reload} back={backFor(from, null)} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.states.loading} back={backFor(from, null)} />
        <ListSkeleton rows={2} />
      </div>
    );
  }

  const e = data.event;
  const occ = data.occurrence ?? null;
  const cancelled = e.status === "cancelled";
  /** Une seule date d'une série annulée (l'événement, lui, continue). */
  const dateCancelled = !cancelled && Boolean(e.recurrence_rule) && occ?.status === "cancelled";
  const moved = !cancelled && occ?.status === "moved";
  const off = cancelled || dateCancelled;
  const active = Boolean(data.me && ["accepted", "tentative", "invited"].includes(data.me.status));
  const stepBack = data.me && (data.me.status === "withdrawn" || data.me.status === "declined") && !cancelled;
  const local = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(e.timezone);
  // Horaire effectif : celui de la date demandée (déplacée comprise), sinon celui de l'événement.
  const { startIso, endIso } = effectiveTimes(e, occ, { occurrence: occParam, start });
  const share = `${e.title}\n${fmtRange(startIso, endIso, e.timezone)}${e.location ? `\n📍 ${e.location}` : ""}${e.meeting_url ? `\n🔗 ${e.meeting_url}` : ""}`;
  // Conflit de cette date de préférence, sinon le premier conflit de l'événement.
  const startMs = Date.parse(startIso);
  const mine = off || !active ? [] : (conflicts.data?.conflicts.filter((c) => c.a?.id === id || c.b?.id === id) ?? []);
  const conflict = mine.find((c) => Date.parse((c.a?.id === id ? c.a : c.b)?.start ?? "") === startMs) ?? mine[0];
  const other = conflict ? (conflict.a?.id === id ? conflict.b : conflict.a) : null;
  const isOrganizer = e.created_by === me.profile.id;
  const others = data.participants.filter((p) => p.userId !== me.profile.id && ["accepted", "tentative", "invited"].includes(p.status)).length;
  const seriesDate = Boolean(e.recurrence_rule && occ);

  const refresh = () => {
    refreshCounters();
    reload();
    conflicts.reload();
  };

  async function respond(status: "accepted" | "declined" | "tentative") {
    try {
      await apiFetch(`/api/events/${id}/respond`, { method: "POST", json: { status } });
      setResult({ tone: "success", text: status === "accepted" ? "C'est noté : vous participez." : "Réponse enregistrée." });
      refresh();
    } catch (err) {
      setResult({ tone: "danger", text: errorText(err, "Réponse impossible pour le moment. Vérifiez votre connexion internet, puis réessayez.") });
    }
  }

  const done: Done = (r) => {
    setResult(r);
    setDialog(null);
    setMore(false);
    refresh();
  };

  function startEditing() {
    if (editing) return setEditing(false);
    // Série ouverte sur une date précise : d'abord choisir « cette date » ou « toutes les dates ».
    if (seriesDate) return setDialog("scope");
    setEditing(true);
  }

  function chooseScope(scope: EditScope) {
    setDialog(null);
    if (scope === "all") return setEditing(true);
    setEditing(false);
    setOccMode("move");
    setOccFocus((n) => n + 1);
  }

  const actions: ReactNode[] = off
    ? []
    : [
        active && (
          <Button key="rem" variant="outline" className="h-auto min-h-12 py-2" onClick={() => setDialog("reminders")}>
            <BellRing className="h-4 w-4 shrink-0" aria-hidden /> Rappels
          </Button>
        ),
        <a
          key="wa"
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-12 py-2 text-center")}
        >
          <Share2 className="h-4 w-4 shrink-0" aria-hidden /> Partager sur WhatsApp
          <span className="sr-only"> (nouvel onglet)</span>
        </a>,
        data.canEdit && (
          <Button key="edit" variant="outline" className="h-auto min-h-12 py-2" pressed={editing} onClick={startEditing}>
            <Pencil className="h-4 w-4 shrink-0" aria-hidden /> Modifier
          </Button>
        ),
        <Button key="more" variant="outline" className="h-auto min-h-12 py-2" onClick={() => setMore(true)}>
          <Ellipsis className="h-4 w-4 shrink-0" aria-hidden /> Plus d&apos;actions
        </Button>,
      ].filter(Boolean);

  return (
    <div className="space-y-4">
      <PageHeader title={frTypo(e.title)} back={backFor(from, e.source_job_id)} />
      <LiveRegion message={result?.text} assertive={result?.tone === "danger"} />

      {result && (
        <div ref={resultRef} className="scroll-mt-20">
          <Alert tone={result.tone} title={result.text} size={other || dateCancelled ? "compact" : "default"}>
            {result.deliveries && result.deliveries.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.deliveries.map((d, i) => (
                  <li key={i}>
                    {t.channel[d.channel]} : {t.delivery[d.status]}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}

      {dateCancelled && (
        <Alert tone="danger" title={t.words.dateCancelled}>
          Les autres dates de la série sont maintenues.
        </Alert>
      )}

      {other && conflict && (
        <Alert tone="warning" title={frTypo(`En même temps que « ${other.title} »`)}>
          <p className="first-letter:uppercase">
            <span className="tabular-nums">
              {fmtShortDate(other.start, tz)} · {fmtTimeRange(other.start, other.end, tz)}
            </span>
          </p>
          <Link href={`/conflits#conflit-${conflict.id}`} className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
            Choisir à quel événement aller
          </Link>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {e.status !== "confirmed" && <Badge tone={cancelled ? "danger" : "neutral"}>{t.eventStatus[e.status]}</Badge>}
            {dateCancelled && <Badge tone="danger">Date annulée</Badge>}
            {moved && occ && (
              <Badge tone="warm" className="whitespace-normal">
                Date déplacée (au lieu du {fmtLongDate(occ.originalStart, e.timezone)})
              </Badge>
            )}
            {data.group && (
              <Badge>
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: data.group.color }} /> {data.group.name}
              </Badge>
            )}
            {data.me && <Badge tone={data.me.status === "invited" ? "warm" : data.me.status === "accepted" ? "success" : "neutral"}>Vous : {t.participant[data.me.status]}</Badge>}
            {e.source === "capture" && <Badge>{t.words.importedBadge}</Badge>}
            {e.source === "google" && <Badge>Google Agenda</Badge>}
          </div>

          <div className="flex items-start gap-3">
            <DateTile date={startIso} tz={e.timezone} tone={other ? "warning" : "default"} />
            <div className="min-w-0">
              <p className={cn("font-semibold first-letter:uppercase", off && "text-muted line-through")}>{fmtLongDate(startIso, e.timezone)}</p>
              <p className={cn("tabular-nums", off && "text-muted line-through")}>{fmtTimeRange(startIso, endIso, e.timezone)}</p>
              {!off && <p className="text-sm text-muted first-letter:uppercase">{fmtWhen(startIso, endIso, e.timezone)}</p>}
            </div>
          </div>
          {e.timezone !== tz && (
            <p className="text-xs text-muted">
              Fuseau de l&apos;événement : {e.timezone} (chez vous : <span className="tabular-nums">{fmtRange(startIso, endIso, tz)}</span>)
            </p>
          )}
          {e.recurrence_rule && (
            <p className="flex items-center gap-2 text-sm">
              <Repeat className="h-4 w-4 shrink-0 text-muted" aria-hidden /> {fmtRecurrence(e.recurrence_rule)}
            </p>
          )}
          {e.location && (
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> <span className="min-w-0 wrap-anywhere">{e.location}</span>
            </p>
          )}
          {e.description && <p className="text-sm whitespace-pre-line text-muted wrap-anywhere">{e.description}</p>}

          {data.me?.status === "invited" && !off && (
            <div className="space-y-2 rounded-xl bg-warm-bg p-3">
              <p className="text-sm font-medium">Participerez-vous ?</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => respond("accepted")}>
                  Oui
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond("tentative")}>
                  Peut-être
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond("declined")}>
                  Non
                </Button>
              </div>
            </div>
          )}
          {stepBack && !dateCancelled && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-subtle p-3">
              <p className="min-w-0 flex-1 text-sm">Vous ne participez plus à cet événement.</p>
              <Button size="sm" variant="outline" onClick={() => respond("accepted")}>
                <Undo2 className="h-4 w-4" aria-hidden /> Revenir sur ma décision
              </Button>
            </div>
          )}

          {(actions.length > 0 || (e.meeting_url && !off)) && (
            <div className="space-y-2 pt-1">
              {e.meeting_url && !off && (
                <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                  <Video className="h-5 w-5" aria-hidden /> Rejoindre la réunion
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              )}
              <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">{actions}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {e.recurrence_rule && occ && !cancelled && data.canEdit && (
        <OccurrencePanel
          key={`${occ.originalStart}:${occ.start}:${occ.status}`}
          ref={occRef}
          eventId={id}
          occurrence={occ}
          timezone={e.timezone}
          mode={occMode}
          onModeChange={setOccMode}
          onDone={done}
        />
      )}

      {editing && (
        <div ref={editRef} className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>{e.recurrence_rule ? t.words.editAllDates : "Modifier l'événement"}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted">
                {e.recurrence_rule && <span className="block font-medium text-fg first-letter:uppercase">Commence le {fmtLongDate(e.starts_at, e.timezone)}</span>}
                Les participants seront prévenus d&apos;un changement d&apos;horaire et leurs rappels reprogrammés.
              </p>
              <EventForm
                initial={{
                  title: e.title,
                  date: local(e.starts_at).toISODate()!,
                  startTime: local(e.starts_at).toFormat("HH:mm"),
                  endTime: local(e.ends_at).toFormat("HH:mm"),
                  timezone: e.timezone,
                  location: e.location ?? "",
                  meetingUrl: e.meeting_url ?? "",
                  description: e.description ?? "",
                  groupId: e.group_id ?? "",
                  recurrenceRule: e.recurrence_rule ?? "",
                }}
                submitLabel="Enregistrer les modifications"
                error={formError}
                onSubmit={async (v) => {
                  setFormError(null);
                  try {
                    await apiFetch(`/api/events/${id}`, {
                      method: "PATCH",
                      json: { ...toPayload(v), expectedVersion: e.version, notifyParticipants: true },
                    });
                    setEditing(false);
                    setResult({
                      tone: "success",
                      text: e.recurrence_rule ? "Toutes les dates ont été mises à jour. Votre agenda a été revérifié." : "Événement mis à jour. Votre agenda a été revérifié.",
                    });
                    refresh();
                  } catch (err) {
                    setFormError(errorText(err, "Modification impossible pour le moment. Vérifiez votre connexion internet, puis réessayez."));
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 shrink-0" aria-hidden /> {plural(data.participants.length, "participant", "participants")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.participants.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 wrap-anywhere">
                    {p.name}
                    {p.role === "organizer" && <span className="text-muted"> · organisateur</span>}
                  </span>
                  <Badge className="shrink-0" tone={p.status === "accepted" ? "success" : p.status === "invited" ? "warm" : "neutral"}>
                    {t.participant[p.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {active && !off && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-5 w-5 shrink-0" aria-hidden /> Mes rappels
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.reminders.length ? (
                <ul className="space-y-1 text-sm">
                  {data.reminders.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium first-letter:uppercase">{fmtOffset(r.offset_minutes)}</span> <span className="text-muted tabular-nums">· {fmtDateTime(r.remind_at, tz)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucun rappel prévu.</p>
              )}
              <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-accent" onClick={() => setDialog("reminders")}>
                Changer mes rappels
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {data.changes.length > 0 && (
        <Disclosure summary={`Historique (${plural(data.changes.length, "changement", "changements")})`}>
          <ul className="space-y-1">
            {data.changes.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>{CHANGE_LABEL[c.change_type] ?? "Modification"}</span>
                <span className="shrink-0 text-muted">{relative(c.created_at)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Sheet open={more} onClose={() => setMore(false)} title="Plus d'actions">
        <ul className="space-y-1 py-1">
          {data.canEdit && !off && (
            <li>
              <SheetItem
                icon={UserPlus}
                onClick={() => {
                  setMore(false);
                  setDialog("invite");
                }}
              >
                Inviter
              </SheetItem>
            </li>
          )}
          {data.canEdit && !off && !e.meeting_url && <MeetingItems eventId={id} zoom={me.integrations.zoom.available} google={me.integrations.google.available} onDone={done} />}
          <li>
            <a href={`/api/events/${id}/ics`} className={sheetItemClass}>
              <CalendarPlus className="h-5 w-5 shrink-0 text-muted" aria-hidden /> Ajouter à un autre agenda (.ics)
            </a>
          </li>
          {active && !off && (
            <li>
              <SheetItem
                icon={UserMinus}
                onClick={() => {
                  setMore(false);
                  setDialog("withdraw");
                }}
              >
                Me retirer
              </SheetItem>
            </li>
          )}
        </ul>
        {data.canEdit && !off && (
          <div className="mt-2 border-t border-border pt-3">
            <SheetItem
              icon={CalendarX}
              danger
              onClick={() => {
                setMore(false);
                setDialog("cancel");
              }}
            >
              {e.recurrence_rule ? "Annuler toutes les dates pour tous" : "Annuler l'événement pour tous"}
            </SheetItem>
          </div>
        )}
      </Sheet>

      <CancelDialog open={dialog === "cancel"} onClose={() => setDialog(null)} eventId={id} participants={others} onDone={done} />
      <WithdrawDialog
        open={dialog === "withdraw"}
        onClose={() => setDialog(null)}
        eventId={id}
        title={e.title}
        defaultMessage={data.defaultWithdrawMessage}
        isOrganizer={isOrganizer}
        personal={isOrganizer && others === 0}
        onDone={done}
      />
      <InviteDialog
        open={dialog === "invite"}
        onClose={() => setDialog(null)}
        eventId={id}
        eventTitle={e.title}
        groupId={e.group_id}
        exclude={data.participants.map((p) => p.userId)}
        onDone={done}
        onChanged={refresh}
      />
      {occ && seriesDate && (
        <EditScopeDialog open={dialog === "scope"} onClose={() => setDialog(null)} occurrenceStart={startIso} seriesStart={e.starts_at} timezone={e.timezone} onChoose={chooseScope} />
      )}
      {/* Monté à chaque ouverture : la boîte repart des rappels réellement programmés. */}
      {dialog === "reminders" && <RemindersDialog open onClose={() => setDialog(null)} eventId={id} current={[...new Set(data.reminders.map((r) => r.offset_minutes))]} onDone={done} />}
    </div>
  );
}
