"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, CirclePause, Clock, MessageSquare, Undo2, Users } from "lucide-react";
import { DateTime } from "luxon";
import { apiFetch, ApiError, newIdempotencyKey, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { OverlapBar } from "@/components/app/overlap-bar";
import { fmtShortDate, fmtTimeRange, frTypo, plural } from "@/components/app/format";
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
type Flash = { text: string; deliveries?: DeliveryInfo[]; undoHref?: string };

const KIND_LABEL: Record<Conflict["kind"], string> = {
  full: "Chevauchement complet",
  partial: "Chevauchement partiel",
  travel_buffer: "Trop peu de temps pour le trajet",
};

/** « personne d'autre », « 1 autre participant », « 3 autres participants ». */
const othersText = (n: number) => (n === 0 ? "personne d'autre" : plural(n, "autre participant", "autres participants"));

/** Événement personnel : vous l'organisez et personne d'autre n'y participe (un retrait le supprime). */
const isPersonal = (s: Side) => s.isOrganizer && s.otherParticipants === 0;

export default function ConflictsPage() {
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading, reload } = useApi<{ conflicts: Conflict[] }>(`/api/conflicts${showAll ? "?status=all" : ""}`);
  const { refreshCounters } = useMe();
  const [flash, setFlash] = useState<Flash | null>(null);
  const hasData = Boolean(data);

  // Arrivée par un lien /conflits#conflit-… : la carte n'existe qu'une fois les données chargées.
  useEffect(() => {
    if (!hasData) return;
    const id = window.location.hash.slice(1);
    if (id.startsWith("conflit-")) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [hasData]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.conflicts}
        description="Vos choix ne concernent que votre participation : les autres ne voient jamais votre autre événement."
        actions={
          <Button variant="outline" size="sm" pressed={showAll} onClick={() => setShowAll(!showAll)}>
            Voir aussi les conflits réglés
          </Button>
        }
      />
      {flash && (
        <Alert
          tone="success"
          title={flash.text}
          live
          action={
            flash.undoHref && (
              <Link href={flash.undoHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Undo2 className="h-4 w-4" aria-hidden /> Revenir sur ma décision
              </Link>
            )
          }
        >
          {flash.deliveries?.map((d, i) => (
            <p key={i} className="text-xs">
              {t.channel[d.channel]} : {t.delivery[d.status]}
              {d.error ? ` (${d.error})` : ""}
            </p>
          ))}
        </Alert>
      )}
      {loading && !data ? (
        <ListSkeleton rows={2} />
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : data && data.conflicts.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Aucun conflit">
          Votre agenda est cohérent. Chaque nouvel événement est vérifié automatiquement.
        </EmptyState>
      ) : (
        <>
          {error && <StaleBanner onRetry={reload} />}
          <ul className="space-y-4">
            {data?.conflicts.map((c) => (
              <li key={c.id}>
                <ConflictCard
                  c={c}
                  onResolved={(f) => {
                    setFlash(f);
                    refreshCounters();
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ConflictCard({ c, onResolved }: { c: Conflict; onResolved: (f: Flash) => void }) {
  const { me } = useMe();
  const tz = me.profile.timezone;
  const closed = c.status === "resolved" || c.status === "dismissed";
  const [action, setAction] = useState<Action | null>(null);
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  // Une demande ne peut viser qu'un événement organisé par quelqu'un d'autre.
  const [target, setTarget] = useState<"a" | "b">(c.b && !c.b.isOrganizer ? "b" : "a");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const firstChoice = useRef<HTMLButtonElement>(null);
  // Date d'ajout de chaque événement, pour distinguer « Déjà prévu » de « Nouveau ».
  const detailA = useApi<{ event: { created_at: string } }>(!closed && c.a ? `/api/events/${c.a.id}` : null);
  const detailB = useApi<{ event: { created_at: string } }>(!closed && c.b ? `/api/events/${c.b.id}` : null);
  if (!c.a || !c.b) return null;
  const sides = { a: c.a, b: c.b };
  const withdrawn = action === "keep_a" ? c.b : action === "keep_b" ? c.a : null;
  const targetSide = sides[target];
  const canAsk = !(c.a.isOrganizer && c.b.isOrganizer);
  const asking = action === "propose_slot" || action === "request_change";

  const ca = detailA.data?.event.created_at;
  const cb = detailB.data?.event.created_at;
  const age = ca && cb && ca !== cb ? (ca < cb ? { a: "old", b: "new" } : { a: "new", b: "old" }) : null;
  const eyebrow = (k: "a" | "b") => (age ? (age[k] === "new" ? "Nouveau" : "Déjà prévu") : (sides[k].groupName ?? "Personnel"));

  function choose(a: Action) {
    setAction(a);
    setHint(null);
    setErr(null);
  }

  const submitLabel =
    action === "keep_a" || action === "keep_b"
      ? frTypo(`Me retirer de « ${withdrawn!.title} »`)
      : action === "keep_both"
        ? "Garder les deux"
        : action === "postpone"
          ? "Décider plus tard"
          : asking
            ? "Envoyer à l'organisateur"
            : null;

  async function submit() {
    if (!action) {
      // Jamais d'impasse : on amène à la première chose à faire.
      setHint("Touchez d'abord l'événement auquel vous irez.");
      firstChoice.current?.focus();
      return;
    }
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
      const r = await apiFetch<{ outcome: { notified?: boolean; deliveries?: DeliveryInfo[]; cancelledPersonalEvent?: boolean } }>(`/api/conflicts/${c.id}/resolve`, {
        method: "POST",
        idempotencyKey: key,
        json: {
          action,
          notifyOrganizer: Boolean(withdrawn && !withdrawn.isOrganizer && notify),
          message: message.trim() || null,
          target: asking ? target : undefined,
          proposedStart,
          proposedEnd,
        },
      });
      if (withdrawn) {
        const personal = Boolean(r.outcome.cancelledPersonalEvent);
        onResolved({
          text: personal ? frTypo(`« ${withdrawn.title} » a été retiré de votre agenda.`) : frTypo(`Vous ne participez plus à « ${withdrawn.title} ». L'événement est maintenu pour les autres.`),
          deliveries: r.outcome.deliveries,
          // Un événement personnel retiré est annulé : il n'y a plus rien à rejoindre.
          undoHref: personal ? undefined : `/evenements/${withdrawn.id}?from=conflits`,
        });
      } else {
        onResolved({
          text: action === "postpone" ? "D'accord, vous déciderez plus tard." : action === "keep_both" ? "Les deux événements restent dans votre agenda." : "Votre demande a été envoyée à l'organisateur.",
          deliveries: r.outcome.deliveries,
        });
      }
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const sideBody = (k: "a" | "b") => {
    const s = sides[k];
    const label = eyebrow(k);
    return (
      <>
        <span className={cn("block text-xs font-semibold tracking-wide uppercase", label === "Nouveau" ? "text-warm-text" : "text-muted")}>{label}</span>
        <span className="mt-0.5 block font-semibold wrap-anywhere">{frTypo(s.title)}</span>
        <span className="mt-1 flex items-center gap-1.5 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="tabular-nums first-letter:uppercase">
            {fmtShortDate(s.start, tz)} · {fmtTimeRange(s.start, s.end, tz)}
          </span>
        </span>
        <span className="mt-1 flex items-start gap-1.5 text-xs text-muted">
          <Users className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            Organisé par {s.isOrganizer ? "vous" : s.organizer} · {othersText(s.otherParticipants)}
          </span>
        </span>
      </>
    );
  };

  return (
    <Card id={`conflit-${c.id}`} className={cn("scroll-mt-20 target:ring-2 target:ring-warning/40", !closed && "border-warning/40")}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={closed ? "neutral" : "warning"}>{KIND_LABEL[c.kind]}</Badge>
          {c.status === "postponed" && <Badge>Décision reportée</Badge>}
          {c.status === "resolved" && <Badge tone="success">Réglé</Badge>}
          {c.status === "dismissed" && <Badge tone="success">Plus de chevauchement</Badge>}
        </div>

        <OverlapBar a={{ start: c.a.start, end: c.a.end, label: c.a.title }} b={{ start: c.b.start, end: c.b.end, label: c.b.title }} tz={tz} />

        {!closed && (
          <div>
            <p className="text-sm text-muted">Attention, deux événements se chevauchent.</p>
            <h2 className="text-lg font-semibold">À quel événement irez-vous ?</h2>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((k) => {
            const s = sides[k];
            const keep = k === "a" ? "keep_a" : "keep_b";
            const chosen = action === keep;
            const dropped = withdrawn?.id === s.id;
            return (
              <div
                key={k}
                className={cn(
                  "flex min-w-0 flex-col rounded-2xl border transition-colors duration-(--dur-fast)",
                  chosen ? "border-success bg-success-bg" : dropped ? "border-border bg-subtle" : closed ? "border-border" : "border-input-border bg-card",
                )}
              >
                {closed ? (
                  <div className="p-4">{sideBody(k)}</div>
                ) : (
                  <button ref={k === "a" ? firstChoice : undefined} type="button" aria-pressed={chosen} onClick={() => choose(keep)} className="flex-1 rounded-2xl p-4 text-left hover:bg-subtle/60">
                    {sideBody(k)}
                    <span className={cn(buttonVariants({ variant: chosen ? "success" : "outline", size: "sm" }), "pointer-events-none mt-3")}>
                      {chosen && <Check className="h-4 w-4" aria-hidden />} J&apos;y vais
                    </span>
                    {dropped && <span className="mt-2 block text-sm font-medium text-muted">{isPersonal(s) ? "Sera retiré de votre agenda" : "Vous n'y serez pas"}</span>}
                  </button>
                )}
                <Link href={`/evenements/${s.id}?from=conflits`} className="mx-4 mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-accent hover:underline">
                  Voir la fiche<span className="sr-only"> de « {s.title} »</span>
                </Link>
              </div>
            );
          })}
        </div>

        {!closed && (
          <>
            {action && (
              <div className="animate-step-in space-y-3 rounded-xl border border-border bg-subtle p-3 text-sm">
                <p>
                  <strong>Conséquence :</strong>{" "}
                  {withdrawn
                    ? isPersonal(withdrawn)
                      ? frTypo(`« ${withdrawn.title} » (événement personnel) sera retiré de votre agenda.`)
                      : frTypo(
                          `vous vous retirez de « ${withdrawn.title} ». ${withdrawn.otherParticipants ? `L'événement est maintenu pour ${othersText(withdrawn.otherParticipants)}` : "L'événement est maintenu"} ; vos rappels pour cet événement sont supprimés.`,
                        )
                    : action === "keep_both"
                      ? "les deux événements restent dans votre agenda. Ce chevauchement ne vous sera plus signalé."
                      : action === "postpone"
                        ? "rien ne change pour l'instant. Ce conflit reste dans cette liste."
                        : frTypo(
                            `l'organisateur de « ${targetSide.title} » reçoit votre ${action === "propose_slot" ? "proposition" : "demande"}, sans jamais voir votre autre événement. Le conflit reste ouvert en attendant sa réponse.`,
                          )}
                </p>
                {withdrawn && !withdrawn.isOrganizer && (
                  <>
                    <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label={`Prévenir ${withdrawn.organizer} (organisateur)`} />
                    {notify && (
                      <Field label="Message (facultatif)" htmlFor={`${c.id}-wm`} hint="Sans message, un texte poli est envoyé. Votre autre événement n'est jamais mentionné.">
                        <Textarea id={`${c.id}-wm`} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bonjour, je ne pourrai pas participer en raison d'un conflit d'agenda. Merci de votre compréhension." />
                      </Field>
                    )}
                  </>
                )}
                {asking && (
                  <>
                    {!c.a.isOrganizer && !c.b.isOrganizer && (
                      <Field label="Événement concerné" htmlFor={`${c.id}-target`}>
                        <Select id={`${c.id}-target`} value={target} onChange={(e) => setTarget(e.target.value as "a" | "b")}>
                          <option value="a">
                            {c.a.title} (organisé par {c.a.organizer})
                          </option>
                          <option value="b">
                            {c.b.title} (organisé par {c.b.organizer})
                          </option>
                        </Select>
                      </Field>
                    )}
                    {action === "propose_slot" && (
                      <div className="space-y-3">
                        <Field label="Date proposée" htmlFor={`${c.id}-d`}>
                          <Input id={`${c.id}-d`} type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Début" htmlFor={`${c.id}-s`}>
                            <Input id={`${c.id}-s`} type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
                          </Field>
                          <Field label="Fin" htmlFor={`${c.id}-e`}>
                            <Input id={`${c.id}-e`} type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} />
                          </Field>
                        </div>
                      </div>
                    )}
                    <Field label="Message à l'organisateur" htmlFor={`${c.id}-m`}>
                      <Textarea id={`${c.id}-m`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
                    </Field>
                  </>
                )}
              </div>
            )}

            <Disclosure summary="Autres possibilités" open={moreOpen} onToggle={setMoreOpen}>
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <Button variant="outline" pressed={action === "keep_both"} onClick={() => choose("keep_both")}>
                  Garder les deux
                </Button>
                <Button variant="outline" pressed={action === "postpone"} onClick={() => choose("postpone")}>
                  <CirclePause className="h-4 w-4" aria-hidden /> Décider plus tard
                </Button>
                {canAsk && (
                  <Button variant="outline" pressed={action === "propose_slot"} onClick={() => choose("propose_slot")}>
                    <Clock className="h-4 w-4" aria-hidden /> Proposer un autre créneau
                  </Button>
                )}
                {canAsk && (
                  <Button variant="outline" pressed={action === "request_change"} onClick={() => choose("request_change")}>
                    <MessageSquare className="h-4 w-4" aria-hidden /> Demander un changement
                  </Button>
                )}
              </div>
            </Disclosure>

            {err && (
              <Alert tone="danger" live>
                {err}
              </Alert>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <p aria-live="polite" className="text-sm text-muted sm:mr-auto">
                {hint}
              </p>
              <Button onClick={submit} loading={busy} className="h-auto min-h-11 w-full py-2 sm:w-auto">
                {submitLabel ? (
                  <>
                    <span className="sr-only">Valider ma décision : </span>
                    {submitLabel}
                  </>
                ) : (
                  "Valider ma décision"
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
