"use client";

import { forwardRef, useState } from "react";
import { DateTime } from "luxon";
import { CalendarClock, CalendarX, Undo2 } from "lucide-react";
import { apiFetch, errorText } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { fmtShortDate, plural } from "@/components/app/format";
import { t } from "@/i18n";
import { RestoreDialog } from "./dialogs";
import type { OccurrenceInfo } from "./logic";
import type { Done } from "./types";

export type OccurrenceMode = null | "move" | "cancel";

/**
 * Actions sur UNE date d'une série (déplacer, annuler, rétablir).
 * - date annulée : seul « Rétablir cette date » reste proposé ;
 * - date déplacée : « Rétablir l'horaire d'origine » en plus ;
 * - rétablir passe toujours par une confirmation.
 * Le parent remonte le composant (key) quand l'état de la date change.
 */
export const OccurrencePanel = forwardRef<
  HTMLDivElement,
  { eventId: string; occurrence: OccurrenceInfo; timezone: string; mode: OccurrenceMode; onModeChange: (m: OccurrenceMode) => void; onDone: Done }
>(function OccurrencePanel({ eventId, occurrence, timezone, mode, onModeChange, onDone }, ref) {
  const start = DateTime.fromISO(occurrence.start, { zone: "utc" }).setZone(timezone);
  const end = DateTime.fromISO(occurrence.end, { zone: "utc" }).setZone(timezone);
  const [date, setDate] = useState(start.toISODate() ?? "");
  const [startTime, setStartTime] = useState(start.toFormat("HH:mm"));
  const [endTime, setEndTime] = useState(end.toFormat("HH:mm"));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const cancelled = occurrence.status === "cancelled";
  const moved = occurrence.status === "moved";

  async function send(action: "cancel" | "move" | "restore") {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ notified: number }>(`/api/events/${eventId}/occurrences`, {
        method: "POST",
        json: {
          occurrenceStart: occurrence.originalStart,
          action,
          ...(action === "move" ? { date, startTime, endTime } : {}),
          message: message.trim() || null,
        },
      });
      const what = action === "cancel" ? "Date annulée" : action === "move" ? "Date déplacée" : "Date rétablie";
      setRestoring(false);
      onModeChange(null);
      onDone({
        tone: "success",
        text: `${what}. Les autres dates sont inchangées.${r.notified ? ` ${plural(r.notified, "participant prévenu", "participants prévenus")}.` : ""}`,
      });
    } catch (e) {
      setErr(errorText(e, "Action impossible pour le moment. Vérifiez votre connexion internet, puis réessayez."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>
            {t.words.thisDateOnly} : <span className="tabular-nums">{fmtShortDate(occurrence.originalStart, timezone)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cancelled ? (
            <>
              <p className="text-sm text-muted">Les autres dates de la série sont maintenues.</p>
              <Button variant="outline" onClick={() => setRestoring(true)}>
                <Undo2 className="h-4 w-4" aria-hidden /> {t.words.restoreDate}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" pressed={mode === "move"} onClick={() => onModeChange(mode === "move" ? null : "move")}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Déplacer cette date
              </Button>
              <Button size="sm" variant="outline" pressed={mode === "cancel"} onClick={() => onModeChange(mode === "cancel" ? null : "cancel")}>
                <CalendarX className="h-4 w-4" aria-hidden /> Annuler cette date
              </Button>
              {moved && (
                <Button size="sm" variant="ghost" onClick={() => setRestoring(true)}>
                  <Undo2 className="h-4 w-4" aria-hidden /> {t.words.restoreSchedule}
                </Button>
              )}
            </div>
          )}
          {!cancelled && mode === "move" && (
            <div className="space-y-3">
              <Field label="Nouvelle date" htmlFor="occ-d">
                <Input id="occ-d" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Début" htmlFor="occ-s">
                  <Input id="occ-s" type="time" value={startTime} onChange={(ev) => setStartTime(ev.target.value)} />
                </Field>
                <Field label="Fin" htmlFor="occ-e">
                  <Input id="occ-e" type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} />
                </Field>
              </div>
            </div>
          )}
          {!cancelled && mode && (
            <>
              <Field label="Message aux participants (facultatif)" htmlFor="occ-m">
                <Textarea id="occ-m" rows={2} value={message} onChange={(ev) => setMessage(ev.target.value)} />
              </Field>
              <Button variant={mode === "cancel" ? "danger" : "primary"} loading={busy} onClick={() => send(mode)}>
                {mode === "cancel" ? "Confirmer l'annulation de cette date" : "Confirmer le déplacement"}
              </Button>
            </>
          )}
          {err && !restoring && (
            <Alert tone="danger" live>
              {err}
            </Alert>
          )}
        </CardContent>
      </Card>
      <RestoreDialog
        open={restoring}
        onClose={() => {
          setRestoring(false);
          setErr(null);
        }}
        onConfirm={() => send("restore")}
        busy={busy}
        error={restoring ? err : null}
      />
    </div>
  );
});
