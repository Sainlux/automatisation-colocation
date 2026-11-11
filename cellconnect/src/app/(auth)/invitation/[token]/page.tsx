"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ErrorState, ListSkeleton } from "@/components/ui/states";
import { DateTile } from "@/components/app/date-tile";
import { fmtDay, fmtTimeRange } from "@/components/app/format";

interface Preview {
  status: "pending" | "accepted" | "declined" | "tentative" | "cancelled" | "expired";
  organization: string | null;
  invitedBy: string | null;
  emailHint: string;
  event: { title: string; start: string; end: string; timezone: string; cancelled: boolean } | null;
}

const CLOSED: Record<Exclude<Preview["status"], "pending">, string> = {
  expired: "Cette invitation a expiré. Demandez-en une nouvelle à la personne qui vous l'a envoyée.",
  cancelled: "Cette invitation a été annulée.",
  accepted: "Vous avez déjà répondu à cette invitation.",
  declined: "Vous avez déjà répondu à cette invitation.",
  tentative: "Vous avez déjà répondu à cette invitation.",
};

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const here = `/invitation/${token}`;

  useEffect(() => {
    apiFetch<Preview>(`/api/invitations/token/${token}`, { noAuthRedirect: true })
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e : new ApiError(0, "network", "Connexion impossible.")));
    apiFetch("/api/me", { noAuthRedirect: true })
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, [token, attempt]);

  async function respond(response: "accepted" | "declined" | "tentative") {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ eventId: string | null }>(`/api/invitations/token/${token}`, { method: "POST", json: { response }, noAuthRedirect: true });
      if (response === "declined") setDone("Réponse enregistrée. Merci de l'avoir signalé !");
      else window.location.href = r.eventId ? `/evenements/${r.eventId}` : "/";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Réponse impossible. Vérifiez votre connexion internet, puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !data) {
    return (
      <ErrorState
        status={loadError.status}
        message={loadError.status === 404 ? "Ce lien d'invitation n'existe pas ou n'est plus valable." : loadError.message}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (!data || loggedIn === null) return <ListSkeleton rows={1} />;

  const ev = data.event;
  const org = data.organization ?? "une église";

  return (
    <Card>
      <CardContent className="space-y-4 pt-5 sm:pt-6">
        <div>
          <h1 className="text-2xl leading-tight font-bold tracking-tight">Vous êtes invité·e</h1>
          <p className="mt-1 text-sm text-pretty text-muted">
            {data.invitedBy ?? "Un responsable"} vous invite {ev ? "à une rencontre de" : "à rejoindre"} <strong className="text-fg">{org}</strong>.
          </p>
        </div>

        {ev ? (
          <div className="flex items-center gap-3 rounded-xl bg-subtle p-3">
            <DateTile date={ev.start} tz={ev.timezone} tone={ev.cancelled ? "default" : "warm"} />
            <div className="min-w-0">
              <p className="font-medium wrap-anywhere">{ev.title}</p>
              <p className="text-sm text-muted tabular-nums first-letter:uppercase">
                {fmtDay(ev.start, ev.timezone)} · {fmtTimeRange(ev.start, ev.end, ev.timezone)}
              </p>
              {ev.cancelled && <p className="mt-1 text-sm font-medium text-danger">Cette rencontre a été annulée.</p>}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-subtle p-3 text-sm">
            <Users className="h-5 w-5 shrink-0 text-accent" aria-hidden /> Vous verrez les groupes et l&apos;agenda de {org}.
          </p>
        )}
        <p className="text-xs text-muted">
          Invitation envoyée à <span className="wrap-anywhere">{data.emailHint}</span>.
        </p>

        {done ? (
          <Alert tone="success" live>
            {done}
          </Alert>
        ) : data.status !== "pending" ? (
          <Alert tone={data.status === "expired" || data.status === "cancelled" ? "warning" : "info"}>{CLOSED[data.status]}</Alert>
        ) : !loggedIn ? (
          <div className="space-y-2">
            <Link href={`/inscription?suite=${encodeURIComponent(here)}`} className={buttonVariants({ size: "lg", className: "w-full" })}>
              Créer mon compte pour répondre
            </Link>
            <Link href={`/connexion?suite=${encodeURIComponent(here)}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
              J&apos;ai déjà un compte
            </Link>
          </div>
        ) : ev ? (
          ev.cancelled ? (
            <Link href="/" className={buttonVariants({ variant: "outline", className: "w-full" })}>
              Aller à l&apos;accueil
            </Link>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="success" size="lg" className="sm:col-span-3" loading={busy} onClick={() => respond("accepted")}>
                Je participe
              </Button>
              <Button variant="outline" className="sm:col-span-2" onClick={() => respond("tentative")} disabled={busy}>
                Peut-être
              </Button>
              <Button variant="ghost" onClick={() => respond("declined")} disabled={busy}>
                Je ne viens pas
              </Button>
            </div>
          )
        ) : (
          <div className="grid gap-2">
            <Button size="lg" loading={busy} onClick={() => respond("accepted")}>
              Rejoindre {data.organization ?? "l'église"}
            </Button>
            <Button variant="ghost" onClick={() => respond("declined")} disabled={busy}>
              Non merci
            </Button>
          </div>
        )}
        {error && (
          <Alert tone="danger" live>
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
