"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/states";
import { fmtRange } from "@/components/app/format";

interface Preview {
  status: "pending" | "accepted" | "declined" | "tentative" | "cancelled" | "expired";
  organization: string | null;
  invitedBy: string | null;
  emailHint: string;
  event: { title: string; start: string; end: string; timezone: string; cancelled: boolean } | null;
}

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const here = `/invitation/${token}`;

  useEffect(() => {
    apiFetch<Preview>(`/api/invitations/token/${token}`, { noAuthRedirect: true })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Invitation introuvable."));
    apiFetch("/api/me", { noAuthRedirect: true })
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, [token]);

  async function respond(response: "accepted" | "declined" | "tentative") {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ eventId: string | null }>(`/api/invitations/token/${token}`, { method: "POST", json: { response }, noAuthRedirect: true });
      if (response === "declined") setDone("Réponse enregistrée. Merci !");
      else window.location.href = r.eventId ? `/evenements/${r.eventId}` : "/";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Réponse impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <Alert tone="danger" title="Invitation indisponible">{error}</Alert>;
  if (!data || loggedIn === null) return <Loading />;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h1 className="text-lg font-semibold">Vous êtes invité·e</h1>
        <p className="text-sm text-muted">
          {data.invitedBy ?? "Quelqu'un"} vous invite {data.event ? "à un événement de" : "à rejoindre"} <strong>{data.organization}</strong> (invitation envoyée à {data.emailHint}).
        </p>
        {data.event ? (
          <div className="rounded-xl bg-subtle p-3">
            <p className="flex items-center gap-2 font-medium">
              <CalendarDays className="h-4 w-4 text-accent" aria-hidden /> {data.event.title}
            </p>
            <p className="text-sm text-muted first-letter:uppercase">{fmtRange(data.event.start, data.event.end, data.event.timezone)}</p>
            {data.event.cancelled && <p className="mt-1 text-sm text-danger">Cet événement a été annulé.</p>}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-subtle p-3 text-sm">
            <Users className="h-4 w-4 text-accent" aria-hidden /> Accès aux groupes et au calendrier de l&apos;organisation.
          </p>
        )}

        {done ? (
          <Alert tone="success">{done}</Alert>
        ) : data.status !== "pending" ? (
          <Alert tone="warning">{data.status === "expired" ? "Cette invitation a expiré. Demandez-en une nouvelle." : data.status === "cancelled" ? "Cette invitation a été annulée." : "Cette invitation a déjà été utilisée."}</Alert>
        ) : !loggedIn ? (
          <div className="space-y-2">
            <Link href={`/inscription?suite=${encodeURIComponent(here)}`} className={buttonVariants({ size: "lg", className: "w-full" })}>
              Créer mon compte pour répondre
            </Link>
            <Link href={`/connexion?suite=${encodeURIComponent(here)}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
              J&apos;ai déjà un compte
            </Link>
          </div>
        ) : data.event ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="success" loading={busy} onClick={() => respond("accepted")} disabled={data.event.cancelled}>
              Je participe
            </Button>
            <Button variant="outline" onClick={() => respond("tentative")} disabled={busy || data.event.cancelled}>
              Peut-être
            </Button>
            <Button variant="outline" onClick={() => respond("declined")} disabled={busy}>
              Non
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => respond("accepted")}>
              Rejoindre l&apos;organisation
            </Button>
            <Button variant="outline" onClick={() => respond("declined")} disabled={busy}>
              Refuser
            </Button>
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
