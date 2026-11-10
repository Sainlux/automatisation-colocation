import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Pastille de statut.
 * - tone="warm" : ce qui est nouveau / va être ajouté ; tone="solidDanger" : compteur urgent.
 * - size="count" : compteur rond (ex. <Badge tone="solidDanger" size="count" aria-label="3 en attente">3</Badge>).
 * - variant="dot" : simple point coloré ; le texte enfant n'est lu que par les lecteurs d'écran
 *   (ex. <Badge tone="warm" variant="dot">Nouveau</Badge>).
 */
const badge = cva("inline-flex max-w-full items-center gap-1 truncate rounded-full font-medium", {
  variants: {
    tone: {
      neutral: "bg-subtle text-muted",
      primary: "bg-info-bg text-accent",
      success: "bg-success-bg text-success",
      warning: "bg-warning-bg text-warning",
      danger: "bg-danger-bg text-danger",
      warm: "bg-warm-bg text-warm-text",
      solidDanger: "bg-danger text-danger-fg",
    },
    size: {
      default: "px-2 py-0.5 text-xs",
      count: "h-5 min-w-5 justify-center px-1.5 text-xs font-semibold tabular-nums",
    },
    variant: {
      pill: "",
      dot: "h-2.5 w-2.5 min-w-0 shrink-0 bg-current p-0",
    },
  },
  defaultVariants: { tone: "neutral", size: "default", variant: "pill" },
});

export function Badge({ className, tone, size, variant, children, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return (
    <span className={cn(badge({ tone, size, variant }), className)} {...p}>
      {variant === "dot" ? <span className="sr-only">{children}</span> : children}
    </span>
  );
}
