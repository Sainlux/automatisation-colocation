import { TriangleAlert } from "lucide-react";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/* text-base sur mobile : iOS ne zoome pas sur un champ ≥ 16 px. */
const field =
  "w-full rounded-xl border border-input-border bg-card px-3 py-2 text-base text-fg placeholder:text-muted focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-danger disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-fg sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-11 sm:h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-24", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-11 sm:h-10", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-fg", className)} {...p} />;
}

type A11yProps = { "aria-invalid"?: boolean | "true" | "false"; "aria-describedby"?: string };

/**
 * Champ libellé. Avec htmlFor, le message (erreur ou aide) reçoit l'id `${htmlFor}-msg`
 * et le contrôle enfant reçoit automatiquement aria-invalid et aria-describedby.
 *
 * Exemple : <Field label="Titre" htmlFor="title" error={errors.title}><Input id="title" … /></Field>
 */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  const msgId = htmlFor ? `${htmlFor}-msg` : undefined;
  const hasMsg = Boolean(error || hint);
  let control = children;
  if (msgId && isValidElement<A11yProps>(children)) {
    const own = children.props["aria-describedby"];
    const describedBy = [own, hasMsg ? msgId : undefined].filter(Boolean).join(" ") || undefined;
    control = cloneElement(children as ReactElement<A11yProps>, {
      "aria-invalid": error ? true : children.props["aria-invalid"],
      "aria-describedby": describedBy,
    });
  }
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {error ? (
        <p id={msgId} className="mt-1 flex items-start gap-1 text-xs text-danger">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Erreur : </span>
            {error}
          </span>
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm", className)}>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--primary)]" {...p} />
      <span>{label}</span>
    </label>
  );
}

/**
 * Interrupteur oui / non (environ 51 × 31 px), pour un réglage appliqué immédiatement.
 *
 * Exemple : <Switch label="Recevoir aussi les e-mails" checked={on} onChange={(e) => setOn(e.target.checked)} />
 */
export function Switch({ label, hint, className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm", p.disabled && "cursor-not-allowed", className)}>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer h-[31px] w-[51px] cursor-[inherit] appearance-none rounded-full bg-input-border transition-colors duration-(--dur-fast) ease-out checked:bg-primary disabled:bg-disabled-bg motion-reduce:transition-none"
          {...p}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0.5 h-[27px] w-[27px] rounded-full bg-card shadow-sm transition-transform duration-(--dur-base) ease-out peer-checked:translate-x-5 motion-reduce:transition-none"
        />
      </span>
    </label>
  );
}
