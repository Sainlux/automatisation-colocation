import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/app/logo";
import { RetryLink } from "@/components/ui/retry-link";

/*
 * Page servie par le service worker quand le réseau ne répond pas (public/sw.js).
 * Entièrement statique : aucune donnée personnelle, elle peut donc être mise en cache.
 */
export const dynamic = "force-static";

export const metadata: Metadata = { title: "Hors ligne" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <div className="mb-8 flex items-center gap-2">
        <LogoMark className="h-8 w-8 text-primary" />
        <Wordmark className="text-xl" />
      </div>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warm-bg text-warm-text">
        <WifiOff className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold">Pas de connexion</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        CellConnect n&apos;arrive pas à joindre le serveur. Vérifiez le Wi-Fi ou les données mobiles de votre téléphone, puis réessayez.
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted">Rien n&apos;est perdu : ce que vous avez déjà enregistré reste dans votre agenda.</p>
      <RetryLink className="mt-6 w-full max-w-xs">Réessayer</RetryLink>
    </main>
  );
}
