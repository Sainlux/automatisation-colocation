"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bell, CalendarDays, CalendarX, Check, ChevronRight, ClipboardCheck, ClipboardPaste, Mail, MessageSquarePlus, Users, Video, type LucideIcon } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { canLead, isAdmin, useMe, type Me } from "@/components/app/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StaleBanner } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { EventList, type CalItem } from "@/components/app/event-list";
import { ActionRows } from "@/components/app/home/action-rows";
import { InstallCard } from "@/components/app/home/install-card";
import { fmtShortDate, fmtTime, relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type JobStatus = "pending" | "processing" | "needs_review" | "completed" | "failed";

interface Dashboard {
  today: CalItem[];
  upcoming: CalItem[];
  openConflicts: number;
  pendingInvitations: number;
  notifications: { id: string; title: string; body: string; created_at: string }[];
  groups: { id: string; name: string; color: string; memberCount: number; myRole: string | null }[];
  jobs: { id: string; status: JobStatus; step: keyof typeof t.steps; created_at: string; error: string | null }[];
  pendingReview: number;
  failures: { id: string; type: string; error: string | null }[];
}

/** Analyses pas encore terminées (affichées dans « Captures en cours »). */
const OPEN_JOB: Partial<Record<JobStatus, { label: string; tone: "neutral" | "primary" | "warning" }>> = {
  pending: { label: "En attente", tone: "neutral" },
  processing: { label: "Lecture…", tone: "primary" },
  needs_review: { label: "À vérifier", tone: "warning" },
};
const isRunning = (s: JobStatus) => s === "pending" || s === "processing";

/** Phrase ajoutée côté serveur aux invitations ; inutile ici, on répond directement dans l'application. */
const INVITE_HINT = /\n?Répondez dans CellConnect[^\n]*/g;

const POLL_MS = 3000;
const WAKE_THROTTLE_MS = 60_000;

export default function HomePage() {
  const { me, setCounters } = useMe();
  const { data, error, loading, reload } = useApi<Dashboard>("/api/dashboard");
  const tz = me.profile.timezone;

  // L'accueil charge déjà les compteurs : il les transmet à la navigation (pas de second appel).
  useEffect(() => {
    if (data) setCounters({ conflicts: data.openConflicts, invitations: data.pendingInvitations });
  }, [data, setCounters]);

  // Une analyse tourne : rechargement toutes les 3 s, en pause quand l'onglet est caché.
  const running = Boolean(data?.jobs.some((j) => isRunning(j.status)));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [running, reload]);

  // Retour sur l'application (ex. le matin) : données rafraîchies, au plus une fois par minute.
  const lastLoaded = useRef(0);
  useEffect(() => {
    if (data) lastLoaded.current = Date.now();
  }, [data]);
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoaded.current >= WAKE_THROTTLE_MS) reload();
    };
    document.addEventListener("visibilitychange", onWake);
    return () => document.removeEventListener("visibilitychange", onWake);
  }, [reload]);

  const isNew =
    data &&
    !data.jobs.length &&
    !data.today.length &&
    !data.upcoming.length &&
    !data.groups.length &&
    !data.openConflicts &&
    !data.pendingInvitations;

  return (
    <div className="space-y-5" aria-busy={loading && !data ? true : undefined}>
      <Hero me={me} />

      {loading && !data ? (
        <div className="space-y-5">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <ListSkeleton rows={3} />
        </div>
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : data ? (
        <>
          {error && <StaleBanner onRetry={reload} />}
          {isNew ? (
            <>
              <FirstSteps me={me} hasJobs={data.jobs.length > 0} hasGroups={data.groups.length > 0} />
              <InstallCard pushAvailable={me.integrations.push.available} />
            </>
          ) : (
            <Overview data={data} tz={tz} pushAvailable={me.integrations.push.available} />
          )}
        </>
      ) : null}
    </div>
  );
}

/** Haut de page : salutation et action principale. */
function Hero({ me }: { me: Me }) {
  const firstName = me.profile.display_name.trim().split(/\s+/)[0];
  const ai = me.integrations.ai.available;
  const Icon = ai ? MessageSquarePlus : ClipboardPaste;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h1 className="text-2xl leading-tight font-bold tracking-tight text-warm">{firstName ? `Bonjour ${firstName}` : "Bonjour"}</h1>
      <p className="mt-1 hidden text-sm text-muted sm:block">Collez ou importez un message reçu : les dates sont trouvées, vérifiées, puis ajoutées à votre agenda.</p>
      <Link href="/capture" className={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}>
        <Icon className="h-5 w-5" aria-hidden /> {ai ? t.nav.capture : "Coller un message"}
      </Link>
      {!ai && isAdmin(me.role) && (
        <p className="mt-3 text-sm text-muted">
          Les captures d&apos;écran ne sont pas encore lues : ajoutez une clé OpenAI dans{" "}
          <Link href="/admin" className="font-medium text-accent underline underline-offset-2">
            {t.nav.admin}
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** Nouveau compte : trois premiers pas, cochés d'après les données. */
function FirstSteps({ me, hasJobs, hasGroups }: { me: Me; hasJobs: boolean; hasGroups: boolean }) {
  const providers = [me.integrations.google.available && "Google", me.integrations.outlook.available && "Outlook"].filter((p): p is string => Boolean(p));
  const { data: cal } = useApi<{ connections: { id: string }[] }>(providers.length ? "/api/calendar/connections" : null);
  const lead = canLead(me.role);
  const steps = [
    {
      href: "/capture?exemple=1",
      title: "Essayer avec un exemple",
      hint: "Découvrez comment analyser une capture avec un message type. Rien n'est ajouté sans votre accord.",
      done: hasJobs,
    },
    {
      href: "/groupes",
      title: lead ? "Créer mon premier groupe" : t.nav.groups,
      hint: lead ? "Réunissez les membres de votre cellule pour les inviter en un geste." : "Retrouvez les groupes dont vous faites partie.",
      done: hasGroups,
    },
    ...(providers.length
      ? [
          {
            href: "/parametres/calendriers",
            title: `Relier mon agenda ${providers.join(" ou ")}`,
            hint: "Vos rencontres y apparaissent toutes seules.",
            done: Boolean(cal?.connections.length),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Premiers pas</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="-mx-1 space-y-1">
          {steps.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-2 hover:bg-subtle">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    s.done ? "bg-success text-success-fg" : "border border-input-border text-muted",
                  )}
                >
                  {s.done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-medium", s.done && "text-muted line-through")}>
                    {s.done && <span className="sr-only">Fait : </span>}
                    {s.title}
                  </span>
                  <span className="block text-sm text-muted">{s.hint}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Overview({ data, tz, pushAvailable }: { data: Dashboard; tz: string; pushAvailable: boolean }) {
  const todayIds = new Set(data.today.map((e) => e.id));
  const upcoming = data.upcoming.filter((e) => !todayIds.has(e.id));
  const next = upcoming[0];
  const visio = data.today.filter((e) => e.meetingUrl && e.status !== "cancelled");
  const review = data.jobs.filter((j) => j.status === "needs_review");
  const openJobs = data.jobs.filter((j) => OPEN_JOB[j.status]);

  return (
    <>
      <ActionRows conflicts={data.openConflicts} invitations={data.pendingInvitations} review={review} failures={data.failures} />
      <InstallCard pushAvailable={pushAvailable} />

      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        <Stat href="/conflits" icon={CalendarX} label={t.nav.conflicts} value={data.openConflicts} warn />
        <Stat href="/invitations" icon={Mail} label={t.nav.invitations} value={data.pendingInvitations} />
        <Stat href={review[0] ? `/capture/${review[0].id}` : "/historique"} icon={ClipboardCheck} label="À vérifier" value={data.pendingReview} warn />
        <Stat href="/calendrier" icon={CalendarDays} label="Aujourd'hui" value={data.today.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Aujourd&apos;hui</CardTitle>
            </CardHeader>
            <CardContent>
              {data.today.length ? (
                <>
                  <EventList items={data.today} tz={tz} />
                  {visio.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visio.map((e) => (
                        <a
                          key={e.id}
                          href={e.meetingUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(buttonVariants(), "w-full sm:w-auto")}
                        >
                          <Video className="h-5 w-5" aria-hidden /> Rejoindre la visio
                          {visio.length > 1 && <span className="tabular-nums"> · {fmtTime(e.start, tz)}</span>}
                          <span className="sr-only"> : {e.title} (nouvel onglet)</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  Rien aujourd&apos;hui
                  {next && (
                    <>
                      {" · Prochain : "}
                      <Link href={`/evenements/${next.eventId}`} className="font-medium text-accent hover:underline">
                        {next.title}
                      </Link>
                      , <span className="tabular-nums">{fmtShortDate(next.start, tz)} à {fmtTime(next.start, tz)}</span>
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prochains événements</CardTitle>
              <Link href="/calendrier" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline sm:min-h-0">
                Tout l&apos;agenda
              </Link>
            </CardHeader>
            <CardContent>
              {upcoming.length ? (
                <EventList items={upcoming.slice(0, 5)} tz={tz} />
              ) : (
                <EmptyState
                  variant="plain"
                  icon={CalendarDays}
                  title="Aucun événement à venir"
                  action={
                    <Link href="/capture" className={buttonVariants({ size: "sm" })}>
                      {t.nav.capture}
                    </Link>
                  }
                >
                  Importez un message reçu ou créez un événement.
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {openJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Captures en cours</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="-mx-1 space-y-1">
                  {openJobs.map((j) => {
                    const s = OPEN_JOB[j.status]!;
                    return (
                      <li key={j.id}>
                        <Link href={`/capture/${j.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-1 text-sm hover:bg-subtle">
                          <span className="min-w-0 truncate text-muted">
                            {isRunning(j.status) ? `${t.steps[j.step] ?? "Lecture"} · importée ${relative(j.created_at)}` : `Analysée ${relative(j.created_at)}`}
                          </span>
                          <Badge tone={s.tone} className="shrink-0">
                            {s.label}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t.nav.groups}</CardTitle>
              <Link href="/groupes" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline sm:min-h-0">
                Gérer
              </Link>
            </CardHeader>
            <CardContent>
              {data.groups.length ? (
                <ul className="-mx-1 space-y-1">
                  {data.groups.slice(0, 3).map((g) => (
                    <li key={g.id}>
                      <Link href={`/groupes/${g.id}`} className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-sm hover:bg-subtle">
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color }} />
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        <span className="text-muted tabular-nums">
                          {g.memberCount}
                          <span className="sr-only"> {g.memberCount > 1 ? "membres" : "membre"}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Users className="h-4 w-4 shrink-0" aria-hidden /> Vous ne faites partie d&apos;aucun groupe.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="hidden lg:block">
            <CardHeader>
              <CardTitle>{t.nav.notifications}</CardTitle>
              <Link href="/notifications" className="text-sm font-medium text-accent hover:underline">
                Tout voir
              </Link>
            </CardHeader>
            <CardContent>
              {data.notifications.length ? (
                <ul className="space-y-3">
                  {data.notifications.map((n) => (
                    <li key={n.id} className="flex gap-2 text-sm">
                      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium">{n.title}</p>
                        <p className="line-clamp-2 text-muted">{n.body.replace(INVITE_HINT, "").trim()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucune notification non lue.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ href, icon: Icon, label, value, warn }: { href: string; icon: LucideIcon; label: string; value: number; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:bg-subtle">
      <Icon className={cn("h-5 w-5 text-muted", warn && value > 0 && "text-warning")} aria-hidden />
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Link>
  );
}
