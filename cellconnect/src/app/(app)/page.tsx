"use client";

import Link from "next/link";
import { Bell, CalendarDays, CalendarX, Camera, ClipboardCheck, Mail, TriangleAlert, Users } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { EventList, type CalItem } from "@/components/app/event-list";
import { relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface Dashboard {
  today: CalItem[];
  upcoming: CalItem[];
  openConflicts: number;
  pendingInvitations: number;
  notifications: { id: string; title: string; body: string; created_at: string }[];
  groups: { id: string; name: string; color: string; memberCount: number; myRole: string | null }[];
  jobs: { id: string; status: string; step: keyof typeof t.steps; created_at: string; error: string | null }[];
  pendingReview: number;
  failures: { id: string; type: string; error: string | null }[];
}

const JOB_LABEL: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" }> = {
  pending: { label: "En attente", tone: "neutral" },
  processing: { label: "Analyse…", tone: "primary" },
  needs_review: { label: "À valider", tone: "warning" },
  completed: { label: "Terminé", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
};

export default function DashboardPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<Dashboard>("/api/dashboard");
  const tz = me.profile.timezone;
  const firstName = me.profile.display_name.split(" ")[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-primary p-5 text-primary-fg sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm opacity-80">Bonjour {firstName}</p>
          <h1 className="text-xl font-semibold sm:text-2xl">Une capture, et tout s&apos;organise.</h1>
          <p className="mt-1 text-sm opacity-80">Importez un message reçu : les dates sont extraites, vérifiées et ajoutées à votre agenda.</p>
        </div>
        <Link href="/capture" className={cn(buttonVariants({ size: "lg" }), "bg-card text-fg hover:bg-subtle")}>
          <Camera className="h-5 w-5" aria-hidden /> Analyser une capture
        </Link>
      </div>

      {!me.integrations.ai.available && (
        <Alert tone="info" title="Analyse d'images non configurée">
          L&apos;analyse des captures d&apos;écran nécessite une clé OpenAI. En attendant, vous pouvez coller le texte d&apos;un message : il est analysé localement.
        </Alert>
      )}

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat href="/conflits" icon={CalendarX} label="Conflits" value={data.openConflicts} tone={data.openConflicts ? "danger" : undefined} />
            <Stat href="/invitations" icon={Mail} label="Invitations" value={data.pendingInvitations} tone={data.pendingInvitations ? "warning" : undefined} />
            <Stat href="/capture" icon={ClipboardCheck} label="À valider" value={data.pendingReview} tone={data.pendingReview ? "warning" : undefined} />
            <Stat href="/calendrier" icon={CalendarDays} label="Aujourd'hui" value={data.today.length} />
          </div>

          {(data.openConflicts > 0 || data.pendingReview > 0 || data.failures.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Actions nécessitant votre validation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.openConflicts > 0 && (
                  <Alert tone="danger" title={`${data.openConflicts} conflit(s) d'agenda`} action={<Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/conflits">Résoudre</Link>}>
                    Deux événements se chevauchent : choisissez lequel maintenir.
                  </Alert>
                )}
                {data.jobs
                  .filter((j) => j.status === "needs_review")
                  .map((j) => (
                    <Alert key={j.id} tone="warning" title="Événements extraits à vérifier" action={<Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/capture/${j.id}`}>Vérifier</Link>}>
                      Analyse du {relative(j.created_at)}.
                    </Alert>
                  ))}
                {data.failures.map((f) => (
                  <Alert key={f.id} tone="danger" title="Synchronisation échouée">
                    {f.error}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Prochains événements</CardTitle>
                <Link href="/calendrier" className="text-sm text-accent hover:underline">
                  Calendrier
                </Link>
              </CardHeader>
              <CardContent>
                {data.upcoming.length ? (
                  <EventList items={data.upcoming} tz={tz} />
                ) : (
                  <EmptyState icon={CalendarDays} title="Aucun événement à venir" action={<Link href="/capture" className={buttonVariants({ size: "sm" })}>Importer des dates</Link>}>
                    Importez une capture ou créez un événement.
                  </EmptyState>
                )}
              </CardContent>
            </Card>

            <div className="space-y-5 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <Link href="/notifications" className="text-sm text-accent hover:underline">
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
                            <p className="line-clamp-2 text-muted">{n.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Aucune notification non lue.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mes groupes</CardTitle>
                  <Link href="/groupes" className="text-sm text-accent hover:underline">
                    Gérer
                  </Link>
                </CardHeader>
                <CardContent>
                  {data.groups.length ? (
                    <ul className="space-y-2">
                      {data.groups.map((g) => (
                        <li key={g.id}>
                          <Link href={`/groupes/${g.id}`} className="flex items-center gap-2 text-sm hover:underline">
                            <span className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                            <span className="flex-1 truncate">{g.name}</span>
                            <span className="text-muted">{g.memberCount}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Users className="h-4 w-4" aria-hidden /> Vous ne faites partie d&apos;aucun groupe.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dernières captures analysées</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.jobs.length ? (
                    <ul className="space-y-2">
                      {data.jobs.map((j) => (
                        <li key={j.id}>
                          <Link href={`/capture/${j.id}`} className="flex items-center justify-between gap-2 text-sm hover:underline">
                            <span className="text-muted">{relative(j.created_at)}</span>
                            <Badge tone={JOB_LABEL[j.status]?.tone}>{JOB_LABEL[j.status]?.label ?? j.status}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Aucune capture pour l&apos;instant.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ href, icon: Icon, label, value, tone }: { href: string; icon: typeof TriangleAlert; label: string; value: number; tone?: "danger" | "warning" }) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:bg-subtle">
      <Icon className={cn("h-5 w-5 text-muted", tone === "danger" && "text-danger", tone === "warning" && "text-warning")} aria-hidden />
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Link>
  );
}
