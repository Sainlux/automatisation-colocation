"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { apiFetch, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { relative } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface N {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { eventId?: string; conflictId?: string };
  read_at: string | null;
  created_at: string;
  deliveries: { channel: keyof typeof t.channel; status: keyof typeof t.delivery; attempts: number; error: string | null }[];
}

export default function NotificationsPage() {
  const { refreshCounters } = useMe();
  const { data, error, loading, reload } = useApi<{ notifications: N[]; unread: number }>("/api/notifications");

  async function markAll() {
    await apiFetch("/api/notifications/read", { method: "POST", json: { all: true } });
    refreshCounters();
    reload();
  }
  async function markOne(id: string) {
    await apiFetch("/api/notifications/read", { method: "POST", json: { ids: [id] } });
    refreshCounters();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Rappels, invitations, changements et conflits. L'état d'envoi de chaque canal est indiqué."
        actions={
          data?.unread ? (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Tout marquer comme lu
            </Button>
          ) : null
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data?.notifications.length ? (
        <EmptyState icon={Bell} title="Aucune notification" />
      ) : (
        <ul className="space-y-2">
          {data.notifications.map((n) => {
            const href = n.data?.conflictId ? "/conflits" : n.data?.eventId ? `/evenements/${n.data.eventId}` : null;
            return (
              <li key={n.id}>
                <Card className={cn(!n.read_at && "border-accent/40")}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-label={n.read_at ? undefined : "Non lue"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium">{n.title}</p>
                          <span className="text-xs text-muted">{relative(n.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {n.deliveries
                            .filter((d) => d.channel !== "in_app")
                            .map((d, i) => (
                              <Badge key={i} tone={d.status === "sent" ? "success" : d.status === "failed" ? "danger" : d.status === "pending" ? "warning" : "neutral"} title={d.error ?? undefined}>
                                {t.channel[d.channel]} : {t.delivery[d.status]}
                                {d.status === "pending" && d.attempts > 0 ? ` (essai ${d.attempts})` : ""}
                              </Badge>
                            ))}
                          {href && (
                            <Link href={href} onClick={() => markOne(n.id)} className="text-sm text-accent hover:underline">
                              Ouvrir
                            </Link>
                          )}
                          {!n.read_at && (
                            <button onClick={() => markOne(n.id).then(reload)} className="text-sm text-muted hover:underline">
                              Marquer comme lu
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
