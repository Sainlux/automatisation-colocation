"use client";

import { useEffect, useRef, type RefObject } from "react";
import { scrollBehavior } from "@/components/app/motion";

/**
 * Zone d'annonce pour les lecteurs d'écran (VoiceOver sur iPhone).
 * Toujours montée dans la page : un changement de `message` est lu sans déplacer le focus.
 * Les Alert affichées à côté ne portent donc pas `live` (sinon le message serait lu deux fois).
 */
export function LiveRegion({ message, assertive = false }: { message: string | null | undefined; assertive?: boolean }) {
  return (
    <p className="sr-only" role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-atomic="true">
      {message ?? ""}
    </p>
  );
}

/**
 * Fait défiler l'élément dans la vue quand `key` change (et n'est pas vide).
 * Respecte « Réduire les animations » via scrollBehavior().
 */
export function useScrollIntoView<T extends HTMLElement>(key: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!key) return;
    ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }, [key]);
  return ref;
}
