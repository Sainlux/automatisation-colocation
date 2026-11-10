"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "./button";

/**
 * Feuille : variante « bas d'écran » du <dialog> natif. Sur mobile, collée en bas
 * (85 % de la hauteur au plus, poignée) ; à partir de sm, centrée comme une boîte de dialogue.
 * showModal() gère le piège du focus, Échap et le retour du focus ; un toucher sur le fond ferme.
 *
 * Exemple :
 *   <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Plus">
 *     <nav>…</nav>
 *   </Sheet>
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Toucher le fond (en dehors du contenu) ferme la feuille.
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={onBackdrop}
      aria-labelledby={titleId}
      className="mx-0 mt-auto mb-0 flex max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border border-b-0 border-border bg-card p-0 text-fg shadow-lg backdrop:bg-black/50 not-open:hidden open:animate-step-in sm:m-auto sm:max-w-lg sm:rounded-2xl sm:border-b"
    >
      {/* Conteneur plein : un toucher dans la feuille (même autour de la poignée) ne la ferme pas. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden"
        />
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-1 pb-2 sm:border-b sm:border-border sm:px-5 sm:py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
