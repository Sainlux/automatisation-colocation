import { cn } from "@/lib/utils";

/**
 * Marque CellConnect : trois cercles qui se rejoignent (une petite communauté).
 * Deux cercles à l'encre (currentColor), le troisième en miel (var(--warm)).
 * Décoratif : toujours accompagné d'un texte (Wordmark ou aria-label du lien parent).
 *
 * Exemple : <Link href="/" aria-label="CellConnect, accueil"><LogoMark className="h-7 w-7 text-primary" /><Wordmark /></Link>
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} aria-hidden focusable="false" className={cn("h-6 w-6 shrink-0", className)}>
      <circle cx="8.5" cy="8.75" r="5.5" stroke="currentColor" />
      <circle cx="15.5" cy="8.75" r="5.5" stroke="currentColor" />
      <circle cx="12" cy="15.25" r="5.5" className="stroke-warm" />
    </svg>
  );
}

/** Nom de l'application : « Cell » en semi-gras, « Connect » atténué. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-lg tracking-tight whitespace-nowrap", className)}>
      <span className="font-semibold text-fg">Cell</span>
      <span className="text-muted">Connect</span>
    </span>
  );
}
