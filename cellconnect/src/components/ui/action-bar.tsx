import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Barre d'action unique, fine, collée en bas à portée du pouce.
 * - Mobile : pleine largeur, posée au-dessus de la barre d'onglets (--bottom-nav-h)
 *   ou de la zone de sécurité de l'iPhone quand il n'y a pas d'onglets.
 * - À partir de lg : carte flottante arrondie.
 * Le statut (à gauche) est annoncé poliment aux lecteurs d'écran.
 * Comme elle est sticky, elle reste dans le flux : en fin de page, elle ne masque rien.
 *
 * Exemple :
 *   <ActionBar status="3 dates sur 5 vérifiées">
 *     <Button onClick={next}>Vérifier mon agenda</Button>
 *   </ActionBar>
 */
export function ActionBar({ status, children, className }: { status?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(max(var(--bottom-nav-h),env(safe-area-inset-bottom))+0.5rem)] z-30 mt-4 flex min-h-14 items-center gap-3 border-t border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur",
        "lg:bottom-4 lg:rounded-2xl lg:border lg:px-4",
        className,
      )}
    >
      {/* Toujours rendue : une région live insérée en même temps que son texte n'est pas annoncée. */}
      <div aria-live="polite" className="min-w-0 flex-1 text-xs text-muted">
        {status}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Réserve, sous le dernier contenu, la hauteur de la barre d'action sur mobile
 * (à utiliser quand l'ActionBar n'est pas le dernier élément du flux, ex. rendue dans un portail).
 */
export function ActionBarSpacer() {
  return <div aria-hidden className="h-20 lg:hidden" />;
}
