import { ChevronDown } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Détail à la demande, basé sur <details>/<summary> natifs (clavier et lecteurs d'écran inclus).
 * Non contrôlé avec defaultOpen ; contrôlé avec open + onToggle.
 *
 * Exemple :
 *   <Disclosure summary="2 messages à lire" tone="warning">
 *     <ul>…</ul>
 *   </Disclosure>
 */
const tones = {
  default: "border-border bg-card",
  info: "border-accent/30 bg-info-bg",
  warning: "border-warning/30 bg-warning-bg",
  danger: "border-danger/30 bg-danger-bg",
};

export function Disclosure({
  summary,
  children,
  defaultOpen,
  open,
  onToggle,
  tone = "default",
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <details
      open={open ?? defaultOpen}
      onToggle={onToggle && ((e: SyntheticEvent<HTMLDetailsElement>) => onToggle(e.currentTarget.open))}
      className={cn("group/disclosure rounded-xl border", tones[tone], className)}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-muted transition-transform duration-(--dur-fast) ease-out group-open/disclosure:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-3 pb-3 text-sm">{children}</div>
    </details>
  );
}
