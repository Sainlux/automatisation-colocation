"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Boîte de dialogue accessible basée sur l'élément natif <dialog> (focus et Échap gérés par showModal).
 * Pour un menu ou un choix sur mobile, préférer <Sheet> (collée en bas d'écran).
 */
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-0 text-fg shadow-lg backdrop:bg-black/50 open:animate-step-in"
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="h-5 w-5" aria-hidden />
        </Button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </dialog>
  );
}
