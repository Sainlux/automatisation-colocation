import { cn } from "@/lib/utils";
import { dateTileParts } from "./format";

/**
 * Tuile date, signature graphique de CellConnect : jour abrégé, gros numéro, mois.
 * - tone="warm"    : date importée / qui va être ajoutée.
 * - tone="warning" : date qui chevauche l'agenda.
 * `date` : AAAA-MM-JJ (lue dans le fuseau) ou date-heure ISO (UTC, convertie dans `tz`).
 * La date complète est lue par les lecteurs d'écran ; les morceaux visuels sont masqués.
 *
 * Exemple : <DateTile date="2026-11-16" tone="warm" />
 */
const tones = {
  default: { box: "border-border bg-subtle", small: "text-muted" },
  warm: { box: "border-warm/30 bg-warm-bg", small: "text-warm-text" },
  warning: { box: "border-warning/40 bg-warning-bg", small: "text-warning" },
};

export function DateTile({ date, tz, size = "md", tone = "default", className }: { date: string; tz?: string; size?: "sm" | "md"; tone?: keyof typeof tones; className?: string }) {
  const p = dateTileParts(date, tz);
  const t = tones[tone];
  const sm = size === "sm";
  return (
    <time
      dateTime={p.isoDate}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none tabular-nums",
        sm ? "w-12 py-1.5" : "w-14 py-2",
        t.box,
        className,
      )}
    >
      <span className="sr-only">{p.full}</span>
      <span aria-hidden className={cn("text-xs leading-4 font-semibold uppercase", t.small)}>
        {p.weekday}
      </span>
      <span aria-hidden className={cn("font-bold tracking-tight text-fg", sm ? "text-xl leading-6" : "text-2xl leading-7")}>
        {p.day}
      </span>
      <span aria-hidden className={cn("text-xs leading-4 uppercase", t.small)}>
        {p.month}
      </span>
    </time>
  );
}
