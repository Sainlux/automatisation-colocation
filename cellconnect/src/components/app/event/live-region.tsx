"use client";

import { useEffect, useRef, type RefObject } from "react";
import { scrollBehavior } from "@/components/app/motion";

/**
 * Fait défiler l'élément dans la vue quand `key` change (et n'est pas vide).
 * Respecte « Réduire les animations » via scrollBehavior().
 * Zone d'annonce pour les lecteurs d'écran : LiveRegion de @/components/ui/alert.
 */
export function useScrollIntoView<T extends HTMLElement>(key: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!key) return;
    ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }, [key]);
  return ref;
}
