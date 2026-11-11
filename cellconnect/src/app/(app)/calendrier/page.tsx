"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Download, Plus, RotateCw } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { PageHeader, Skeleton } from "@/components/ui/states";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

function CalendarSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t.states.loading}</span>
      <Skeleton className="mx-auto h-6 w-40" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-11 w-32" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

const CalendarView = dynamic(() => import("@/components/app/calendar-view").then((m) => m.CalendarView), { ssr: false, loading: () => <CalendarSkeleton /> });

/** ?vue= : « me », « org » ou « group:<id> » ; toute autre valeur revient à « me ». */
const parseScope = (v: string | null) => (v === "org" || (v && /^group:[\w-]+$/.test(v)) ? v : "me");

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <Agenda />
    </Suspense>
  );
}

function Agenda() {
  const { me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const vue = params.get("vue");
  const [scope, setScope] = useState(() => parseScope(vue));
  const [error, setError] = useState<string | null>(null);
  // L'URL change sans remonter la page (lien « Agenda » de la navigation, retour arrière) : on suit ?vue=.
  const [seenVue, setSeenVue] = useState(vue);
  if (vue !== seenVue) {
    setSeenVue(vue);
    setScope(parseScope(vue));
    setError(null);
  }
  const [refreshKey, setRefreshKey] = useState(0);
  const groups = useApi<{ groups: { id: string; name: string }[] }>("/api/groups");
  const groupId = scope.startsWith("group:") ? scope.slice(6) : null;
  const group = groupId ? groups.data?.groups.find((g) => g.id === groupId) : undefined;
  const title = group ? `Agenda · ${group.name}` : scope === "org" ? "Agenda de l'église" : t.nav.calendar;

  function changeScope(next: string) {
    setScope(next);
    setError(null);
    const q = new URLSearchParams(params.toString());
    if (next === "me") q.delete("vue");
    else q.set("vue", next);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <div className="flex items-center gap-2">
        <label htmlFor="scope" className="sr-only">
          Agenda affiché
        </label>
        <Select id="scope" className="min-w-0 flex-1 sm:max-w-xs" value={scope} onChange={(e) => changeScope(e.target.value)}>
          <option value="me">Mon agenda</option>
          <option value="org">Toute l&apos;église</option>
          {groupId && !group && <option value={scope}>{groups.data ? "Groupe" : t.states.loading}</option>}
          {groups.data?.groups.map((g) => (
            <option key={g.id} value={`group:${g.id}`}>
              Groupe : {g.name}
            </option>
          ))}
        </Select>
        <Link href="/evenements/nouveau" className={cn(buttonVariants(), "shrink-0")}>
          <Plus className="h-4 w-4" aria-hidden /> Événement
        </Link>
      </div>
      {error && (
        <Alert
          tone="danger"
          title="L'agenda n'a pas pu être chargé"
          live
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                setRefreshKey((k) => k + 1);
              }}
            >
              <RotateCw className="h-4 w-4" aria-hidden /> {t.states.retry}
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <CalendarView scope={scope} timezone={me.profile.timezone} onError={setError} refreshKey={refreshKey} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted">
        Heures affichées dans votre fuseau : {me.profile.timezone}. Les événements en conflit portent la mention «&nbsp;Conflit&nbsp;».
      </p>
      <a href="/api/calendar/export" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline-offset-2 hover:underline">
        <Download className="h-4 w-4" aria-hidden /> Ajouter à Apple/Google Calendar (.ics)
      </a>
    </div>
  );
}
