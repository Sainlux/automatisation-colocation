"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Choix exclusif présenté en cartes (vrais boutons radio, flèches du clavier incluses).
 * tone="danger" pour un choix qui retire ou supprime quelque chose.
 *
 * Exemple :
 *   <ChoiceGroup legend="Que voulez-vous faire ?" name={`c-${id}`} value={choice} onChange={setChoice}>
 *     <ChoiceCard value="keep_both" title="Garder les deux pour l'instant" hint="Vous déciderez plus tard." />
 *     <ChoiceCard value="withdraw" title="Me retirer de « Culte »" tone="danger" />
 *   </ChoiceGroup>
 */
const Ctx = createContext<{ name: string; value: string | null; onChange: (v: string) => void } | null>(null);

export function ChoiceGroup({
  legend,
  name,
  value,
  onChange,
  children,
  className,
}: {
  legend: ReactNode;
  name: string;
  value: string | null;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2">
        <Ctx.Provider value={{ name, value, onChange }}>{children}</Ctx.Provider>
      </div>
    </fieldset>
  );
}

export function ChoiceCard({
  value,
  title,
  hint,
  tone = "primary",
  children,
  disabled,
}: {
  value: string;
  title: ReactNode;
  hint?: ReactNode;
  tone?: "primary" | "danger";
  children?: ReactNode;
  disabled?: boolean;
}) {
  const group = useContext(Ctx);
  const hintId = useId();
  if (!group) throw new Error("ChoiceCard doit être placé dans un ChoiceGroup.");
  const checked = group.value === value;
  const danger = tone === "danger";
  return (
    <label className={cn("block", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <input
        type="radio"
        className="peer sr-only"
        name={group.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => group.onChange(value)}
        aria-describedby={hint ? hintId : undefined}
      />
      <span
        className={cn(
          "flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm transition-colors duration-(--dur-fast) ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
          checked ? (danger ? "border-danger bg-danger-bg" : "border-primary bg-info-bg") : "border-input-border bg-card hover:bg-subtle",
          disabled && "border-border bg-disabled-bg text-disabled-fg hover:bg-disabled-bg",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            checked ? (danger ? "border-danger" : "border-primary") : "border-input-border",
          )}
        >
          {checked && <span className={cn("h-2.5 w-2.5 animate-pop-in rounded-full", danger ? "bg-danger" : "bg-primary")} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {hint && (
            <span id={hintId} className="mt-0.5 block text-xs text-muted">
              {hint}
            </span>
          )}
          {children && <span className="mt-2 block">{children}</span>}
        </span>
      </span>
    </label>
  );
}
