"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, BellRing, CalendarX, Download, MapPin, Pencil, Share2, UserMinus, UserPlus, Users, Video } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Loading } from "@/components/ui/states";
import { EventForm, toPayload } from "@/components/app/event-form";
import { fmtDateTime, fmtRange, relative } from "@/components/app/format";
import { t } from "@/i18n";
import type { EventRow } from "@/lib/types";
import { DateTime } from "luxon";

interface Details {
  event: EventRow;
  group: { id: string; name: string; color: string } | null;
  participants: { userId: string; name: string; role: "organizer" | "participant"; status: keyof typeof t.participant }[];
  me: { status: keyof typeof t.participant; role: string } | null;
  canEdit: boolean;
  changes: { id: string; change_type: string; created_at: string }[];
  reminders: { id: string; remind_at: string; offset_minutes: number }[];
  defaultWithdrawMessage: string;
}
type Delivery = { channel: keyof typeof t.channel; status: keyof typeof t.delivery; error: string | null };

const CHANGE_LABEL: Record<string, string> = {
  created: "Créé",
  updated: "Modifié",
  rescheduled: "Horaire modifié",
  cancelled: "Annulé",
  participant_withdrawn: "Désistement",
  participant_responded: "Réponse d'un participant",
  participants_invited: "Invitations envoyées",
};

export default function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ occurrence?: string }> }) {
  const { id } = use(params);
  const { occurrence } = use(searchParams);
  const { me, refreshCounters } = useMe();
  const { data, error, reload } = useApi<Details>(`/api/events/${id}`);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | "cancel" | "withdraw" | "invite" | "reminders">(null);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "danger"; text: string; deliveries?: Delivery[] } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const tz = me.profile.timezone;

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <Loading />;
  const e = data.event;
  const cancelled = e.status === "cancelled";
  const active = data.me && ["accepted", "tentative", "invited"].includes(data.me.status);
  const local = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(e.timezone);
  const share = `${e.title}\n${fmtRange(e.starts_at, e.ends_at, e.timezone)}${e.location ? `\n📍 ${e.location}` : ""}${e.meeting_url ? `\n🔗 ${e.meeting_url}` : ""}`;

  async function respond(status: "accepted" | "declined" | "tentative") {
    await apiFetch(`/api/events/${id}/respond`, { method: "POST", json: { status } });
    setResult({ tone: "success", text: "Réponse enregistrée." });
    refreshCounters();
    reload();
  }

  return (
    <div className="space-y-4">
      <Link href="/calendrier" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Calendrier
      </Link>

      {result && (
        <Alert tone={result.tone} title={result.text}>
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

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {cancelled ? <Badge tone="danger">Annulé</Badge> : <Badge tone="success">{t.eventStatus[e.status]}</Badge>}
            {data.group && (
              <Badge>
                <span className="h-2 w-2 rounded-full" style={{ background: data.group.color }} /> {data.group.name}
              </Badge>
            )}
            {data.me && <Badge tone={data.me.status === "invited" ? "warning" : data.me.status === "withdrawn" || data.me.status === "declined" ? "danger" : "primary"}>Vous : {t.participant[data.me.status]}</Badge>}
            {e.source === "capture" && <Badge>Importé d&apos;une capture</Badge>}
            {e.source === "google" && <Badge>Google Calendar</Badge>}
          </div>
          <h1 className={`text-2xl font-semibold ${cancelled ? "line-through opacity-70" : ""}`}>{e.title}</h1>
          <p className="first-letter:uppercase">{fmtRange(e.starts_at, e.ends_at, e.timezone)}</p>
          {e.timezone !== tz && <p className="text-xs text-muted">Fuseau de l&apos;événement : {e.timezone} (chez vous : {fmtRange(e.starts_at, e.ends_at, tz)})</p>}
          {e.recurrence_rule && <p className="text-sm text-muted">Répétition : {e.recurrence_rule}</p>}
          {e.location && (
            <p className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted" aria-hidden /> {e.location}
            </p>
          )}
          {e.meeting_url && (
            <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Video className="h-4 w-4" aria-hidden /> Rejoindre la réunion
            </a>
          )}
          {e.description && <p className="whitespace-pre-line text-sm text-muted">{e.description}</p>}
          {data.canEdit && !cancelled && !e.meeting_url && (
            <MeetingButtons
              eventId={id}
              zoom={me.integrations.zoom.available}
              google={me.integrations.google.available}
              onDone={(r) => {
                setResult(r);
                reload();
              }}
            />
          )}

          {data.me?.status === "invited" && !cancelled && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-warning-bg p-3">
              <p className="w-full text-sm font-medium">Participerez-vous ?</p>
              <Button size="sm" variant="success" onClick={() => respond("accepted")}>
                Oui
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond("tentative")}>
                Peut-être
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond("declined")}>
                Non
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {data.canEdit && !cancelled && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Modifier
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("invite")}>
                  <UserPlus className="h-4 w-4" aria-hidden /> Inviter
                </Button>
              </>
            )}
            {active && !cancelled && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog("reminders")}>
                  <BellRing className="h-4 w-4" aria-hidden /> Rappels
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("withdraw")}>
                  <UserMinus className="h-4 w-4" aria-hidden /> Me désister
                </Button>
              </>
            )}
            <a href={`/api/events/${id}/ics`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="h-4 w-4" aria-hidden /> .ics
            </a>
            <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Share2 className="h-4 w-4" aria-hidden /> Partager sur WhatsApp
            </a>
            {data.canEdit && !cancelled && (
              <Button variant="danger" size="sm" onClick={() => setDialog("cancel")}>
                <CalendarX className="h-4 w-4" aria-hidden /> Annuler pour tous
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {e.recurrence_rule && occurrence && !cancelled && data.canEdit && (
        <OccurrencePanel
          eventId={id}
          occurrenceStart={occurrence}
          timezone={e.timezone}
          durationMin={(Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000}
          onDone={(r) => {
            setResult(r);
            refreshCounters();
            reload();
          }}
        />
      )}

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>Modifier l&apos;événement</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted">Les participants seront informés d&apos;un changement d&apos;horaire et leurs rappels reprogrammés.</p>
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
                  await apiFetch(`/api/events/${id}`, { method: "PATCH", json: { ...toPayload(v), expectedVersion: e.version, notifyParticipants: true } });
                  setEditing(false);
                  setResult({ tone: "success", text: "Événement mis à jour. Les conflits ont été revérifiés." });
                  refreshCounters();
                  reload();
                } catch (err) {
                  setFormError(err instanceof ApiError ? err.message : "Modification impossible.");
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden /> Participants ({data.participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.participants.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {p.name}
                    {p.role === "organizer" && <span className="text-muted"> · organisateur</span>}
                  </span>
                  <Badge tone={p.status === "accepted" ? "success" : p.status === "invited" || p.status === "tentative" ? "warning" : "danger"}>{t.participant[p.status]}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Historique et rappels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.reminders.length > 0 && (
              <div>
                <p className="text-sm font-medium">Mes prochains rappels</p>
                <ul className="text-sm text-muted">
                  {data.reminders.map((r) => (
                    <li key={r.id}>{fmtDateTime(r.remind_at, tz)}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {data.changes.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{CHANGE_LABEL[c.change_type] ?? c.change_type}</span>
                  <span className="text-muted">{relative(c.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <CancelDialog open={dialog === "cancel"} onClose={() => setDialog(null)} eventId={id} participants={data.participants.length - 1} onDone={(r) => { setResult(r); setDialog(null); refreshCounters(); reload(); }} />
      <WithdrawDialog open={dialog === "withdraw"} onClose={() => setDialog(null)} eventId={id} defaultMessage={data.defaultWithdrawMessage} isOrganizer={e.created_by === me.profile.id} onDone={(r) => { setResult(r); setDialog(null); refreshCounters(); reload(); }} />
      <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} eventId={id} groupId={e.group_id} exclude={data.participants.map((p) => p.userId)} onDone={(r) => { setResult(r); setDialog(null); reload(); }} />
      <RemindersDialog open={dialog === "reminders"} onClose={() => setDialog(null)} eventId={id} current={me.profile.reminder_offsets} onDone={(r) => { setResult(r); setDialog(null); reload(); }} />
    </div>
  );
}

type Done = (r: { tone: "success" | "warning" | "danger"; text: string; deliveries?: Delivery[] }) => void;

function CancelDialog({ open, onClose, eventId, participants, onDone }: { open: boolean; onClose: () => void; eventId: string; participants: number; onDone: Done }) {
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Annuler l'événement pour tous"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            variant="danger"
            disabled={!confirm}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await apiFetch<{ notified: number; deliveries: Delivery[] }>(`/api/events/${eventId}?confirm=true&message=${encodeURIComponent(message)}`, { method: "DELETE" });
                onDone({ tone: "success", text: `Événement annulé. ${r.notified} participant(s) informé(s).`, deliveries: r.deliveries });
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Annulation impossible.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Annuler l&apos;événement
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="warning">
          Cette action annule l&apos;événement pour <strong>tous</strong> les participants ({participants}). Pour simplement ne pas y aller, utilisez « Me désister ».
        </Alert>
        <Field label="Message aux participants (facultatif)" htmlFor="cancel-msg">
          <Textarea id="cancel-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} label="Je confirme l'annulation de cet événement pour tous." />
        {err && <Alert tone="danger">{err}</Alert>}
      </div>
    </Dialog>
  );
}

function WithdrawDialog({ open, onClose, eventId, defaultMessage, isOrganizer, onDone }: { open: boolean; onClose: () => void; eventId: string; defaultMessage: string; isOrganizer: boolean; onDone: Done }) {
  const [notify, setNotify] = useState(!isOrganizer);
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Me désister"
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
                const r = await apiFetch<{ cancelledPersonalEvent: boolean; notified: boolean; deliveries: Delivery[] }>(`/api/events/${eventId}/withdraw`, { method: "POST", json: { notifyOrganizer: notify, message } });
                onDone({
                  tone: "success",
                  text: r.cancelledPersonalEvent ? "Événement personnel retiré de votre agenda." : `Désistement enregistré. L'événement est maintenu pour les autres.${r.notified ? " Organisateur prévenu." : ""}`,
                  deliveries: r.deliveries,
                });
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Désistement impossible.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer mon désistement
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">Votre participation sera retirée et vos rappels supprimés. L&apos;événement reste maintenu pour les autres participants.</p>
        {!isOrganizer && <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Prévenir l'organisateur" />}
        {notify && !isOrganizer && (
          <Field label="Message" htmlFor="wd-msg" hint="Ne mentionnez que ce que vous souhaitez partager.">
            <Textarea id="wd-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        )}
        {err && <Alert tone="danger">{err}</Alert>}
      </div>
    </Dialog>
  );
}

function InviteDialog({ open, onClose, eventId, groupId, exclude, onDone }: { open: boolean; onClose: () => void; eventId: string; groupId: string | null; exclude: string[]; onDone: Done }) {
  const members = useApi<{ members: { userId: string; name: string }[] }>(open ? "/api/orgs/members" : null);
  const groups = useApi<{ groups: { id: string; name: string; canManage: boolean }[] }>(open ? "/api/groups" : null);
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
          disabled={!selected.length && !group && !emails.trim()}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              let text = "";
              if (selected.length || group) {
                const r = await apiFetch<{ results: { status: string }[] }>(`/api/events/${eventId}/invite`, { method: "POST", json: { userIds: selected, groupId: group || null } });
                text += `${r.results.filter((x) => x.status === "invited").length} invitation(s) envoyée(s). `;
              }
              const list = emails.split(/[\s,;]+/).filter(Boolean);
              if (list.length) {
                const r = await apiFetch<{ results: { email: string; status: string; error?: string; link?: string }[] }>("/api/invitations/email", { method: "POST", json: { emails: list, eventId } });
                const sent = r.results.filter((x) => x.status === "email_sent" || x.status === "invited_member").length;
                const notSent = r.results.filter((x) => x.link);
                text += `${sent} invitation(s) par e-mail.`;
                if (notSent.length) text += ` Non envoyées (${notSent[0].error}) — liens à transmettre vous-même : ${notSent.map((x) => `${x.email} → ${x.link}`).join(" ; ")}`;
              }
              onDone({ tone: "success", text });
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
            <option value="">—</option>
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
          <p className="text-sm text-muted">Aucun autre membre dans l&apos;organisation.</p>
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
        {err && <Alert tone="danger">{err}</Alert>}
      </div>
    </Dialog>
  );
}

function RemindersDialog({ open, onClose, eventId, current, onDone }: { open: boolean; onClose: () => void; eventId: string; current: number[]; onDone: Done }) {
  const presets = [1440, 120, 30];
  const [offsets, setOffsets] = useState<number[]>(current);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rappels pour cet événement"
      footer={
        <Button
          onClick={async () => {
            try {
              const list = [...offsets, ...(custom ? [Number(custom)] : [])].filter((n) => Number.isFinite(n) && n >= 5);
              await apiFetch("/api/reminders", { method: "POST", json: { eventId, offsets: [...new Set(list)] } });
              onDone({ tone: "success", text: "Rappels mis à jour." });
            } catch (e) {
              setErr(e instanceof ApiError ? e.message : "Erreur");
            }
          }}
        >
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-2">
        {presets.map((p) => (
          <Checkbox key={p} checked={offsets.includes(p)} onChange={(e) => setOffsets(e.target.checked ? [...offsets, p] : offsets.filter((x) => x !== p))} label={p === 1440 ? "24 heures avant" : p === 120 ? "2 heures avant" : "30 minutes avant"} />
        ))}
        <Field label="Rappel personnalisé (minutes avant)" htmlFor="custom-rem">
          <Input id="custom-rem" type="number" min={5} max={40320} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ex. 60" />
        </Field>
        {err && <Alert tone="danger">{err}</Alert>}
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
        json: { occurrenceStart, action, ...(action === "move" ? { date, startTime, endTime } : {}), message: message || null },
      });
      onDone({ tone: "success", text: `${action === "cancel" ? "Date annulée" : action === "move" ? "Date déplacée" : "Date rétablie"}. Les autres dates sont inchangées. ${r.notified} participant(s) informé(s).` });
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
        <CardTitle>Cette date uniquement : {start.setLocale("fr-CH").toFormat("cccc d LLLL yyyy, HH'h'mm")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "move" ? "primary" : "outline"} onClick={() => setMode("move")}>
            Déplacer cette date
          </Button>
          <Button size="sm" variant={mode === "cancel" ? "danger" : "outline"} onClick={() => setMode("cancel")}>
            Annuler cette date
          </Button>
          <Button size="sm" variant="ghost" loading={busy && mode === null} onClick={() => send("restore")}>
            Rétablir l&apos;horaire d&apos;origine
          </Button>
        </div>
        {mode === "move" && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date" htmlFor="occ-d">
              <Input id="occ-d" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
            </Field>
            <Field label="Début" htmlFor="occ-s">
              <Input id="occ-s" type="time" value={startTime} onChange={(ev) => setStartTime(ev.target.value)} />
            </Field>
            <Field label="Fin" htmlFor="occ-e">
              <Input id="occ-e" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} />
            </Field>
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
        {err && <Alert tone="danger">{err}</Alert>}
      </CardContent>
    </Card>
  );
}

function MeetingButtons({ eventId, zoom, google, onDone }: { eventId: string; zoom: boolean; google: boolean; onDone: Done }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!zoom && !google) return null;
  async function create(provider: "zoom" | "google_meet") {
    setBusy(provider);
    try {
      await apiFetch(`/api/events/${eventId}/meeting`, { method: "POST", json: { provider } });
      onDone({ tone: "success", text: "Réunion en ligne créée. Les participants ont été informés du lien." });
    } catch (err) {
      onDone({ tone: "danger", text: err instanceof ApiError ? err.message : "Création impossible." });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {zoom && (
        <Button size="sm" variant="outline" loading={busy === "zoom"} onClick={() => create("zoom")}>
          <Video className="h-4 w-4" aria-hidden /> Créer une réunion Zoom
        </Button>
      )}
      {google && (
        <Button size="sm" variant="outline" loading={busy === "google_meet"} onClick={() => create("google_meet")}>
          <Video className="h-4 w-4" aria-hidden /> Créer un Google Meet
        </Button>
      )}
    </div>
  );
}
