"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import frLocale from "@fullcalendar/core/locales/fr";
import type { EventSourceFuncArg } from "@fullcalendar/core";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/client/api";
import type { CalItem } from "./event-list";

export function CalendarView({ scope, timezone, onError }: { scope: string; timezone: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const mobile = useSyncExternalStore(
    (cb) => {
      const mq = matchMedia("(max-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia("(max-width: 640px)").matches,
    () => false,
  );

  async function load(info: EventSourceFuncArg) {
    try {
      const q = new URLSearchParams({ from: info.start.toISOString(), to: info.end.toISOString(), scope, includeCancelled: "1" });
      const { items } = await apiFetch<{ items: CalItem[] }>(`/api/events?${q}`);
      onError(null);
      return items.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: e.status === "cancelled" ? "transparent" : (e.color ?? undefined),
        borderColor: e.hasConflict ? "var(--danger)" : (e.color ?? undefined),
        textColor: e.status === "cancelled" ? "var(--muted)" : undefined,
        classNames: [e.hasConflict ? "ev-conflict" : "", e.status === "cancelled" ? "line-through" : "", e.myStatus === "invited" ? "opacity-70" : ""],
        extendedProps: { eventId: e.eventId, occurrenceStart: e.recurring ? e.occurrenceStart : null },
      }));
    } catch (err) {
      onError((err as Error).message);
      return [];
    }
  }

  return (
    <FullCalendar
      key={`${scope}-${mobile}`}
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
      locale={frLocale}
      timeZone={timezone}
      initialView={mobile ? "listMonth" : "timeGridWeek"}
      headerToolbar={mobile ? { left: "prev,next today", center: "title", right: "listMonth,timeGridDay,dayGridMonth" } : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth" }}
      buttonText={{ today: "Aujourd'hui", month: "Mois", week: "Semaine", day: "Jour", list: "Liste" }}
      height="auto"
      nowIndicator
      slotMinTime="06:00:00"
      slotMaxTime="24:00:00"
      firstDay={1}
      events={load}
      eventClick={(info) => {
        info.jsEvent.preventDefault();
        const occ = info.event.extendedProps.occurrenceStart as string | null;
        router.push(`/evenements/${info.event.extendedProps.eventId}${occ ? `?occurrence=${encodeURIComponent(occ)}` : ""}`);
      }}
      dateClick={(info) => router.push(`/evenements/nouveau?date=${info.dateStr.slice(0, 10)}${info.dateStr.length > 10 ? `&heure=${info.dateStr.slice(11, 16)}` : ""}`)}
      noEventsText="Aucun événement sur cette période"
    />
  );
}
