"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

/** Demande de confirmation ; `danger` met le bouton de confirmation en rouge (action destructive). */
export type Confirm = { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; run: () => Promise<void> };

/**
 * Boîte de confirmation partagée : « Annuler » ferme, le bouton principal lance `run`
 * (bouton en chargement pendant l'action), puis la boîte se ferme.
 * Exemple : <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
 */
export function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(confirm)}
      onClose={onClose}
      title={confirm?.title ?? ""}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant={confirm?.danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              if (!confirm) return;
              setBusy(true);
              try {
                await confirm.run();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
          >
            {confirm?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm">{confirm?.body}</div>
    </Dialog>
  );
}
