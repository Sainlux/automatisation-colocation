import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progression d'un parcours en quelques étapes.
 * - Mobile : « Étape n sur N · libellé » et une barre segmentée.
 * - À partir de sm : pastilles numérotées (passées = coche verte, courante = encre avec anneau).
 * `current` : identifiant de l'étape courante (ou son index).
 *
 * Exemple : <Stepper steps={[{ id: "verify", label: "Vérifier" }, { id: "conflicts", label: "Conflits" }, { id: "save", label: "Enregistrer" }]} current="conflicts" />
 */
export function Stepper({ steps, current, className }: { steps: { id: string; label: string }[]; current: string | number; className?: string }) {
  const found = typeof current === "number" ? current : steps.findIndex((s) => s.id === current);
  const idx = Math.max(0, Math.min(found, steps.length - 1));
  const cur = steps[idx];
  return (
    <nav aria-label="Étapes" className={className}>
      <div className="sm:hidden">
        <p className="text-sm text-muted">
          Étape {idx + 1} sur {steps.length} · <span className="font-semibold text-fg">{cur?.label}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", i < idx ? "bg-success" : i === idx ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <li key={s.id} aria-current={state === "current" ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  state === "done" && "bg-success text-success-fg",
                  state === "current" && "bg-primary text-primary-fg ring-4 ring-primary/20",
                  state === "todo" && "border border-input-border bg-card text-muted",
                )}
              >
                {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("truncate text-sm", state === "current" ? "font-semibold text-fg" : "text-muted")}>
                {s.label}
                <span className="sr-only">{state === "done" ? " (terminée)" : state === "current" ? " (en cours)" : " (à venir)"}</span>
              </span>
              {i < steps.length - 1 && <span aria-hidden className={cn("h-px min-w-4 flex-1", i < idx ? "bg-success" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
