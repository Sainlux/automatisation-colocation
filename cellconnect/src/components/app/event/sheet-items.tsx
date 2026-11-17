"use client";

import { useState, type ReactNode } from "react";
import { Video, type LucideIcon } from "lucide-react";
import { apiFetch, errorText } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { Done } from "./types";

export const sheetItemClass = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base hover:bg-subtle disabled:text-disabled-fg";

/** Ligne de la feuille « Plus d'actions ». */
export function SheetItem({ icon: Icon, children, onClick, danger, loading }: { icon: LucideIcon; children: ReactNode; onClick: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} aria-busy={loading || undefined} className={cn(sheetItemClass, danger && "font-medium text-danger hover:bg-danger-bg")}>
      <Icon className={cn("h-5 w-5 shrink-0", danger ? "text-danger" : "text-muted", loading && "animate-pulse")} aria-hidden /> {children}
    </button>
  );
}

/** Création d'une visio (Zoom / Google Meet), proposée dans la feuille « Plus d'actions ». */
export function MeetingItems({ eventId, zoom, google, onDone }: { eventId: string; zoom: boolean; google: boolean; onDone: Done }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!zoom && !google) return null;
  async function create(provider: "zoom" | "google_meet") {
    setBusy(provider);
    try {
      await apiFetch(`/api/events/${eventId}/meeting`, { method: "POST", json: { provider } });
      onDone({ tone: "success", text: "Réunion en ligne créée. Les participants ont reçu le lien." });
    } catch (err) {
      onDone({ tone: "danger", text: errorText(err, "Création de la réunion impossible pour le moment. Réessayez dans un instant.") });
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      {zoom && (
        <li>
          <SheetItem icon={Video} loading={busy === "zoom"} onClick={() => create("zoom")}>
            Créer une réunion Zoom
          </SheetItem>
        </li>
      )}
      {google && (
        <li>
          <SheetItem icon={Video} loading={busy === "google_meet"} onClick={() => create("google_meet")}>
            Créer un Google Meet
          </SheetItem>
        </li>
      )}
    </>
  );
}
