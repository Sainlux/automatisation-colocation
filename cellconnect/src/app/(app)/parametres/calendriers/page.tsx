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

type Provider = "google" | "outlook" | "zoom";
interface Data {
  connections: { id: string; provider: Provider; accountEmail: string | null; status: string; lastSyncedAt: string | null; lastError: string | null; webhook: boolean }[];
  providers: Record<Provider | "ics", { available: boolean; reason: string | null }>;
}

const LABEL: Record<Provider, string> = { google: "Google Calendar", outlook: "Microsoft Outlook", zoom: "Zoom" };
const DESCRIPTION: Record<Provider, string> = {
  google: "Envoi de vos événements, import de vos rendez-vous Google pour détecter les conflits, création de liens Google Meet.",
  outlook: "Envoi de vos événements vers Outlook / Microsoft 365 et import de vos rendez-vous pour détecter les conflits.",
  zoom: "Création de réunions Zoom depuis un événement ; mises à jour et annulations répercutées.",
};

function feedback(params: URLSearchParams): { tone: "success" | "danger" | "warning"; text: string } | null {
  for (const p of ["google", "outlook", "zoom"] as Provider[]) {
    const v = params.get(p);
    if (!v) continue;
    if (v === "connecte") return { tone: "success", text: `${LABEL[p]} est connecté.` };
    if (v === "refuse") return { tone: "warning", text: "Autorisation refusée : aucun accès n'a été accordé." };
    if (v === "etat-invalide") return { tone: "danger", text: "Session de connexion expirée ou invalide. Réessayez." };
    return { tone: "danger", text: `La connexion à ${LABEL[p]} a échoué.` };
  }
  return null;
}

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
  const sp = useSearchParams();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(() => feedback(sp));
  const [busy, setBusy] = useState(false);

  async function connect(provider: Provider) {
    try {
      const r = await apiFetch<{ url: string }>("/api/calendar/connect", { method: "POST", json: { provider } });
      window.location.assign(r.url); // redirection externe vers le fournisseur OAuth
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
          {(["google", "outlook", "zoom"] as Provider[]).map((p) => {
            const conns = data.connections.filter((c) => c.provider === p && c.status !== "revoked");
            return (
              <Card key={p}>
                <CardHeader>
                  <CardTitle>{LABEL[p]}</CardTitle>
                  {!data.providers[p].available && <Badge>Non configuré</Badge>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted">{DESCRIPTION[p]}</p>
                  {conns.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle p-3 text-sm">
                      <div>
                        <p className="font-medium">{c.accountEmail ?? `Compte ${LABEL[p]}`}</p>
                        {p !== "zoom" && (
                          <p className="text-xs text-muted">
                            {c.lastSyncedAt ? `Dernière synchronisation : ${fmtDateTime(c.lastSyncedAt, me.profile.timezone)}` : "Jamais synchronisé"}
                            {c.webhook ? " · mises à jour en temps réel actives" : " · synchronisation périodique"}
                          </p>
                        )}
                        {c.lastError && <p className="text-xs text-danger">{c.lastError}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Badge tone={c.status === "active" ? "success" : "danger"}>{c.status === "active" ? "Actif" : "Erreur"}</Badge>
                        {c.status !== "active" && (
                          <Button size="sm" onClick={() => connect(p)}>
                            Reconnecter
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={async () => { await apiFetch(`/api/calendar/connections/${c.id}`, { method: "DELETE" }); reload(); }}>
                          Déconnecter
                        </Button>
                      </div>
                    </div>
                  ))}
                  {data.providers[p].available ? (
                    <div className="flex flex-wrap gap-2">
                      {conns.length === 0 && <Button onClick={() => connect(p)}>Connecter {LABEL[p]}</Button>}
                      {p !== "zoom" && conns.some((c) => c.status === "active") && (
                        <Button variant="outline" onClick={sync} loading={busy}>
                          <RefreshCw className="h-4 w-4" aria-hidden /> Synchroniser maintenant
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Alert tone="info" title="Indisponible sur ce serveur">
                      {data.providers[p].reason}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
