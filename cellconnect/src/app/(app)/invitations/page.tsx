"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { DateTile } from "@/components/app/date-tile";
import { fmtTimeRange } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type Status = "pending" | "accepted" | "declined" | "tentative" | "cancelled";
type Answer = "accepted" | "tentative" | "declined";

interface Inv {
  id: string;
  status: Status;
  event: { id: string; title: string; start: string; end: string; timezone: string; status: string } | null;
  invitedBy: string;
  invitee: string | null;
  kind: "event" | "organization";
  emailStatus: "sent" | "failed" | "skipped" | null;
  emailError: string | null;
}
interface Data {
  received: Inv[];
  sent: Inv[];
}

const STATUS: Record<Status, { label: string; tone: "neutral" | "primary" | "success" }> = {
  pending: { label: "En attente", tone: "neutral" },
  accepted: { label: "Oui", tone: "success" },
  tentative: { label: "Peut-être", tone: "primary" },
  declined: { label: "Non", tone: "neutral" },
  cancelled: { label: "Annulée", tone: "neutral" },
};
const ANSWERS: { value: Answer; label: string }[] = [
  { value: "accepted", label: "Oui" },
  { value: "tentative", label: "Peut-être" },
  { value: "declined", label: "Non" },
];
const CONFIRM_MS = 4000;

const isAnswerable = (i: Inv) => i.status !== "cancelled" && i.event !== null && i.event.status !== "cancelled";

export default function InvitationsPage() {
  const { me, refreshCounters } = useMe();
  const tz = me.profile.timezone;
  const { data, error, loading, reload, setData } = useApi<Data>("/api/invitations");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; value: Answer } | null>(null);
  /** Invitations répondues pendant cette visite : elles restent en place, avec leur confirmation. */
  const [answeredNow, setAnsweredNow] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState<{ id: string; label: string } | null>(null);
  const [toCancel, setToCancel] = useState<Inv | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Confirmation éphémère après une réponse.
  useEffect(() => {
    if (!confirmed) return;
    const id = setTimeout(() => setConfirmed(null), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmed]);

  function patch(id: string, status: Status) {
    if (!data) return;
    const up = (list: Inv[]) => list.map((i) => (i.id === id ? { ...i, status } : i));
    setData({ received: up(data.received), sent: up(data.sent) });
  }

  async function respond(i: Inv, value: Answer) {
    setErr(null);
    setBusy({ id: i.id, value });
    try {
      await apiFetch(`/api/invitations/${i.id}/respond`, { method: "POST", json: { response: value } });
      patch(i.id, value);
      setAnsweredNow((s) => new Set(s).add(i.id));
      setConfirmed({ id: i.id, label: STATUS[value].label });
      refreshCounters();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "La réponse n'a pas pu être envoyée. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelInvitation() {
    if (!toCancel) return;
    setErr(null);
    setCancelling(true);
    try {
      await apiFetch(`/api/invitations/${toCancel.id}`, { method: "DELETE" });
      patch(toCancel.id, "cancelled");
      setToCancel(null);
    } catch (e) {
      setToCancel(null);
      setErr(e instanceof ApiError ? e.message : "L'invitation n'a pas pu être annulée. Réessayez.");
    } finally {
      setCancelling(false);
    }
  }

  const received = (data?.received ?? []).filter((i) => i.kind === "event");
  const toAnswer = received.filter((i) => (i.status === "pending" && isAnswerable(i)) || answeredNow.has(i.id));
  const done = received.filter((i) => !toAnswer.includes(i));
  const pendingCount = toAnswer.filter((i) => i.status === "pending").length;

  const sent = data?.sent ?? [];
  const sentGroups: { key: string; title: string; href: string | null; items: Inv[] }[] = [];
  const orgInvites = sent.filter((i) => i.kind === "organization");
  if (orgInvites.length) sentGroups.push({ key: "org", title: "Rejoindre l'organisation", href: null, items: orgInvites });
  for (const i of sent) {
    if (!i.event) continue;
    const g = sentGroups.find((x) => x.key === i.event!.id);
    if (g) g.items.push(i);
    else sentGroups.push({ key: i.event.id, title: i.event.title, href: `/evenements/${i.event.id}`, items: [i] });
  }

  const row = (i: Inv) => (
    <ReceivedRow key={i.id} i={i} tz={tz} busy={busy?.id === i.id ? busy.value : null} confirmation={confirmed?.id === i.id ? confirmed.label : null} onRespond={(v) => respond(i, v)} />
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t.nav.invitations} description="Répondez aux invitations reçues et suivez celles que vous avez envoyées." />
      {err && (
        <Alert tone="danger" live>
          {err}
        </Alert>
      )}

      {loading && !data ? (
        <ListSkeleton rows={3} />
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : (
        <>
          {error && <StaleBanner onRetry={reload} />}

          {received.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Reçues</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState variant="plain" icon={Mail} title="Aucune invitation reçue">
                  Quand un responsable vous invite à une rencontre, vous pourrez répondre ici en un geste : oui, peut-être ou non.
                </EmptyState>
              </CardContent>
            </Card>
          ) : (
            <>
              {toAnswer.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>À répondre ({pendingCount})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border">{toAnswer.map(row)}</ul>
                  </CardContent>
                </Card>
              )}
              {done.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Déjà répondu</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border">{done.map(row)}</ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Envoyées</CardTitle>
            </CardHeader>
            <CardContent>
              {sentGroups.length === 0 ? (
                <EmptyState
                  variant="plain"
                  icon={Send}
                  title="Aucune invitation envoyée"
                  action={
                    <Link href="/calendrier" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      Ouvrir l&apos;agenda
                    </Link>
                  }
                >
                  Pour inviter quelqu&apos;un, ouvrez un événement de votre agenda, puis touchez « Inviter ».
                </EmptyState>
              ) : (
                <div className="space-y-5">
                  {sentGroups.map((g) => (
                    <section key={g.key} aria-label={g.title}>
                      {g.href ? (
                        <Link href={g.href} className="font-medium hover:underline">
                          {g.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{g.title}</p>
                      )}
                      <ul className="mt-1 divide-y divide-border">
                        {g.items.map((i) => (
                          <SentRow key={i.id} i={i} onCancel={() => setToCancel(i)} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        title="Annuler l'invitation ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToCancel(null)} disabled={cancelling}>
              Garder l&apos;invitation
            </Button>
            <Button variant="danger" onClick={cancelInvitation} loading={cancelling}>
              Annuler l&apos;invitation
            </Button>
          </>
        }
      >
        {toCancel && (
          <p className="text-sm">
            {toCancel.invitee ?? "Cette personne"}{" "}
            {toCancel.event ? <>ne pourra plus répondre à « {toCancel.event.title} ».</> : <>ne pourra plus rejoindre l&apos;organisation avec ce lien.</>}
          </p>
        )}
      </Dialog>
    </div>
  );
}

function ReceivedRow({
  i,
  tz,
  busy,
  confirmation,
  onRespond,
}: {
  i: Inv;
  tz: string;
  busy: Answer | null;
  confirmation: string | null;
  onRespond: (v: Answer) => void;
}) {
  const ev = i.event;
  return (
    <li className="py-3">
      <div className="flex gap-3">
        {ev && <DateTile date={ev.start} tz={tz} size="sm" />}
        <div className="min-w-0 flex-1">
          {ev ? (
            <Link href={`/evenements/${ev.id}`} className="font-medium hover:underline">
              {ev.title}
            </Link>
          ) : (
            <p className="font-medium text-muted">Événement supprimé</p>
          )}
          {ev && <p className="text-sm text-muted tabular-nums">{fmtTimeRange(ev.start, ev.end, tz)}</p>}
          <p className="text-xs text-muted">Invité par {i.invitedBy}</p>
        </div>
      </div>
      {isAnswerable(i) ? (
        <div role="group" aria-label={`Votre réponse à « ${ev?.title ?? "l'événement"} »`} aria-busy={busy ? true : undefined} className="mt-3 grid grid-cols-3 gap-2">
          {ANSWERS.map((a) => (
            <Button
              key={a.value}
              variant="outline"
              className="h-11"
              pressed={i.status === a.value}
              loading={busy === a.value}
              disabled={busy !== null}
              onClick={() => i.status !== a.value && onRespond(a.value)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : ev || i.status === "cancelled" ? (
        <p className="mt-2">
          <Badge>{i.status === "cancelled" ? "Invitation annulée" : "Événement annulé"}</Badge>
        </p>
      ) : null}
      <p role="status" className={cn("text-sm font-medium text-success", confirmation && "mt-2 animate-step-in")}>
        {confirmation && `Réponse enregistrée : ${confirmation}`}
      </p>
    </li>
  );
}

function SentRow({ i, onCancel }: { i: Inv; onCancel: () => void }) {
  const s = STATUS[i.status];
  const who = i.invitee ?? "—";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate">{who}</p>
        {i.emailStatus === "failed" && (
          <p className="text-xs text-danger wrap-anywhere">L&apos;e-mail n&apos;a pas pu être envoyé{i.emailError ? ` : ${i.emailError}` : "."}</p>
        )}
        {i.emailStatus === "skipped" && <p className="text-xs text-muted">Aucun e-mail envoyé : transmettez le lien vous-même.</p>}
      </div>
      <Badge tone={s.tone} className="shrink-0">
        {s.label}
      </Badge>
      {i.status === "pending" && (
        <Button variant="outline" size="sm" className="h-11 shrink-0" aria-label={`Annuler l'invitation de ${who}`} onClick={onCancel}>
          Annuler
        </Button>
      )}
    </li>
  );
}
