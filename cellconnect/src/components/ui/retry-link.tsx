"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * Bouton « Réessayer » qui fonctionne même sans JavaScript : sans script, c'est un lien vers
 * `href` ; avec script, il recharge la page courante (l'adresse que la personne voulait ouvrir).
 */
export function RetryLink({ href = "/", children, className }: { href?: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        window.location.reload();
      }}
      className={cn(buttonVariants({ size: "lg" }), className)}
    >
      {children}
    </a>
  );
}
