import Link from "next/link";
import { MapPin, Repeat, TriangleAlert, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { DateTile } from "./date-tile";
import { fmtTimeRange, frTypo } from "./format";

export interface CalItem {
  id: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  status: "confirmed" | "tentative" | "cancelled";
  groupName: string | null;
  color: string | null;
  myStatus: keyof typeof t.participant | null;
  location: string | null;
  meetingUrl: string | null;
  recurring: boolean;
  occurrenceStart: string;
  moved: boolean;
  hasConflict: boolean;
}

/** Page d'où l'on ouvre une fiche : la fiche affiche le bon lien « retour ». */
export type EventFrom = "accueil" | "agenda" | "conflits" | "import";

/** Lien vers la fiche d'un événement (occurrence d'un événement récurrent comprise). */
export function eventHref(item: Pick<CalItem, "eventId" | "recurring" | "occurrenceStart">, from?: EventFrom) {
  const q = new URLSearchParams();
  if (item.recurring) q.set("occurrence", item.occurrenceStart);
  if (from) q.set("from", from);
  const s = q.toString();
  return `/evenements/${item.eventId}${s ? `?${s}` : ""}`;
}

export type EventBadgeItem = Pick<CalItem, "hasConflict" | "status" | "myStatus" | "meetingUrl" | "location"> & Partial<Pick<CalItem, "recurring" | "moved">>;

/**
 * Pastilles d'un événement (liste de l'accueil, vue liste de l'agenda).
 * « Conflit » en orange : une décision à prendre, pas une erreur. Rien n'est rendu s'il n'y a rien à signaler.
 */
export function EventBadges({ item, className }: { item: EventBadgeItem; className?: string }) {
  const cancelled = item.status === "cancelled";
  const badges = [
    item.hasConflict && !cancelled && (
      <Badge key="conflict" tone="warning">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> Conflit
      </Badge>
    ),
    cancelled && (
      <Badge key="cancelled" tone="danger">
        {t.eventStatus.cancelled}
      </Badge>
    ),
    item.myStatus === "invited" && !cancelled && (
      <Badge key="invited" tone="warm">
        Réponse attendue
      </Badge>
    ),
    item.meetingUrl && (
      <Badge key="visio" tone="primary">
        <Video className="h-3.5 w-3.5 shrink-0" aria-hidden /> Visio
      </Badge>
    ),
    item.location && (
      // Largeur bornée en rem : une adresse ou une URL longue ne peut pas élargir une ligne de tableau (vue liste à 320 px).
      <Badge key="location" className="max-w-[8rem] sm:max-w-[14rem]" title={item.location}>
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{item.location}</span>
      </Badge>
    ),
    item.recurring && (
      <Badge key="recurring">
        <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden /> {item.moved ? "Date déplacée" : "Se répète"}
      </Badge>
    ),
  ].filter(Boolean);
  if (!badges.length) return null;
  return <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>{badges}</div>;
}

/** Liste d'événements avec la tuile date. `from` est ajouté aux liens pour le retour depuis la fiche. */
export function EventList({ items, tz, from }: { items: CalItem[]; tz: string; from?: EventFrom }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => {
        const cancelled = e.status === "cancelled";
        return (
          <li key={e.id}>
            <Link href={eventHref(e, from)} className="flex min-h-11 gap-3 py-3 hover:bg-subtle/50 sm:rounded-xl sm:px-2">
              <DateTile date={e.start} tz={tz} size="sm" tone={e.hasConflict && !cancelled ? "warning" : "default"} />
              <div className="min-w-0 flex-1 border-l-4 pl-3" style={{ borderColor: e.color ?? "var(--primary)" }}>
                <p className={cn("line-clamp-2 font-medium wrap-anywhere", cancelled && "text-muted line-through")}>{frTypo(e.title)}</p>
                <p className="text-sm text-muted">
                  <span className="tabular-nums">{fmtTimeRange(e.start, e.end, tz)}</span>
                  {e.groupName && <> · {e.groupName}</>}
                </p>
                <EventBadges item={e} className="mt-1" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
