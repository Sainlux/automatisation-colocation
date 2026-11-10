"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Loading, PageHeader } from "@/components/ui/states";

const CalendarView = dynamic(() => import("@/components/app/calendar-view").then((m) => m.CalendarView), { ssr: false, loading: () => <Loading /> });

export default function CalendarPage() {
  const { me } = useMe();
  const [scope, setScope] = useState("me");
  const [error, setError] = useState<string | null>(null);
  const groups = useApi<{ groups: { id: string; name: string }[] }>("/api/groups");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendrier"
        actions={
          <>
            <a href="/api/calendar/export" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" aria-hidden /> Exporter (.ics)
            </a>
            <Link href="/evenements/nouveau" className={buttonVariants()}>
              <Plus className="h-4 w-4" aria-hidden /> Événement
            </Link>
          </>
        }
      />
      <div className="max-w-xs">
        <label htmlFor="scope" className="sr-only">
          Calendrier affiché
        </label>
        <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="me">Mon agenda</option>
          <option value="org">Calendrier de l&apos;organisation</option>
          {groups.data?.groups.map((g) => (
            <option key={g.id} value={`group:${g.id}`}>
              Groupe : {g.name}
            </option>
          ))}
        </Select>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <CalendarView scope={scope} timezone={me.profile.timezone} onError={setError} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted">Heures affichées dans votre fuseau : {me.profile.timezone}. Les événements en conflit sont signalés par une bordure rouge.</p>
    </div>
  );
}
