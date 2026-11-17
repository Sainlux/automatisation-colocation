"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { fmtDateTime, frTypo } from "@/components/app/format";
import { historyHref, historyLabel } from "@/components/app/event/logic";
import { t } from "@/i18n";

interface Log {
  id: string;
  action: string;
  actor: string;
  created_at: string;
  entity_type: string;
  entity_id: string | null;
  /** Titre de l'événement ou du groupe concerné, quand il peut être montré. */
  title?: string | null;
  metadata: Record<string, unknown>;
}

export default function HistoryPage() {
  const { me } = useMe();
  const [scope, setScope] = useState("me");
  const { data, error, loading, reload } = useApi<{ logs: Log[] }>(`/api/history?scope=${scope}`);
  const tz = me.profile.timezone;
  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.history} description="Le journal de ce qui a été fait, et quand." />
      {isAdmin(me.role) && (
        <div className="max-w-xs">
          <Select aria-label="Afficher" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="me">Mes actions</option>
            <option value="org">Toute l&apos;église</option>
          </Select>
        </div>
      )}
      {loading && !data ? (
        <ListSkeleton rows={4} />
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : !data?.logs.length ? (
        <EmptyState icon={History} title="Aucune action enregistrée">
          Chaque {t.words.importedMessage}, modification d&apos;événement ou réponse à une invitation apparaîtra ici, avec sa date.
        </EmptyState>
      ) : (
        <>
          {error && <StaleBanner onRetry={reload} />}
          <Card>
            <CardContent className="pt-2 sm:pt-3">
              <ul className="divide-y divide-border">
                {data.logs.map((l) => {
                  const href = historyHref(l);
                  const content = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          {historyLabel(l.action)}
                          {scope === "org" && <span className="text-muted"> · {l.actor}</span>}
                        </span>
                        {l.title && <span className="block text-sm font-medium wrap-anywhere">{frTypo(l.title)}</span>}
                        <span className="block text-xs text-muted tabular-nums">{fmtDateTime(l.created_at, tz)}</span>
                      </span>
                      {href && <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {href ? (
                        <Link href={href} className="-mx-2 flex min-h-12 items-center gap-2 rounded-xl px-2 py-2 hover:bg-subtle">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex min-h-12 items-center gap-2 py-2">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
