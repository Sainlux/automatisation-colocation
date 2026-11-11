"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, CalendarPlus, CalendarX, Ellipsis, MapPin, Pencil, Repeat, Share2, Undo2, UserMinus, UserPlus, Users, Video } from "lucide-react";
import { DateTime } from "luxon";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";
import { DateTile } from "@/components/app/date-tile";
import { EventForm, toPayload } from "@/components/app/event-form";
import { fmtDateTime, fmtOffset, fmtRange, fmtRecurrence, fmtShortDate, fmtTimeRange, frTypo, plural, relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/lib/types";

interface Details {
  event: EventRow;
  group: { id: string; name: string; color: string } | null;
  participants: {
    userId: string;
    name: string;
    role: "organizer" | "participant";
    status: keyof typeof t.participant;
  }[];
  me: { status: keyof typeof t.participant; role: string } | null;
  canEdit: boolean;
  changes: { id: string; change_type: string; created_at: string }[];
  reminders: { id: string; remind_at: string; offset_minutes: number }[];
  defaultWithdrawMessage: string;
}
type Delivery = {
  channel: keyof typeof t.channel;
  status: keyof typeof t.delivery;
  error: string | null;
};
type Result = {
  tone: "success" | "warning" | "danger";
  text: string;
  deliveries?: Delivery[];
};
type Done = (r: Result) => void;
type ConflictSide = {
  id: string;
  title: string;
  start: string;
  end: string;
} | null;
type ConflictLite = { id: string; a: ConflictSide; b: ConflictSide };

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

const zoned = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH");

/** « lundi 16 novembre », avec l'année seulement si elle diffère de l'année en cours. */
function fmtDayWithYear(iso: string, tz: string) {
  const d = zoned(iso, tz);
  return d.toFormat(d.year === DateTime.now().setZone(tz).year ? "cccc d LLLL" : "cccc d LLLL yyyy");
}

/** « dans 6 jours », « demain », « en cours », « il y a 3 jours »… */
function fmtWhen(startIso: string, endIso: string, tz: string) {
  const now = DateTime.now().setZone(tz);
  const s = zoned(startIso, tz);
  if (now >= s && now < zoned(endIso, tz)) return "En cours";
  const days = Math.abs(s.diff(now, "days").days);
  return (
    s.toRelativeCalendar({
      base: now,
      locale: "fr",
      ...(days < 14 ? { unit: "days" as const } : {}),
    }) ?? ""
  );
}

export default function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ occurrence?: string; from?: string }> }) {
  const { id } = use(params);
  const { occurrence, from } = use(searchParams);
  const { me, refreshCounters } = useMe();
  const { data, error, reload } = useApi<Details>(`/api/events/${id}`);
  const conflicts = useApi<{ conflicts: ConflictLite[] }>("/api/conflicts");
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState<null | "cancel" | "withdraw" | "invite" | "reminders">(null);
  const [result, setResult] = useState<Result | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const tz = me.profile.timezone;

  useEffect(() => {
    if (!editing) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    editRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [editing]);

  if (error) return <ErrorState status={error.status} message={error.message} onRetry={reload} back={backFor(from, null)} />;
  if (!data) {
    const back = backFor(from, null);
    return (
      <div className="space-y-4">
        <PageHeader title={t.states.loading} back={back} />
        <ListSkeleton rows={2} />
      </div>
    );
  }

  const e = data.event;
  const cancelled = e.status === "cancelled";
  const active = Boolean(data.me && ["accepted", "tentative", "invited"].includes(data.me.status));
  const stepBack = data.me && (data.me.status === "withdrawn" || data.me.status === "declined") && !cancelled;
  const local = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(e.timezone);
  // Occurrence demandée (événement récurrent) : on affiche cette date, avec la même durée.
  const durationMs = Date.parse(e.ends_at) - Date.parse(e.starts_at);
  const startIso = occurrence && !Number.isNaN(Date.parse(occurrence)) ? new Date(occurrence).toISOString() : e.starts_at;
  const endIso = new Date(Date.parse(startIso) + durationMs).toISOString();
  const share = `${e.title}\n${fmtRange(startIso, endIso, e.timezone)}${e.location ? `\n📍 ${e.location}` : ""}${e.meeting_url ? `\n🔗 ${e.meeting_url}` : ""}`;
  // Conflit de cette occurrence de préférence, sinon le premier conflit de l'événement.
  const startMs = Date.parse(startIso);
  const mine = cancelled || !active ? [] : (conflicts.data?.conflicts.filter((c) => c.a?.id === id || c.b?.id === id) ?? []);
  const conflict = mine.find((c) => Date.parse((c.a?.id === id ? c.a : c.b)?.start ?? "") === startMs) ?? mine[0];
  const other = conflict ? (conflict.a?.id === id ? conflict.b : conflict.a) : null;
  const isOrganizer = e.created_by === me.profile.id;
  const others = data.participants.filter((p) => p.userId !== me.profile.id && ["accepted", "tentative", "invited"].includes(p.status)).length;

  async function respond(status: "accepted" | "declined" | "tentative") {
    try {
      await apiFetch(`/api/events/${id}/respond`, {
        method: "POST",
        json: { status },
      });
      setResult({
        tone: "success",
        text: status === "accepted" ? "C'est noté : vous participez." : "Réponse enregistrée.",
      });
      refreshCounters();
      reload();
      conflicts.reload();
    } catch (err) {
      setResult({
        tone: "danger",
        text: err instanceof ApiError ? err.message : "Réponse impossible pour le moment.",
      });
    }
  }

  const done: Done = (r) => {
    setResult(r);
    setDialog(null);
    setMore(false);
    refreshCounters();
    reload();
    conflicts.reload();
  };

  const actions: ReactNode[] = [
    active && !cancelled && (
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
    </a>,
    data.canEdit && !cancelled && (
      <Button key="edit" variant="outline" className="h-auto min-h-12 py-2" pressed={editing} onClick={() => setEditing(!editing)}>
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

      {result && (
        <Alert tone={result.tone} title={result.text} live size={other ? "compact" : "default"}>
          {result.deliveries && result.deliveries.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {result.deliveries.map((d, i) => (
                <li key={i}>
                  {t.channel[d.channel]} : {t.delivery[d.status]}
                  {d.error ? ` (${d.error})` : ""}
                </li>
              ))}
            </ul>
          )}
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
            {data.group && (
              <Badge>
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: data.group.color }} /> {data.group.name}
              </Badge>
            )}
            {data.me && <Badge tone={data.me.status === "invited" ? "warm" : data.me.status === "accepted" ? "success" : "neutral"}>Vous : {t.participant[data.me.status]}</Badge>}
            {e.source === "capture" && <Badge>Importé d&apos;un message</Badge>}
            {e.source === "google" && <Badge>Google Calendar</Badge>}
          </div>

          <div className="flex items-start gap-3">
            <DateTile date={startIso} tz={e.timezone} tone={other ? "warning" : "default"} />
            <div className="min-w-0">
              <p className={cn("font-semibold first-letter:uppercase", cancelled && "text-muted line-through")}>{fmtDayWithYear(startIso, e.timezone)}</p>
              <p className="tabular-nums">{fmtTimeRange(startIso, endIso, e.timezone)}</p>
              {!cancelled && <p className="text-sm text-muted first-letter:uppercase">{fmtWhen(startIso, endIso, e.timezone)}</p>}
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

          {data.me?.status === "invited" && !cancelled && (
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
          {stepBack && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-subtle p-3">
              <p className="min-w-0 flex-1 text-sm">Vous ne participez plus à cet événement.</p>
              <Button size="sm" variant="outline" onClick={() => respond("accepted")}>
                <Undo2 className="h-4 w-4" aria-hidden /> Revenir sur ma décision
              </Button>
            </div>
          )}

          <div className="space-y-2 pt-1">
            {e.meeting_url && !cancelled && (
              <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                <Video className="h-5 w-5" aria-hidden /> Rejoindre la réunion
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            )}
            <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">{actions}</div>
          </div>
        </CardContent>
      </Card>

      {e.recurrence_rule && occurrence && !cancelled && data.canEdit && (
        <OccurrencePanel
          eventId={id}
          occurrenceStart={occurrence}
          timezone={e.timezone}
          durationMin={durationMs / 60000}
          onDone={(r) => {
            setResult(r);
            refreshCounters();
            reload();
          }}
        />
      )}

      {editing && (
        <div ref={editRef} className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Modifier l&apos;événement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted">Les participants seront prévenus d&apos;un changement d&apos;horaire et leurs rappels reprogrammés.</p>
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
                      json: {
                        ...toPayload(v),
                        expectedVersion: e.version,
                        notifyParticipants: true,
                      },
                    });
                    setEditing(false);
                    setResult({
                      tone: "success",
                      text: "Événement mis à jour. Votre agenda a été revérifié.",
                    });
                    refreshCounters();
                    reload();
                    conflicts.reload();
                  } catch (err) {
                    setFormError(err instanceof ApiError ? err.message : "Modification impossible.");
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
        {active && !cancelled && (
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
          {data.canEdit && !cancelled && (
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
          {data.canEdit && !cancelled && !e.meeting_url && <MeetingItems eventId={id} zoom={me.integrations.zoom.available} google={me.integrations.google.available} onDone={done} />}
          <li>
            <a href={`/api/events/${id}/ics`} className={sheetItemClass}>
              <CalendarPlus className="h-5 w-5 shrink-0 text-muted" aria-hidden /> Ajouter à un autre agenda (.ics)
            </a>
          </li>
          {active && !cancelled && (
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
        {data.canEdit && !cancelled && (
          <div className="mt-2 border-t border-border pt-3">
            <SheetItem
              icon={CalendarX}
              danger
              onClick={() => {
                setMore(false);
                setDialog("cancel");
              }}
            >
              Annuler l&apos;événement pour tous
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
      <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} eventId={id} groupId={e.group_id} exclude={data.participants.map((p) => p.userId)} onDone={done} />
      {/* Monté à chaque ouverture : la boîte repart des rappels réellement programmés. */}
      {dialog === "reminders" && <RemindersDialog open onClose={() => setDialog(null)} eventId={id} current={[...new Set(data.reminders.map((r) => r.offset_minutes))]} onDone={done} />}
    </div>
  );
}

const sheetItemClass = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base hover:bg-subtle disabled:text-disabled-fg";

function SheetItem({ icon: Icon, children, onClick, danger, loading }: { icon: typeof UserPlus; children: ReactNode; onClick: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} aria-busy={loading || undefined} className={cn(sheetItemClass, danger && "font-medium text-danger hover:bg-danger-bg")}>
      <Icon className={cn("h-5 w-5 shrink-0", danger ? "text-danger" : "text-muted", loading && "animate-pulse")} aria-hidden /> {children}
    </button>
  );
}

function CancelDialog({ open, onClose, eventId, participants, onDone }: { open: boolean; onClose: () => void; eventId: string; participants: number; onDone: Done }) {
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Annuler l'événement pour tous ?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await apiFetch<{
                  notified: number;
                  deliveries: Delivery[];
                }>(`/api/events/${eventId}?confirm=true&message=${encodeURIComponent(message)}`, { method: "DELETE" });
                onDone({
                  tone: "success",
                  text: `Événement annulé. ${r.notified ? `${plural(r.notified, "participant prévenu", "participants prévenus")}.` : "Personne d'autre n'était inscrit."}`,
                  deliveries: r.deliveries,
                });
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Annulation impossible.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Oui, annuler pour tous
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          L&apos;événement sera annulé pour <strong>tout le monde</strong>
          {participants > 0 ? ` (${plural(participants, "autre participant", "autres participants")})` : ""}. Pour simplement ne pas y aller, choisissez plutôt « Me retirer ».
        </p>
        <Field label="Message aux participants (facultatif)" htmlFor="cancel-msg">
          <Textarea id="cancel-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {err && (
          <Alert tone="danger" live>
            {err}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function WithdrawDialog({
  open,
  onClose,
  eventId,
  title,
  defaultMessage,
  isOrganizer,
  personal,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  defaultMessage: string;
  isOrganizer: boolean;
  personal: boolean;
  onDone: Done;
}) {
  const [notify, setNotify] = useState(!isOrganizer);
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Me retirer de cet événement"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await apiFetch<{
                  cancelledPersonalEvent: boolean;
                  notified: boolean;
                  deliveries: Delivery[];
                }>(`/api/events/${eventId}/withdraw`, {
                  method: "POST",
                  json: { notifyOrganizer: notify, message },
                });
                onDone({
                  tone: "success",
                  text: r.cancelledPersonalEvent
                    ? "Événement retiré de votre agenda."
                    : `Vous ne participez plus. L'événement est maintenu pour les autres.${r.notified ? " L'organisateur a été prévenu." : ""}`,
                  deliveries: r.deliveries,
                });
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Impossible de vous retirer pour le moment.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {frTypo(`Me retirer de « ${title} »`)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {personal ? "Cet événement personnel sera retiré de votre agenda." : "Votre désistement retire votre participation et vos rappels. L'événement reste maintenu pour les autres participants."}
        </p>
        {!isOrganizer && <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Prévenir l'organisateur" />}
        {notify && !isOrganizer && (
          <Field label="Message" htmlFor="wd-msg" hint="Ne mentionnez que ce que vous souhaitez partager.">
            <Textarea id="wd-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        )}
        {err && (
          <Alert tone="danger" live>
            {err}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function InviteDialog({ open, onClose, eventId, groupId, exclude, onDone }: { open: boolean; onClose: () => void; eventId: string; groupId: string | null; exclude: string[]; onDone: Done }) {
  const members = useApi<{ members: { userId: string; name: string }[] }>(open ? "/api/orgs/members" : null);
  const groups = useApi<{
    groups: { id: string; name: string; canManage: boolean }[];
  }>(open ? "/api/groups" : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [emails, setEmails] = useState("");
  const [group, setGroup] = useState(groupId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const candidates = members.data?.members.filter((m) => !exclude.includes(m.userId)) ?? [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Inviter"
      footer={
        <Button
          loading={busy}
          onClick={async () => {
            const list = emails.split(/[\s,;]+/).filter(Boolean);
            if (!selected.length && !group && !list.length) {
              setErr("Choisissez un groupe, une personne ou saisissez une adresse e-mail.");
              return;
            }
            setBusy(true);
            setErr(null);
            try {
              const parts: string[] = [];
              if (selected.length || group) {
                const r = await apiFetch<{ results: { status: string }[] }>(`/api/events/${eventId}/invite`, {
                  method: "POST",
                  json: { userIds: selected, groupId: group || null },
                });
                parts.push(`${plural(r.results.filter((x) => x.status === "invited").length, "invitation envoyée", "invitations envoyées")}.`);
              }
              if (list.length) {
                const r = await apiFetch<{
                  results: {
                    email: string;
                    status: string;
                    error?: string;
                    link?: string;
                  }[];
                }>("/api/invitations/email", {
                  method: "POST",
                  json: { emails: list, eventId },
                });
                const sent = r.results.filter((x) => x.status === "email_sent" || x.status === "invited_member").length;
                const notSent = r.results.filter((x) => x.link);
                parts.push(`${plural(sent, "invitation", "invitations")} par e-mail.`);
                if (notSent.length) parts.push(`Non envoyées (${notSent[0].error}) — liens à transmettre vous-même : ${notSent.map((x) => `${x.email} → ${x.link}`).join(" ; ")}`);
              }
              onDone({ tone: "success", text: parts.join(" ") });
            } catch (e) {
              setErr(e instanceof ApiError ? e.message : "Invitation impossible.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Envoyer les invitations
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Inviter un groupe entier" htmlFor="inv-group">
          <Select id="inv-group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Aucun groupe</option>
            {groups.data?.groups
              .filter((g) => g.canManage)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </Field>
        <p className="text-sm font-medium">Ou des personnes</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">Aucune autre personne dans l&apos;église.</p>
        ) : (
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {candidates.map((m) => (
              <li key={m.userId}>
                <Checkbox checked={selected.includes(m.userId)} onChange={(e) => setSelected(e.target.checked ? [...selected, m.userId] : selected.filter((x) => x !== m.userId))} label={m.name} />
              </li>
            ))}
          </ul>
        )}
        <Field label="Inviter par e-mail (personnes sans compte)" htmlFor="inv-emails" hint="Séparez les adresses par des virgules. Elles reçoivent un lien valable 30 jours.">
          <Textarea id="inv-emails" rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="prenom@exemple.ch, autre@exemple.ch" />
        </Field>
        {err && (
          <Alert tone="danger" live>
            {err}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

const PRESET_OFFSETS = [1440, 120, 30];

function RemindersDialog({ open, onClose, eventId, current, onDone }: { open: boolean; onClose: () => void; eventId: string; current: number[]; onDone: Done }) {
  const [offsets, setOffsets] = useState<number[]>(current);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Les rappels déjà programmés hors des choix habituels restent visibles et décochables.
  const choices = [...new Set([...PRESET_OFFSETS, ...current])].sort((a, b) => b - a);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rappels pour cet événement"
      footer={
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const list = [...offsets, ...(custom ? [Number(custom)] : [])].filter((n) => Number.isFinite(n) && n >= 5);
              await apiFetch("/api/reminders", {
                method: "POST",
                json: { eventId, offsets: [...new Set(list)] },
              });
              onDone({
                tone: "success",
                text: list.length ? "Rappels mis à jour." : "Plus aucun rappel pour cet événement.",
              });
            } catch (e) {
              setErr(e instanceof ApiError ? e.message : "Enregistrement impossible.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-2">
        {choices.map((p) => (
          <Checkbox
            key={p}
            checked={offsets.includes(p)}
            onChange={(e) => setOffsets(e.target.checked ? [...offsets, p] : offsets.filter((x) => x !== p))}
            label={<span className="first-letter:uppercase">{fmtOffset(p)}</span>}
          />
        ))}
        <Field label="Autre rappel (en minutes avant)" htmlFor="custom-rem">
          <Input id="custom-rem" type="number" inputMode="numeric" min={5} max={40320} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ex. 60" />
        </Field>
        {err && (
          <Alert tone="danger" live>
            {err}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function OccurrencePanel({ eventId, occurrenceStart, timezone, durationMin, onDone }: { eventId: string; occurrenceStart: string; timezone: string; durationMin: number; onDone: Done }) {
  const start = DateTime.fromISO(occurrenceStart, { zone: "utc" }).setZone(timezone);
  const [mode, setMode] = useState<null | "move" | "cancel">(null);
  const [date, setDate] = useState(start.toISODate()!);
  const [startTime, setStartTime] = useState(start.toFormat("HH:mm"));
  const [endTime, setEndTime] = useState(start.plus({ minutes: durationMin }).toFormat("HH:mm"));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(action: "cancel" | "move" | "restore") {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ notified: number }>(`/api/events/${eventId}/occurrences`, {
        method: "POST",
        json: {
          occurrenceStart,
          action,
          ...(action === "move" ? { date, startTime, endTime } : {}),
          message: message || null,
        },
      });
      const what = action === "cancel" ? "Date annulée" : action === "move" ? "Date déplacée" : "Date rétablie";
      onDone({
        tone: "success",
        text: `${what}. Les autres dates sont inchangées.${r.notified ? ` ${plural(r.notified, "participant prévenu", "participants prévenus")}.` : ""}`,
      });
      setMode(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Cette date uniquement : <span className="tabular-nums">{fmtShortDate(occurrenceStart, timezone)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" pressed={mode === "move"} onClick={() => setMode("move")}>
            Déplacer cette date
          </Button>
          <Button size="sm" variant="outline" pressed={mode === "cancel"} onClick={() => setMode("cancel")}>
            Annuler cette date
          </Button>
          <Button size="sm" variant="ghost" loading={busy && mode === null} onClick={() => send("restore")}>
            Rétablir l&apos;horaire d&apos;origine
          </Button>
        </div>
        {mode === "move" && (
          <div className="space-y-3">
            <Field label="Date" htmlFor="occ-d">
              <Input id="occ-d" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début" htmlFor="occ-s">
                <Input id="occ-s" type="time" value={startTime} onChange={(ev) => setStartTime(ev.target.value)} />
              </Field>
              <Field label="Fin" htmlFor="occ-e">
                <Input id="occ-e" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} />
              </Field>
            </div>
          </div>
        )}
        {mode && (
          <>
            <Field label="Message aux participants (facultatif)" htmlFor="occ-m">
              <Textarea id="occ-m" rows={2} value={message} onChange={(ev) => setMessage(ev.target.value)} />
            </Field>
            <Button variant={mode === "cancel" ? "danger" : "primary"} loading={busy} onClick={() => send(mode)}>
              {mode === "cancel" ? "Confirmer l'annulation de cette date" : "Confirmer le déplacement"}
            </Button>
          </>
        )}
        {err && (
          <Alert tone="danger" live>
            {err}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** Création d'une visio (Zoom / Google Meet), proposée dans la feuille « Plus d'actions ». */
function MeetingItems({ eventId, zoom, google, onDone }: { eventId: string; zoom: boolean; google: boolean; onDone: Done }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!zoom && !google) return null;
  async function create(provider: "zoom" | "google_meet") {
    setBusy(provider);
    try {
      await apiFetch(`/api/events/${eventId}/meeting`, {
        method: "POST",
        json: { provider },
      });
      onDone({
        tone: "success",
        text: "Réunion en ligne créée. Les participants ont reçu le lien.",
      });
    } catch (err) {
      onDone({
        tone: "danger",
        text: err instanceof ApiError ? err.message : "Création impossible.",
      });
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      {zoom && (
        <li>
          <SheetItem icon={Video} loading={busy === "zoom"} onClick={() => create("zoom")}>
            Créer une réunion Zoom
          </SheetItem>
        </li>
      )}
      {google && (
        <li>
          <SheetItem icon={Video} loading={busy === "google_meet"} onClick={() => create("google_meet")}>
            Créer un Google Meet
          </SheetItem>
        </li>
      )}
    </>
  );
}
