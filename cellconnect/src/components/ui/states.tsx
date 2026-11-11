import { ChevronLeft, LoaderCircle, RotateCw, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { Alert } from "./alert";
import { Button, buttonVariants } from "./button";

export function Loading({ label = t.states.loading }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted" role="status">
      <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

/** Bloc gris de chargement (décoratif). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-subtle motion-reduce:animate-none", className)} />;
}

/**
 * Liste en cours de chargement : garde la forme de la page au lieu d'un écran vide.
 * Exemple : {loading && <ListSkeleton rows={4} />}
 */
export function ListSkeleton({ rows = 3, label = t.states.loading }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <Skeleton className="h-14 w-12 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Les données affichées datent du dernier chargement réussi (la mise à jour a échoué).
 * Exemple : {error && data && <StaleBanner onRetry={reload} />}
 */
export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert
      tone="info"
      size="compact"
      action={
        <Button size="sm" variant="ghost" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden /> {t.states.retry}
        </Button>
      }
    >
      {t.states.stale}
    </Alert>
  );
}

function errorCopy(status: number | undefined, message: string) {
  const s = t.states;
  if (status === 404) return { ...s.notFound, retry: false, detail: null };
  if (status === 403) return { ...s.forbidden, retry: false, detail: null };
  if (status === 0) return { ...s.offline, retry: true, detail: null };
  if (status !== undefined && status >= 500) return { title: s.server.title, body: s.server.body, retry: true, detail: message };
  return { title: s.generic.title, body: message, retry: true, detail: null };
}

/**
 * Erreur de chargement, avec un texte adapté au code HTTP :
 * 404 « Introuvable » (sans Réessayer), 403, 0 = réseau, 5xx (détail technique replié).
 * Exemple : if (error) return <ErrorState status={error.status} message={error.message} onRetry={reload} back={{ href: "/", label: "Accueil" }} />;
 */
export function ErrorState({ message, onRetry, status, back }: { message: string; onRetry?: () => void; status?: number; back?: { href: string; label: string } }) {
  const c = errorCopy(status, message);
  const showRetry = c.retry && onRetry;
  return (
    <Alert tone="danger" title={c.title} live>
      <p className="flex items-start gap-1.5">
        {status === 0 && <WifiOff className="mt-1 h-4 w-4 shrink-0" aria-hidden />}
        <span>{c.body}</span>
      </p>
      {c.detail && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted">{t.states.server.detail}</summary>
          <p className="mt-1 wrap-anywhere">{c.detail}</p>
        </details>
      )}
      {(showRetry || back) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {showRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCw className="h-4 w-4" aria-hidden /> {t.states.retry}
            </Button>
          )}
          {back && (
            <Link href={back.href} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
            </Link>
          )}
        </div>
      )}
    </Alert>
  );
}

/**
 * État vide. variant="plain" : sans cadre, pour une section dans une carte.
 * Exemple : <EmptyState variant="plain" icon={CalendarDays} title="Rien cette semaine" />
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  variant = "default",
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  variant?: "default" | "plain";
}) {
  const plain = variant === "plain";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", plain ? "px-2 py-6" : "rounded-2xl border border-dashed border-input-border px-6 py-10")}>
      {Icon && (
        <div className={cn("rounded-full", !plain && "bg-subtle p-3")}>
          <Icon className="h-6 w-6 text-muted" aria-hidden />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-pretty text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * En-tête de page. back : lien de retour au-dessus du titre (cible de 44 px).
 * Exemple : <PageHeader title="Conflits" back={{ href: "/", label: "Accueil" }} />
 */
export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1 rounded-xl pr-2 text-sm font-medium text-accent hover:underline">
          <ChevronLeft className="h-5 w-5" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-pretty text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
