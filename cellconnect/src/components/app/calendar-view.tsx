"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import frLocale from "@fullcalendar/core/locales/fr";
import type { DatesSetArg, EventContentArg, EventSourceFuncArg } from "@fullcalendar/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { EventBadges, eventHref, type CalItem } from "./event-list";
import { frTypo } from "./format";

const MOBILE_QUERY = "(max-width: 640px)";
const MOBILE_VIEWS = ["listMonth", "listDay", "timeGridDay", "dayGridMonth"];
const DESKTOP_VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listMonth", "listDay"];
const STORAGE_KEY = "cc:agenda";

type Saved = { view?: string; date?: string };
type Ext = Pick<CalItem, "eventId" | "location" | "meetingUrl" | "hasConflict" | "myStatus" | "status" | "groupName" | "recurring" | "moved" | "occurrenceStart">;

/** Vue et date affichées, mémorisées pour l'onglet (stockage indisponible : on repart de zéro). */
function readSaved(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}
function writeSaved(s: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* navigation privée ou stockage bloqué : sans conséquence */
  }
}

/** Texte lisible sur la couleur d'un groupe (choisie librement) : blanc ou presque noir selon la luminance. */
function readableOn(hex: string | null): string | undefined {
  const m = hex && /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.179 ? "#12110f" : "#ffffff";
}

/** Vue liste : titre lisible et pastilles (conflit, visio, lieu…), qui passent à la ligne à 320 px. */
function ListEventContent({ event }: EventContentArg) {
  const x = event.extendedProps as Ext;
  return (
    <span className="block min-w-0">
      <span className={cn("block font-medium wrap-anywhere", x.status === "cancelled" && "text-muted line-through")}>{frTypo(event.title)}</span>
      {x.groupName && <span className="block text-xs text-muted wrap-anywhere">{x.groupName}</span>}
      <EventBadges item={x} className="mt-1" />
    </span>
  );
}

/**
 * Agenda (FullCalendar). La source d'événements est stable : changer de calendrier affiché
 * (scope) ou demander une nouvelle tentative (refreshKey) relance le chargement sans remonter le composant.
 */
export function CalendarView({ scope, timezone, onError, refreshKey = 0 }: { scope: string; timezone: string; onError: (m: string | null) => void; refreshKey?: number }) {
  const router = useRouter();
  const calendar = useRef<FullCalendar>(null);
  const [loading, setLoading] = useState(true);
  const mobile = useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(MOBILE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(MOBILE_QUERY).matches,
    () => false,
  );

  // Valeurs lues par la source d'événements sans la recréer.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const fetched = useRef({ scope, refreshKey });
  useEffect(() => {
    const prev = fetched.current;
    if (prev.scope === scope && prev.refreshKey === refreshKey) return;
    fetched.current = { scope, refreshKey };
    calendar.current?.getApi().refetchEvents();
  }, [scope, refreshKey]);

  const load = useCallback(async (info: EventSourceFuncArg) => {
    try {
      const q = new URLSearchParams({ from: info.start.toISOString(), to: info.end.toISOString(), scope: fetched.current.scope, includeCancelled: "1" });
      const { items } = await apiFetch<{ items: CalItem[] }>(`/api/events?${q}`);
      onErrorRef.current(null);
      return items.map((e) => {
        const cancelled = e.status === "cancelled";
        const ext: Ext = {
          eventId: e.eventId,
          location: e.location,
          meetingUrl: e.meetingUrl,
          hasConflict: e.hasConflict,
          myStatus: e.myStatus,
          status: e.status,
          groupName: e.groupName,
          recurring: e.recurring,
          moved: e.moved,
          occurrenceStart: e.occurrenceStart,
        };
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          backgroundColor: cancelled ? "transparent" : (e.color ?? undefined),
          borderColor: e.hasConflict && !cancelled ? "var(--warning)" : (e.color ?? undefined),
          // Sans cela, le texte suit --primary-fg (presque noir en mode sombre), illisible sur une couleur de groupe foncée.
          textColor: cancelled ? "var(--muted)" : readableOn(e.color),
          classNames: [e.hasConflict && !cancelled ? "ev-conflict" : "", cancelled ? "line-through" : "", e.myStatus === "invited" ? "opacity-70" : ""].filter(Boolean),
          extendedProps: ext,
        };
      });
    } catch (err) {
      onErrorRef.current((err as Error).message);
      return [];
    }
  }, []);

  // Relu à chaque bascule mobile / bureau (le calendrier est alors remonté).
  const initial = useMemo(() => {
    const saved = readSaved();
    const allowed = mobile ? MOBILE_VIEWS : DESKTOP_VIEWS;
    return {
      view: saved.view && allowed.includes(saved.view) ? saved.view : mobile ? "listMonth" : "timeGridWeek",
      date: saved.date && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) ? saved.date : undefined,
    };
  }, [mobile]);

  const views = useMemo(
    () => ({
      listMonth: { eventContent: ListEventContent },
      listDay: { eventContent: ListEventContent },
      // Mois sur mobile : deux pastilles par jour au plus, « +n » ouvre la liste du jour.
      dayGridMonth: mobile ? { dayMaxEvents: 2, eventDisplay: "list-item", moreLinkClick: "listDay" } : { dayMaxEvents: 3 },
    }),
    [mobile],
  );

  function onDatesSet(info: DatesSetArg) {
    const api = info.view.calendar;
    writeSaved({ view: info.view.type, date: api.formatIso(api.getDate(), true) });
  }

  function onDateClick(info: DateClickArg) {
    // Vue Mois : toucher un jour montre ce jour ; dans les vues horaires, on crée un événement à l'heure touchée.
    if (info.view.type === "dayGridMonth") {
      info.view.calendar.changeView(mobile ? "listDay" : "timeGridDay", info.dateStr.slice(0, 10));
      return;
    }
    router.push(`/evenements/nouveau?date=${info.dateStr.slice(0, 10)}${info.dateStr.length > 10 ? `&heure=${info.dateStr.slice(11, 16)}` : ""}`);
  }

  return (
    <div className="relative" aria-busy={loading}>
      <div aria-hidden className={cn("absolute inset-x-0 -top-2 h-1 rounded-full bg-primary/50", loading ? "animate-pulse" : "invisible")} />
      <FullCalendar
        key={mobile ? "mobile" : "desktop"}
        ref={calendar}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
        locale={frLocale}
        timeZone={timezone}
        initialView={initial.view}
        initialDate={initial.date}
        headerToolbar={mobile ? { left: "", center: "title", right: "prev,today,next" } : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth" }}
        footerToolbar={mobile ? { center: "listMonth,timeGridDay,dayGridMonth" } : false}
        buttonText={{ today: "Aujourd'hui", month: "Mois", week: "Semaine", day: "Jour", list: "Liste" }}
        views={views}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        defaultRangeSeparator=" – "
        height="auto"
        nowIndicator
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        firstDay={1}
        events={load}
        loading={setLoading}
        datesSet={onDatesSet}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          const x = info.event.extendedProps as Ext;
          router.push(eventHref(x, "agenda"));
        }}
        dateClick={onDateClick}
        noEventsText={loading ? "" : "Aucun événement sur cette période"}
      />
    </div>
  );
}
