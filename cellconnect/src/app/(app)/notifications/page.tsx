"use client";

import Link from "next/link";
import { useState } from "react";
import { DateTime } from "luxon";
import {
  Bell,
  BellRing,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CalendarX2,
  CheckCheck,
  Info,
  Mail,
  MailCheck,
  MessageSquare,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { dayBucket, plural, relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface N {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { eventId?: string; conflictId?: string; invitationId?: string };
  read_at: string | null;
  created_at: string;
  deliveries: { channel: keyof typeof t.channel; status: keyof typeof t.delivery; attempts: number; error: string | null }[];
}
type Answer = "accepted" | "tentative" | "declined";
type InvitationStatus = "pending" | Answer | "cancelled";

const ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  reminder: { icon: BellRing, cls: "bg-warm-bg text-warm-text" },
  invitation: { icon: Mail, cls: "bg-info-bg text-accent" },
  invitation_response: { icon: MailCheck, cls: "bg-success-bg text-success" },
  event_cancelled: { icon: CalendarX2, cls: "bg-subtle text-muted" },
  event_rescheduled: { icon: CalendarClock, cls: "bg-info-bg text-accent" },
  participant_withdrawn: { icon: UserMinus, cls: "bg-subtle text-muted" },
  conflict_detected: { icon: CalendarX, cls: "bg-warning-bg text-warning" },
  change_requested: { icon: MessageSquare, cls: "bg-info-bg text-accent" },
  slot_proposed: { icon: CalendarPlus, cls: "bg-info-bg text-accent" },
};
const FALLBACK_ICON = { icon: Info, cls: "bg-subtle text-muted" };

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "accepted", label: "Oui" },
  { value: "tentative", label: "Peut-être" },
  { value: "declined", label: "Non" },
];
const ANSWER_LABEL: Record<Answer, string> = { accepted: "Oui", tentative: "Peut-être", declined: "Non" };

/** États d'envoi écrits en clair (les envois « non envoyés » sont masqués). */
const DELIVERY_TEXT: Record<"email" | "push", Record<"sent" | "pending" | "failed", string>> = {
  email: { sent: "Envoyé par e-mail", pending: "Envoi par e-mail en cours", failed: "L'e-mail n'a pas pu être envoyé" },
  push: { sent: "Envoyé sur le téléphone", pending: "Envoi sur le téléphone en cours", failed: "L'envoi sur le téléphone a échoué" },
};

/** Phrase ajoutée côté serveur aux invitations ; ici, on répond directement dans la notification. */
const INVITE_HINT = /\n?Répondez dans CellConnect[^\n]*/g;

function groupLabel(iso: string, tz: string, yesterday: DateTime) {
  if (dayBucket(iso, tz) === "today") return "Aujourd'hui";
  if (dayBucket(iso, tz, yesterday) === "today") return "Hier";
  return "Plus tôt";
}

export default function NotificationsPage() {
  const { me, counters, refreshCounters } = useMe();
  const tz = me.profile.timezone;
  const { data, error, loading, reload, setData } = useApi<{ notifications: N[]; unread: number }>("/api/notifications");
  const hasInvitations = Boolean(data?.notifications.some((n) => n.type === "invitation" && n.data?.invitationId));
  const { data: invitations } = useApi<{ received: { id: string; status: InvitationStatus }[] }>(hasInvitations ? "/api/invitations" : null);

  const [filter, setFilter] = useState<"unread" | "all">("all");
  /** Notifications touchées pendant cette visite : elles restent visibles dans « Non lues ». */
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [answered, setAnswered] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function markOne(id: string) {
    setTouched((s) => new Set(s).add(id));
    if (data) {
      const readAt = new Date().toISOString();
      const notifications = data.notifications.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: readAt } : n));
      setData({ notifications, unread: notifications.filter((n) => !n.read_at).length });
    }
    await apiFetch("/api/notifications/read", { method: "POST", json: { ids: [id] } }).catch(() => undefined);
    refreshCounters();
  }

  async function markAll() {
    setErr(null);
    try {
      await apiFetch("/api/notifications/read", { method: "POST", json: { all: true } });
      refreshCounters();
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Impossible de tout marquer comme lu. Réessayez.");
    }
  }

  async function respond(n: N, invitationId: string, response: Answer) {
    setBusy(n.id);
    setErr(null);
    try {
      await apiFetch(`/api/invitations/${invitationId}/respond`, { method: "POST", json: { response } });
      setAnswered((a) => ({ ...a, [invitationId]: response }));
      await markOne(n.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "La réponse n'a pas pu être envoyée. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const all = data?.notifications ?? [];
  const unread = all.filter((n) => !n.read_at).length;
  const visible = filter === "unread" ? all.filter((n) => !n.read_at || touched.has(n.id)) : all;
  const yesterday = DateTime.now().minus({ days: 1 });
  const groups: { label: string; items: N[] }[] = [];
  for (const n of visible) {
    const label = groupLabel(n.created_at, tz, yesterday);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const statusOf = (invitationId: string): InvitationStatus | null =>
    answered[invitationId] ?? invitations?.received.find((i) => i.id === invitationId)?.status ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.notifications}
        description="Rappels, invitations et changements d'horaire."
        actions={
          unread ? (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Tout marquer comme lu
            </Button>
          ) : null
        }
      />

      {counters.invitations > 0 && (
        <Alert
          tone="info"
          action={
            <Link href="/invitations" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Répondre
            </Link>
          }
        >
          {plural(counters.invitations, "invitation attend", "invitations attendent")} votre réponse.
        </Alert>
      )}
      {err && (
        <Alert tone="danger" size="compact" live>
          {err}
        </Alert>
      )}

      {loading && !data ? (
        <ListSkeleton rows={4} />
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : !all.length ? (
        <EmptyState
          icon={Bell}
          title="Aucune notification"
          action={
            <Link href="/parametres#notifications" className={buttonVariants({ variant: "outline" })}>
              Régler mes rappels
            </Link>
          }
        >
          Vous recevrez ici les rappels avant vos rencontres, les invitations et les changements d&apos;horaire.
        </EmptyState>
      ) : (
        <>
          {error && <StaleBanner onRetry={reload} />}
          <div role="group" aria-label="Afficher" className="inline-grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
            {(
              [
                ["unread", unread ? `Non lues (${unread})` : "Non lues"],
                ["all", "Toutes"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn("h-11 rounded-xl px-4 text-sm text-muted transition-colors duration-(--dur-fast)", filter === value && "bg-card font-medium text-fg shadow-sm")}
              >
                {label}
              </button>
            ))}
          </div>

          {!visible.length ? (
            <EmptyState
              variant="plain"
              icon={CheckCheck}
              title="Tout est lu"
              action={
                <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                  Voir toutes les notifications
                </Button>
              }
            />
          ) : (
            groups.map((g) => (
              <section key={g.label} aria-label={g.label} className="space-y-2">
                <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</h2>
                <ul className="space-y-2">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <NotificationCard
                        n={n}
                        busy={busy === n.id}
                        invitationStatus={n.type === "invitation" && n.data?.invitationId ? statusOf(n.data.invitationId) : undefined}
                        onOpen={() => markOne(n.id)}
                        onRead={() => markOne(n.id)}
                        onRespond={(r) => n.data?.invitationId && respond(n, n.data.invitationId, r)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function NotificationCard({
  n,
  busy,
  invitationStatus,
  onOpen,
  onRead,
  onRespond,
}: {
  n: N;
  busy: boolean;
  /** undefined : pas une invitation ; null : statut pas encore chargé. */
  invitationStatus: InvitationStatus | null | undefined;
  onOpen: () => void;
  onRead: () => void;
  onRespond: (r: Answer) => void;
}) {
  const href = n.data?.conflictId ? "/conflits" : n.data?.eventId ? `/evenements/${n.data.eventId}` : null;
  const { icon: Icon, cls } = ICONS[n.type] ?? FALLBACK_ICON;
  const unread = !n.read_at;
  const body = n.body.replace(INVITE_HINT, "").trim();
  const deliveries = n.deliveries.filter(
    (d): d is N["deliveries"][number] & { channel: "email" | "push"; status: "sent" | "pending" | "failed" } => d.channel !== "in_app" && d.status !== "skipped",
  );

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-card p-4 shadow-sm",
        unread ? "border-accent/40" : "border-border",
        href && "hover:bg-subtle has-[[data-stretch]:focus-visible]:outline-2 has-[[data-stretch]:focus-visible]:outline-offset-2 has-[[data-stretch]:focus-visible]:outline-ring has-[[data-stretch]:focus-visible]:outline-solid",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full", cls)}>
          <Icon className="h-5 w-5" aria-hidden />
          {unread && <span aria-hidden className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-card" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            {href ? (
              <Link href={href} onClick={onOpen} data-stretch className="font-medium after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
                {unread && <span className="sr-only">Non lue : </span>}
                {n.title}
              </Link>
            ) : (
              <p className="font-medium">
                {unread && <span className="sr-only">Non lue : </span>}
                {n.title}
              </p>
            )}
            <span className="text-xs text-muted">{relative(n.created_at)}</span>
          </div>
          {body && <p className="mt-1 text-sm whitespace-pre-line text-muted wrap-anywhere">{body}</p>}

          {deliveries.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {deliveries.map((d, i) => (
                <span key={i} className={cn(d.status === "failed" && "text-danger")}>
                  {i > 0 && " · "}
                  {DELIVERY_TEXT[d.channel][d.status]}
                  {d.status === "pending" && d.attempts > 0 ? ` (essai ${d.attempts})` : ""}
                </span>
              ))}
            </p>
          )}

          {invitationStatus === "pending" && (
            <div role="group" aria-label={`Votre réponse à « ${n.title} »`} aria-busy={busy || undefined} className="relative z-10 mt-3 grid grid-cols-3 gap-2">
              {ANSWERS.map((a) => (
                <Button key={a.value} variant="outline" className="h-11" disabled={busy} onClick={() => onRespond(a.value)}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          {invitationStatus && invitationStatus !== "pending" && (
            <p className="mt-2">
              {invitationStatus === "cancelled" ? (
                <Badge>Invitation annulée</Badge>
              ) : (
                <Badge tone="success">Répondu : {ANSWER_LABEL[invitationStatus]}</Badge>
              )}
            </p>
          )}

          {unread && !href && (
            <button type="button" onClick={onRead} className="relative z-10 mt-1 -ml-1 inline-flex min-h-11 items-center rounded-xl px-1 text-sm text-accent hover:underline">
              Marquer comme lu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
