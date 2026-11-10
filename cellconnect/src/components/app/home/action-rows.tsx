import Link from "next/link";
import { CalendarX, ChevronRight, CircleCheck, ClipboardCheck, Mail, RefreshCwOff, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { plural, relative } from "@/components/app/format";
import { cn } from "@/lib/utils";

/**
 * Carte « À faire maintenant » de l'accueil : une ligne cliquable par chose à traiter,
 * affichée seulement si son compteur est supérieur à 0. Sinon : « Tout est à jour ».
 */
export function ActionRows({
  conflicts,
  invitations,
  review,
  failures,
}: {
  conflicts: number;
  invitations: number;
  /** Analyses à vérifier, de la plus récente à la plus ancienne. */
  review: { id: string; created_at: string }[];
  failures: { id: string; error: string | null }[];
}) {
  const latest = review[0];
  const empty = !conflicts && !invitations && !review.length && !failures.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>À faire maintenant</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="flex min-h-12 items-center gap-3 px-1 text-sm">
            <CircleCheck className="h-6 w-6 shrink-0 text-success" aria-hidden />
            <span>
              <span className="block font-medium">Tout est à jour</span>
              <span className="block text-muted">Rien à traiter pour le moment.</span>
            </span>
          </p>
        ) : (
          <ul className="-mx-1 space-y-1">
            {conflicts > 0 && (
              <Row
                href="/conflits"
                icon={CalendarX}
                tone="warning"
                label={plural(conflicts, "conflit d'agenda à résoudre", "conflits d'agenda à résoudre")}
                hint="Deux dates se chevauchent : choisissez quoi garder."
              />
            )}
            {invitations > 0 && (
              <Row
                href="/invitations"
                icon={Mail}
                label={plural(invitations, "invitation en attente", "invitations en attente")}
                hint="Répondez oui, peut-être ou non."
              />
            )}
            {review.length > 0 && (
              <Row
                href={latest ? `/capture/${latest.id}` : "/historique"}
                icon={ClipboardCheck}
                label={plural(review.length, "analyse à vérifier", "analyses à vérifier")}
                hint={latest && (review.length > 1 ? `La plus récente : analysée ${relative(latest.created_at)}` : `Analysée ${relative(latest.created_at)}`)}
              />
            )}
            {failures.length > 0 && (
              <li>
                <Row
                  as="div"
                  href="/parametres/calendriers"
                  icon={RefreshCwOff}
                  tone="danger"
                  label={failures.length > 1 ? `${failures.length} synchronisations d'agenda ont échoué` : "Une synchronisation d'agenda a échoué"}
                  hint="Vérifiez la connexion de votre agenda."
                />
                <Disclosure summary="Détail technique" className="mx-1 mt-1">
                  <ul className="space-y-1 text-xs text-muted">
                    {failures.map((f) => (
                      <li key={f.id} className="wrap-anywhere">
                        {f.error ?? "Erreur inconnue"}
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const TONES = {
  default: "bg-info-bg text-accent",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

function Row({
  href,
  icon: Icon,
  label,
  hint,
  tone = "default",
  as = "li",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  tone?: keyof typeof TONES;
  as?: "li" | "div";
}) {
  const Wrapper = as;
  return (
    <Wrapper>
      <Link href={href} className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-2 hover:bg-subtle">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONES[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {hint && <span className="block text-sm text-muted">{hint}</span>}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </Link>
    </Wrapper>
  );
}
