"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, Clock, MessageSquare, PauseCircle, Users } from "lucide-react";
import { DateTime } from "luxon";
import { apiFetch, ApiError, newIdempotencyKey, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { fmtRange } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface Side {
  id: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  groupName: string | null;
  organizer: string;
  isOrganizer: boolean;
  canEdit: boolean;
  otherParticipants: number;
  location: string | null;
  meetingUrl: string | null;
}
interface Conflict {
  id: string;
  status: "open" | "postponed" | "resolved" | "dismissed";
  kind: "full" | "partial" | "travel_buffer";
  overlapMinutes: number;
  a: Side | null;
  b: Side | null;
}
type DeliveryInfo = { channel: keyof typeof t.channel; status: keyof typeof t.delivery; error: string | null };
type Action = "keep_a" | "keep_b" | "propose_slot" | "request_change" | "postpone" | "keep_both";

export default function ConflictsPage() {
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading, reload } = useApi<{ conflicts: Conflict[] }>(`/api/conflicts${showAll ? "?status=all" : ""}`);
  const { refreshCounters } = useMe();
  const [flash, setFlash] = useState<{ text: string; deliveries?: { channel: keyof typeof t.channel; status: keyof typeof t.delivery; error: string | null }[] } | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conflits d'agenda"
        description="Deux événements se chevauchent quand vous êtes attendu·e aux deux. Vos choix ne concernent que votre participation."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Conflits ouverts" : "Afficher l'historique"}
          </Button>
        }
      />
      {flash && (
        <Alert tone="success" title={flash.text}>
          {flash.deliveries?.map((d, i) => (
            <p key={i} className="text-xs">
              {t.channel[d.channel]} : {t.delivery[d.status]}
              {d.error ? ` (${d.error})` : ""}
            </p>
          ))}
        </Alert>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data && data.conflicts.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Aucun conflit">
          Votre agenda est cohérent. Les nouveaux événements sont vérifiés automatiquement.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {data?.conflicts.map((c) => (
            <li key={c.id}>
              <ConflictCard
                c={c}
                onResolved={(text, deliveries) => {
                  setFlash({ text, deliveries });
                  refreshCounters();
                  reload();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConflictCard({ c, onResolved }: { c: Conflict; onResolved: (text: string, d?: DeliveryInfo[]) => void }) {
  const { me } = useMe();
  const tz = me.profile.timezone;
  const [action, setAction] = useState<Action | null>(null);
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"a" | "b">("b");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  if (!c.a || !c.b) return null;
  const closed = c.status === "resolved" || c.status === "dismissed";
  const withdrawn = action === "keep_a" ? c.b : action === "keep_b" ? c.a : null;
  const targetSide = target === "a" ? c.a : c.b;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      let proposedStart: string | null = null;
      let proposedEnd: string | null = null;
      if (action === "propose_slot") {
        if (!slotDate || !slotStart || !slotEnd) throw new Error("Indiquez la date et les heures proposées.");
        proposedStart = DateTime.fromISO(`${slotDate}T${slotStart}`, { zone: targetSide.timezone }).toUTC().toISO();
        proposedEnd = DateTime.fromISO(`${slotDate}T${slotEnd}`, { zone: targetSide.timezone }).toUTC().toISO();
      }
      const r = await apiFetch<{ outcome: { notified?: boolean; deliveries?: { channel: keyof typeof t.channel; status: keyof typeof t.delivery; error: string | null }[]; cancelledPersonalEvent?: boolean } }>(
        `/api/conflicts/${c.id}/resolve`,
        {
          method: "POST",
          idempotencyKey: key,
          json: {
            action,
            notifyOrganizer: Boolean(withdrawn && !withdrawn.isOrganizer && notify),
            message: message.trim() || null,
            target: action === "propose_slot" || action === "request_change" ? target : undefined,
            proposedStart,
            proposedEnd,
          },
        },
      );
      const text =
        action === "postpone"
          ? "Décision reportée."
          : action === "keep_both"
            ? "Conflit accepté : les deux événements sont conservés."
            : action === "propose_slot" || action === "request_change"
              ? "Demande envoyée à l'organisateur."
              : r.outcome.cancelledPersonalEvent
                ? `« ${withdrawn?.title} » a été retiré de votre agenda.`
                : `Vous êtes désisté·e de « ${withdrawn?.title} ». L'événement est maintenu pour les autres.`;
      onResolved(text, r.outcome.deliveries);
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn(!closed && "border-danger/40")}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={closed ? "neutral" : "danger"}>{c.kind === "travel_buffer" ? "Temps de déplacement insuffisant" : c.kind === "full" ? "Chevauchement complet" : "Chevauchement partiel"}</Badge>
          {c.overlapMinutes > 0 && <Badge tone="warning">{c.overlapMinutes} min en commun</Badge>}
          {c.status === "postponed" && <Badge>Décision reportée</Badge>}
          {closed && <Badge tone="success">Résolu</Badge>}
        </div>
        {!closed && <p className="font-medium">Attention, deux événements se chevauchent. Lequel souhaitez-vous maintenir ?</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((k) => {
            const s = c[k]!;
            const keep = k === "a" ? "keep_a" : "keep_b";
            return (
              <button
                key={k}
                type="button"
                disabled={closed}
                onClick={() => setAction(keep)}
                className={cn("rounded-2xl border p-4 text-left transition-colors", action === keep ? "border-success bg-success-bg" : withdrawn?.id === s.id ? "border-danger/50 bg-danger-bg" : "border-border hover:bg-subtle")}
                aria-pressed={action === keep}
              >
                <p className="text-xs font-medium uppercase text-muted">Événement {k.toUpperCase()}</p>
                <Link href={`/evenements/${s.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                  {s.title}
                </Link>
                <p className="mt-1 flex items-center gap-1 text-sm first-letter:uppercase">
                  <Clock className="h-3.5 w-3.5 text-muted" aria-hidden /> {fmtRange(s.start, s.end, tz)}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Users className="h-3.5 w-3.5" aria-hidden /> {s.groupName ?? "Personnel"} · organisé par {s.isOrganizer ? "vous" : s.organizer} · {s.otherParticipants} autre(s) participant(s)
                </p>
                {!closed && <p className="mt-2 text-sm font-medium text-success">{action === keep ? "✓ Maintenu" : "Maintenir celui-ci"}</p>}
              </button>
            );
          })}
        </div>

        {!closed && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={action === "propose_slot" ? "primary" : "outline"} onClick={() => setAction("propose_slot")}>
                <Clock className="h-4 w-4" aria-hidden /> Proposer un autre créneau
              </Button>
              <Button size="sm" variant={action === "request_change" ? "primary" : "outline"} onClick={() => setAction("request_change")}>
                <MessageSquare className="h-4 w-4" aria-hidden /> Demander un changement
              </Button>
              <Button size="sm" variant={action === "keep_both" ? "primary" : "outline"} onClick={() => setAction("keep_both")}>
                Garder les deux
              </Button>
              <Button size="sm" variant={action === "postpone" ? "primary" : "outline"} onClick={() => setAction("postpone")}>
                <PauseCircle className="h-4 w-4" aria-hidden /> Reporter la décision
              </Button>
            </div>

            {withdrawn && (
              <div className="space-y-2 rounded-xl bg-subtle p-3 text-sm">
                <p>
                  <strong>Conséquence :</strong>{" "}
                  {withdrawn.isOrganizer && withdrawn.otherParticipants === 0
                    ? `« ${withdrawn.title} » (événement personnel) sera retiré de votre agenda.`
                    : `vous vous désistez de « ${withdrawn.title} ». L'événement est maintenu pour ${withdrawn.otherParticipants} autre(s) participant(s) ; vos rappels sont supprimés.`}
                </p>
                {!withdrawn.isOrganizer && (
                  <>
                    <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label={`Informer ${withdrawn.organizer} (organisateur)`} />
                    {notify && (
                      <Field label="Message (facultatif)" hint="Sans message, un texte poli est envoyé. Votre autre événement n'est jamais mentionné.">
                        <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bonjour, je ne pourrai pas participer à la réunion en raison d'un conflit d'agenda. Merci de votre compréhension." />
                      </Field>
                    )}
                  </>
                )}
              </div>
            )}

            {(action === "propose_slot" || action === "request_change") && (
              <div className="space-y-3 rounded-xl bg-subtle p-3">
                <Field label="Événement concerné" htmlFor={`${c.id}-target`}>
                  <Select id={`${c.id}-target`} value={target} onChange={(e) => setTarget(e.target.value as "a" | "b")}>
                    {!c.a.isOrganizer && <option value="a">{c.a.title} (organisé par {c.a.organizer})</option>}
                    {!c.b.isOrganizer && <option value="b">{c.b.title} (organisé par {c.b.organizer})</option>}
                  </Select>
                </Field>
                {targetSide.isOrganizer && <Alert tone="info">Vous organisez cet événement : modifiez directement son horaire depuis sa fiche.</Alert>}
                {action === "propose_slot" && (
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Date" htmlFor={`${c.id}-d`}>
                      <Input id={`${c.id}-d`} type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
                    </Field>
                    <Field label="Début" htmlFor={`${c.id}-s`}>
                      <Input id={`${c.id}-s`} type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
                    </Field>
                    <Field label="Fin" htmlFor={`${c.id}-e`}>
                      <Input id={`${c.id}-e`} type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} />
                    </Field>
                  </div>
                )}
                <Field label="Message à l'organisateur" htmlFor={`${c.id}-m`}>
                  <Textarea id={`${c.id}-m`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
                </Field>
              </div>
            )}

            {err && <Alert tone="danger">{err}</Alert>}
            <div className="flex justify-end">
              <Button onClick={submit} disabled={!action} loading={busy}>
                Valider ma décision
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
