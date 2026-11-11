"use client";

import { CircleCheck, Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Affiche « 7/10 caractères » sous le champ (nécessite minLength). */
  showCount?: boolean;
};

/**
 * Mot de passe avec bouton « œil » pour l'afficher (aria-pressed) et compteur de longueur facultatif.
 * Transmet aria-invalid / aria-describedby reçus de <Field> au vrai champ.
 *
 * Exemple :
 *   <Field label="Mot de passe" htmlFor="password" error={errors.password}>
 *     <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} showCount />
 *   </Field>
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(({ className, showCount, minLength, onChange, id, value, defaultValue, ...p }, ref) => {
  const [visible, setVisible] = useState(false);
  const [typed, setTyped] = useState(String(defaultValue ?? "").length);
  const length = value !== undefined ? String(value).length : typed;
  const counted = Boolean(showCount && minLength);
  const countId = counted && id ? `${id}-count` : undefined;
  const describedBy = [p["aria-describedby"], countId].filter(Boolean).join(" ") || undefined;
  const long = minLength !== undefined && length >= minLength;

  return (
    <div>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={minLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            setTyped(e.target.value.length);
            onChange?.(e);
          }}
          className={cn("pr-12", className)}
          {...p}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label="Afficher le mot de passe"
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-xl text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {counted && (
        <p id={countId} className={cn("mt-1 flex items-center gap-1 text-xs tabular-nums", long ? "text-success" : "text-muted")}>
          {long && <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />}
          {long ? "Longueur suffisante" : `${length}/${minLength} caractères`}
        </p>
      )}
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
