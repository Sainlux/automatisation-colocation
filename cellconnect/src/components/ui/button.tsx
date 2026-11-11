import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton. Cible tactile ≥ 44 px sur mobile (min-h-11), 40 px à partir de sm.
 * Désactivé : couleurs dédiées (disabled-bg / disabled-fg) plutôt qu'une opacité,
 * pour rester lisible. Préférer un bouton actif qui mène à la prochaine chose à faire.
 */
export const buttonVariants = cva(
  "inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-xl text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none sm:min-h-10",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover disabled:bg-disabled-bg disabled:text-disabled-fg disabled:shadow-none",
        secondary: "bg-subtle text-fg hover:bg-border disabled:bg-disabled-bg disabled:text-disabled-fg",
        outline: "border border-input-border bg-card text-fg hover:bg-subtle disabled:border-border disabled:text-disabled-fg",
        ghost: "text-fg hover:bg-subtle disabled:text-disabled-fg",
        danger: "bg-danger text-danger-fg hover:bg-danger/90 disabled:bg-disabled-bg disabled:text-disabled-fg",
        success: "bg-success text-success-fg hover:bg-success/90 disabled:bg-disabled-bg disabled:text-disabled-fg",
      },
      size: {
        sm: "h-10 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10 min-w-11 sm:min-w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Bouton bascule : pose aria-pressed et affiche l'état sélectionné quand true. */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, pressed, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(buttonVariants({ variant, size }), pressed && "border border-primary bg-info-bg text-fg shadow-none hover:bg-info-bg", className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-pressed={pressed}
    {...props}
  >
    {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";
