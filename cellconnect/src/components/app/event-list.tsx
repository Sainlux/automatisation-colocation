import Link from "next/link";
import { MapPin, Repeat, TriangleAlert, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import { fmtDayShort, fmtTime } from "./format";

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

export function EventList({ items, tz }: { items: CalItem[]; tz: string }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.id}>
          <Link href={`/evenements/${e.eventId}${e.recurring ? `?occurrence=${encodeURIComponent(e.occurrenceStart)}` : ""}`} className="flex gap-3 py-3 hover:bg-subtle/50 sm:rounded-xl sm:px-2">
            <div className="w-14 shrink-0 text-center">
              <p className="text-xs uppercase text-muted">{fmtDayShort(e.start, tz).split(" ")[0]}</p>
              <p className="text-lg font-semibold leading-tight">{fmtDayShort(e.start, tz).split(" ")[1]}</p>
              <p className="text-xs text-muted">{fmtDayShort(e.start, tz).split(" ")[2]}</p>
            </div>
            <div className="min-w-0 flex-1 border-l-4 pl-3" style={{ borderColor: e.color ?? "var(--primary)" }}>
              <p className="truncate font-medium">{e.title}</p>
              <p className="text-sm text-muted">
                {fmtTime(e.start, tz)} – {fmtTime(e.end, tz)}
                {e.groupName && <> · {e.groupName}</>}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {e.hasConflict && (
                  <Badge tone="danger">
                    <TriangleAlert className="h-3 w-3" aria-hidden /> Conflit
                  </Badge>
                )}
                {e.status === "cancelled" && <Badge tone="danger">Annulé</Badge>}
                {e.myStatus === "invited" && <Badge tone="warning">Réponse attendue</Badge>}
                {e.meetingUrl && (
                  <Badge tone="primary">
                    <Video className="h-3 w-3" aria-hidden /> Visio
                  </Badge>
                )}
                {e.location && (
                  <Badge>
                    <MapPin className="h-3 w-3" aria-hidden /> {e.location.slice(0, 28)}
                  </Badge>
                )}
                {e.recurring && (
                  <Badge>
                    <Repeat className="h-3 w-3" aria-hidden /> {e.moved ? "Date déplacée" : "Récurrent"}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
