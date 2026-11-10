"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, RefreshCw, Upload } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loading, PageHeader } from "@/components/ui/states";
import { fmtDateTime } from "@/components/app/format";

interface Data {
  connections: { id: string; provider: string; accountEmail: string | null; status: string; lastSyncedAt: string | null; lastError: string | null }[];
  providers: Record<"google" | "outlook" | "ics", { available: boolean; reason: string | null }>;
}

const FEEDBACK: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  connecte: { tone: "success", text: "Google Calendar est connecté." },
  refuse: { tone: "warning", text: "Autorisation refusée : aucun accès n'a été accordé." },
  erreur: { tone: "danger", text: "La connexion à Google a échoué." },
  "etat-invalide": { tone: "danger", text: "Session de connexion expirée ou invalide. Réessayez." },
};

export default function CalendarsPage() {
  return (
    <Suspense>
      <Calendars />
    </Suspense>
  );
}

function Calendars() {
  const { me } = useMe();
  const { data, reload } = useApi<Data>("/api/calendar/connections");
  const g = useSearchParams().get("google");
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(g && FEEDBACK[g] ? FEEDBACK[g] : null);
  const [busy, setBusy] = useState(false);

  async function connect(provider: "google" | "outlook") {
    try {
      const r = await apiFetch<{ url: string }>("/api/calendar/connect", { method: "POST", json: { provider } });
      window.location.href = r.url;
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Erreur" });
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const r = await apiFetch<{ pushed: number; pushErrors: number; imported: number }>("/api/calendar/sync", { method: "POST" });
      setMsg({ tone: r.pushErrors ? "warning" : "success", text: `Synchronisation : ${r.pushed} envoi(s), ${r.imported} événement(s) importé(s)${r.pushErrors ? `, ${r.pushErrors} échec(s)` : ""}.` });
      reload();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/parametres" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Paramètres
      </Link>
      <PageHeader title="Connexions aux calendriers" description="CellConnect ne modifie un calendrier externe qu'après votre autorisation explicite (OAuth)." />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Google Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.connections
                .filter((c) => c.provider === "google" && c.status !== "revoked")
                .map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle p-3 text-sm">
                    <div>
                      <p className="font-medium">{c.accountEmail ?? "Compte Google"}</p>
                      <p className="text-xs text-muted">{c.lastSyncedAt ? `Dernière synchronisation : ${fmtDateTime(c.lastSyncedAt, me.profile.timezone)}` : "Jamais synchronisé"}</p>
                      {c.lastError && <p className="text-xs text-danger">{c.lastError}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Badge tone={c.status === "active" ? "success" : "danger"}>{c.status === "active" ? "Actif" : "Erreur"}</Badge>
                      <Button size="sm" variant="outline" onClick={async () => { await apiFetch(`/api/calendar/connections/${c.id}`, { method: "DELETE" }); reload(); }}>
                        Déconnecter
                      </Button>
                    </div>
                  </div>
                ))}
              {data.providers.google.available ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => connect("google")}>Connecter un compte Google</Button>
                  {data.connections.some((c) => c.status === "active") && (
                    <Button variant="outline" onClick={sync} loading={busy}>
                      <RefreshCw className="h-4 w-4" aria-hidden /> Synchroniser maintenant
                    </Button>
                  )}
                </div>
              ) : (
                <Alert tone="info" title="Indisponible sur ce serveur">
                  {data.providers.google.reason}
                </Alert>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Microsoft Outlook</CardTitle>
              <Badge>Bientôt</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{data.providers.outlook.reason}. En attendant, utilisez l&apos;export .ics ci-dessous.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>iCalendar (.ics)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <a href="/api/calendar/export" className={buttonVariants({ variant: "outline" })}>
                <Download className="h-4 w-4" aria-hidden /> Exporter mon agenda
              </a>
              <Link href="/capture" className={buttonVariants({ variant: "outline" })}>
                <Upload className="h-4 w-4" aria-hidden /> Importer un fichier .ics
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
