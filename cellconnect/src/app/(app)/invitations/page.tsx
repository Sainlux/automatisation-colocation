"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { fmtRange } from "@/components/app/format";

interface Inv {
  id: string;
  status: "pending" | "accepted" | "declined" | "tentative" | "cancelled";
  event: { id: string; title: string; start: string; end: string; timezone: string; status: string } | null;
  invitedBy: string;
  invitee: string | null;
}
const LABEL = { pending: "En attente", accepted: "Oui", declined: "Non", tentative: "Peut-être", cancelled: "Annulée" } as const;
const TONE = { pending: "warning", accepted: "success", declined: "danger", tentative: "neutral", cancelled: "neutral" } as const;

export default function InvitationsPage() {
  const { me, refreshCounters } = useMe();
  const { data, error, loading, reload } = useApi<{ received: Inv[]; sent: Inv[] }>("/api/invitations");
  const [err, setErr] = useState<string | null>(null);
  const tz = me.profile.timezone;

  async function respond(id: string, response: "accepted" | "declined" | "tentative") {
    setErr(null);
    try {
      await apiFetch(`/api/invitations/${id}/respond`, { method: "POST", json: { response } });
      refreshCounters();
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  const bySentEvent = new Map<string, Inv[]>();
  for (const i of data?.sent ?? []) if (i.event) bySentEvent.set(i.event.id, [...(bySentEvent.get(i.event.id) ?? []), i]);

  return (
    <div className="space-y-5">
      <PageHeader title="Invitations" description="Répondez aux invitations reçues et suivez les réponses à vos invitations." />
      {err && <Alert tone="danger">{err}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Reçues</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.received.length ? (
            <EmptyState icon={Mail} title="Aucune invitation reçue" />
          ) : (
            <ul className="divide-y divide-border">
              {data.received.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    {i.event ? (
                      <Link href={`/evenements/${i.event.id}`} className="font-medium hover:underline">
                        {i.event.title}
                      </Link>
                    ) : (
                      <span>Événement supprimé</span>
                    )}
                    {i.event && <p className="text-sm text-muted first-letter:uppercase">{fmtRange(i.event.start, i.event.end, tz)}</p>}
                    <p className="text-xs text-muted">Invité·e par {i.invitedBy}</p>
                  </div>
                  {i.event?.status === "cancelled" ? (
                    <Badge tone="danger">Événement annulé</Badge>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[i.status]}>{LABEL[i.status]}</Badge>
                      <Button size="sm" variant={i.status === "accepted" ? "success" : "outline"} onClick={() => respond(i.id, "accepted")}>
                        Oui
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => respond(i.id, "tentative")}>
                        Peut-être
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => respond(i.id, "declined")}>
                        Non
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Envoyées</CardTitle>
        </CardHeader>
        <CardContent>
          {bySentEvent.size === 0 ? (
            <p className="text-sm text-muted">Vous n&apos;avez envoyé aucune invitation. Ouvrez un événement puis « Inviter ».</p>
          ) : (
            <ul className="space-y-4">
              {[...bySentEvent.values()].map((list) => (
                <li key={list[0].event!.id}>
                  <Link href={`/evenements/${list[0].event!.id}`} className="font-medium hover:underline">
                    {list[0].event!.title}
                  </Link>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {list.map((i) => (
                      <li key={i.id}>
                        <Badge tone={TONE[i.status]}>
                          {i.invitee} : {LABEL[i.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
