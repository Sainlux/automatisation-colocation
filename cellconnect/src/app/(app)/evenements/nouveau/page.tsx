"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { DateTime } from "luxon";
import { apiFetch, ApiError, newIdempotencyKey } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/states";
import { EventForm, toPayload, type EventFormValues } from "@/components/app/event-form";
import { t } from "@/i18n";

export default function NewEventPage() {
  return (
    <Suspense>
      <NewEvent />
    </Suspense>
  );
}

function NewEvent() {
  const { me, refreshCounters } = useMe();
  const router = useRouter();
  const p = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const tz = me.profile.timezone;
  const start = /^\d{2}:\d{2}$/.test(p.get("heure") ?? "") ? p.get("heure")! : "19:30";
  const [h, m] = start.split(":").map(Number);
  const initial: EventFormValues = {
    title: "",
    // « Aujourd'hui » dans le fuseau de l'utilisateur (et non en UTC).
    date: /^\d{4}-\d{2}-\d{2}$/.test(p.get("date") ?? "") ? p.get("date")! : (DateTime.now().setZone(tz).toISODate() ?? ""),
    startTime: start,
    endTime: `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    timezone: tz,
    location: "",
    meetingUrl: "",
    description: "",
    groupId: "",
    recurrenceRule: "",
    inviteGroup: false,
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Nouvel événement" description="Votre agenda est vérifié dès l'enregistrement : un chevauchement vous sera signalé." back={{ href: "/calendrier", label: t.nav.calendar }} />
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <EventForm
            initial={initial}
            allowInviteGroup
            submitLabel="Enregistrer"
            error={error}
            onSubmit={async (v) => {
              setError(null);
              try {
                const r = await apiFetch<{ event: { id: string } }>("/api/events", { method: "POST", json: toPayload(v), idempotencyKey: key.current });
                refreshCounters();
                router.push(`/evenements/${r.event.id}`);
              } catch (e) {
                setError(e instanceof ApiError ? [e.message, ...((e.details as { message: string }[] | null) ?? []).map((d) => d.message)].join(" ") : "Enregistrement impossible.");
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
