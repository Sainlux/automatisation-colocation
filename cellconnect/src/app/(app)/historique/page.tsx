"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { fmtDateTime } from "@/components/app/format";

const LABELS: Record<string, string> = {
  "account.created": "Compte créé",
  "auth.login": "Connexion",
  "extraction.started": "Capture importée",
  "upload.deleted": "Fichiers source supprimés",
  "event.created": "Événement créé",
  "event.updated": "Événement modifié",
  "event.rescheduled": "Horaire modifié",
  "event.cancelled": "Événement annulé (pour tous)",
  "events.batch_committed": "Événements validés depuis une capture",
  "participant.withdrawn": "Désistement",
  "invitation.sent": "Invitations envoyées",
  "invitation.accepted": "Invitation acceptée",
  "invitation.declined": "Invitation refusée",
  "invitation.tentative": "Réponse « peut-être »",
  "conflict.keep_a": "Conflit résolu (événement A maintenu)",
  "conflict.keep_b": "Conflit résolu (événement B maintenu)",
  "conflict.keep_both": "Conflit accepté",
  "conflict.postpone": "Décision reportée",
  "conflict.propose_slot": "Autre créneau proposé",
  "conflict.request_change": "Changement demandé",
  "group.created": "Groupe créé",
  "group.updated": "Groupe modifié",
  "group.deleted": "Groupe supprimé",
  "group.member_added": "Membre ajouté au groupe",
  "group.member_removed": "Membre retiré du groupe",
  "org.created": "Organisation créée",
  "org.member_added": "Membre ajouté à l'organisation",
  "org.role_changed": "Rôle modifié",
  "profile.updated": "Paramètres modifiés",
  "calendar.connected": "Calendrier connecté",
  "calendar.disconnected": "Calendrier déconnecté",
};

export default function HistoryPage() {
  const { me } = useMe();
  const [scope, setScope] = useState("me");
  const { data, error, loading, reload } = useApi<{ logs: { id: string; action: string; actor: string; created_at: string; entity_type: string; metadata: Record<string, unknown> }[] }>(`/api/history?scope=${scope}`);
  return (
    <div className="space-y-4">
      <PageHeader title="Historique" description="Journal de toutes les actions effectuées (conservé pour la traçabilité)." />
      {isAdmin(me.role) && (
        <div className="max-w-xs">
          <Select aria-label="Portée" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="me">Mes actions</option>
            <option value="org">Toute l&apos;organisation</option>
          </Select>
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data?.logs.length ? (
        <EmptyState icon={History} title="Aucune action enregistrée" />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y divide-border">
              {data.logs.map((l) => (
                <li key={l.id} className="flex flex-col py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm">
                    {LABELS[l.action] ?? l.action}
                    {scope === "org" && <span className="text-muted"> · {l.actor}</span>}
                  </span>
                  <span className="text-xs text-muted">{fmtDateTime(l.created_at, me.profile.timezone)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
