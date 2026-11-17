"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChoiceCard, ChoiceGroup } from "@/components/ui/choice";
import { Field, Switch, Textarea } from "@/components/ui/form";
import { DateTile } from "@/components/app/date-tile";
import { OverlapBar } from "@/components/app/overlap-bar";
import { fmtFullDate, frTypo } from "@/components/app/format";
import { defaultWithdrawMessage, draftSpan, isValidDate, timeLabel, type Choice, type Draft, type DraftConflict } from "./draft-utils";

/**
 * Un chevauchement : une décision, pas une erreur. Frise des deux engagements, puis trois choix.
 * Aucun choix n'est présélectionné : sans réponse, les deux sont gardés (comme avant).
 */
export function ConflictCard({
  domId,
  id,
  conflict: c,
  draft,
  other,
  choice,
  onChoose,
  notify,
  onNotify,
  message,
  onMessage,
  tz,
}: {
  domId: string;
  id: string;
  conflict: DraftConflict;
  draft: Draft;
  other: Draft | null;
  choice: Choice | undefined;
  onChoose: (id: string, choice: Choice, conflict: DraftConflict) => void;
  notify: boolean;
  onNotify: (id: string, notify: boolean) => void;
  message: string;
  onMessage: (id: string, message: string) => void;
  tz: string;
}) {
  const headingId = useId();
  const newTitle = frTypo(draft.title);
  const otherTitle = frTypo(c.existing?.title ?? other?.title ?? "l'autre engagement");
  const span = draftSpan(draft);
  const otherSpan = c.existing ? { start: c.existing.start, end: c.existing.end } : other ? draftSpan(other) : null;
  const kindLabel = c.kind === "travel_buffer" ? "Temps de trajet trop court" : `Chevauchement de ${c.overlapMinutes} minutes`;

  return (
    <section id={domId} aria-labelledby={headingId} className="scroll-mt-20 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {isValidDate(draft.date) && <DateTile date={draft.date} tone="warning" />}
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold">
            {kindLabel}
          </h3>
          {isValidDate(draft.date) && (
            <p className="text-sm text-muted first-letter:uppercase">
              {fmtFullDate(draft.date)} · <span className="tabular-nums">{timeLabel(draft)}</span>
            </p>
          )}
        </div>
      </div>

      {span && otherSpan && <OverlapBar a={{ ...span, label: newTitle }} b={{ ...otherSpan, label: otherTitle }} tz={tz} />}

      <ChoiceGroup legend="Que préférez-vous ?" name={`choix-${domId}`} value={choice ?? null} onChange={(v) => onChoose(id, v as Choice, c)}>
        {c.existing && <ChoiceCard value="withdraw_existing" title={`Aller à « ${newTitle} »`} hint={`je me retire de « ${otherTitle} »`} />}
        <ChoiceCard value="skip_new" title={`Garder « ${otherTitle} »`} hint="cette date ne sera pas ajoutée" />
        <ChoiceCard value="keep_both" title="Garder les deux pour l'instant" hint="à régler plus tard dans Conflits" />
      </ChoiceGroup>

      {choice === "withdraw_existing" && c.existing && (
        <div className="animate-step-in space-y-2 rounded-xl bg-subtle p-3 text-sm">
          {c.existing.isOrganizer ? (
            <p>
              Vous organisez « {otherTitle} » : s&apos;il n&apos;a pas d&apos;autre participant, il sera retiré de votre agenda. Sinon, il reste maintenu pour les autres.
            </p>
          ) : (
            <>
              <p>Ce retrait ne concerne que vous : « {otherTitle} » reste maintenu pour les autres participants.</p>
              <Switch label="Prévenir l'organisateur" checked={notify} onChange={(e) => onNotify(id, e.target.checked)} />
              {notify && (
                <WithdrawMessage
                  id={id}
                  message={message}
                  onMessage={onMessage}
                  fallback={defaultWithdrawMessage(c.existing.title, c.existing.start, tz)}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Message envoyé à l'organisateur : affiché en texte, modifiable sur demande. */
function WithdrawMessage({ id, message, onMessage, fallback }: { id: string; message: string; onMessage: (id: string, message: string) => void; fallback: string }) {
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);

  if (editing)
    return (
      <Field label="Message à l'organisateur" htmlFor={fieldId} hint="L'autre engagement n'est jamais mentionné. Laissé vide, un message poli est envoyé.">
        <Textarea ref={fieldRef} id={fieldId} rows={4} value={message} onChange={(e) => onMessage(id, e.target.value)} />
      </Field>
    );

  return (
    <p className="text-muted">
      Message envoyé : « {message.trim() || fallback} »{" "}
      <button
        type="button"
        className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
        onClick={() => {
          if (!message.trim()) onMessage(id, fallback);
          setEditing(true);
        }}
      >
        Personnaliser
      </button>
    </p>
  );
}
