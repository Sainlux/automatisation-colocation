"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, RefreshCw, Upload } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { fmtDateTime, plural } from "@/components/app/format";
import { t } from "@/i18n";

type Provider = "google" | "outlook" | "zoom";
interface Data {
  connections: { id: string; provider: Provider; accountEmail: string | null; status: string; lastSyncedAt: string | null; lastError: string | null; webhook: boolean }[];
  providers: Record<Provider | "ics", { available: boolean; reason: string | null }>;
}
type Msg = { tone: "success" | "danger" | "warning"; text: string };

const LABEL: Record<Provider, string> = { google: "Google Agenda", outlook: "Outlook", zoom: "Zoom" };
const DESCRIPTION: Record<Provider, string> = {
  google: "Vos rencontres CellConnect apparaissent dans Google Agenda, et vos rendez-vous Google sont pris en compte pour repérer les conflits. Lien Google Meet possible.",
  outlook: "Vos rencontres CellConnect apparaissent dans Outlook, et vos rendez-vous Outlook sont pris en compte pour repérer les conflits.",
  zoom: "Créez un lien Zoom depuis un événement ; les changements et annulations suivent automatiquement.",
};

function feedback(params: URLSearchParams): Msg | null {
  for (const p of ["google", "outlook", "zoom"] as Provider[]) {
    const v = params.get(p);
    if (!v) continue;
    if (v === "connecte") return { tone: "success", text: `${LABEL[p]} est connecté.` };
    if (v === "refuse") return { tone: "warning", text: "Autorisation refusée : aucun accès n'a été donné." };
    if (v === "etat-invalide") return { tone: "danger", text: "La demande de connexion a expiré. Réessayez." };
    return { tone: "danger", text: `La connexion à ${LABEL[p]} a échoué. Réessayez.` };
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
  const admin = isAdmin(me.role);
  const { data, error, loading, reload } = useApi<Data>("/api/calendar/connections");
  const sp = useSearchParams();
  const [msg, setMsg] = useState<Msg | null>(() => feedback(sp));
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, action: () => Promise<void>) {
    setBusy(key);
    setMsg(null);
    try {
      await action();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion internet." });
    } finally {
      setBusy(null);
    }
  }

  const connect = (provider: Provider) =>
    act(`connect-${provider}`, async () => {
      const r = await apiFetch<{ url: string }>("/api/calendar/connect", { method: "POST", json: { provider } });
      window.location.assign(r.url); // redirection externe vers le fournisseur (OAuth)
    });

  const disconnect = (id: string) =>
    act(`disconnect-${id}`, async () => {
      await apiFetch(`/api/calendar/connections/${id}`, { method: "DELETE" });
      reload();
    });

  const sync = () =>
    act("sync", async () => {
      const r = await apiFetch<{ pushed: number; pushErrors: number; imported: number }>("/api/calendar/sync", { method: "POST" });
      const parts = [plural(r.pushed, "rencontre envoyée", "rencontres envoyées"), plural(r.imported, "rendez-vous importé", "rendez-vous importés")];
      if (r.pushErrors) parts.push(plural(r.pushErrors, "envoi a échoué", "envois ont échoué"));
      setMsg({ tone: r.pushErrors ? "warning" : "success", text: `Synchronisation terminée : ${parts.join(", ")}.` });
      reload();
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendriers connectés"
        description="CellConnect n'écrit dans un autre agenda qu'avec votre accord."
        back={{ href: "/parametres", label: t.nav.settings }}
      />
      {msg && (
        <Alert tone={msg.tone} live>
          {msg.text}
        </Alert>
      )}
      {error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} back={{ href: "/parametres", label: t.nav.settings }} />
      ) : !data ? (
        loading && <ListSkeleton rows={3} />
      ) : (
        <>
          {error && <StaleBanner onRetry={reload} />}
          {(["google", "outlook", "zoom"] as Provider[]).map((p) => {
            const conns = data.connections.filter((c) => c.provider === p && c.status !== "revoked");
            const available = data.providers[p].available;
            return (
              <Card key={p}>
                <CardHeader>
                  <CardTitle>{LABEL[p]}</CardTitle>
                  {!available && <Badge>Pas encore disponible</Badge>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-pretty text-muted">{DESCRIPTION[p]}</p>
                  {conns.map((c) => {
                    const active = c.status === "active";
                    return (
                      <div key={c.id} className="space-y-2 rounded-xl bg-subtle p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 font-medium wrap-anywhere">{c.accountEmail ?? `Compte ${LABEL[p]}`}</p>
                          <Badge tone={active ? "success" : "warning"}>{active ? "Connecté" : "À reconnecter"}</Badge>
                        </div>
                        {p !== "zoom" && (
                          <p className="text-xs text-muted">
                            {c.lastSyncedAt ? `Dernière mise à jour : ${fmtDateTime(c.lastSyncedAt, me.profile.timezone)}` : "Pas encore synchronisé"}
                            {c.webhook ? " · changements reçus en direct" : " · mise à jour régulière"}
                          </p>
                        )}
                        {c.lastError && (
                          <p className="text-xs text-danger wrap-anywhere">{admin ? c.lastError : "La dernière mise à jour a échoué. Si cela se répète, reconnectez le compte."}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {!active && available && (
                            <Button size="sm" loading={busy === `connect-${p}`} disabled={Boolean(busy)} onClick={() => connect(p)}>
                              Reconnecter
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" loading={busy === `disconnect-${c.id}`} disabled={Boolean(busy)} onClick={() => disconnect(c.id)}>
                            Déconnecter
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {available ? (
                    <div className="flex flex-wrap gap-2">
                      {conns.length === 0 && (
                        <Button loading={busy === `connect-${p}`} disabled={Boolean(busy)} onClick={() => connect(p)}>
                          Connecter {LABEL[p]}
                        </Button>
                      )}
                      {p !== "zoom" && conns.some((c) => c.status === "active") && (
                        <Button variant="outline" onClick={sync} loading={busy === "sync"} disabled={Boolean(busy)}>
                          <RefreshCw className="h-4 w-4" aria-hidden /> Synchroniser maintenant
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted wrap-anywhere">
                      {admin && data.providers[p].reason ? `Administrateur : ${data.providers[p].reason}` : "Un administrateur doit d'abord l'activer."}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardHeader>
              <CardTitle>Fichier d&apos;agenda (.ics)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-pretty text-muted">Pour Apple Calendrier ou tout autre agenda : exportez vos rencontres, ou importez un fichier reçu.</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/calendar/export" className={buttonVariants({ variant: "outline" })}>
                  <Download className="h-4 w-4" aria-hidden /> Exporter mon agenda
                </a>
                <Link href="/capture?mode=ics" className={buttonVariants({ variant: "outline" })}>
                  <Upload className="h-4 w-4" aria-hidden /> Importer un fichier .ics
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
