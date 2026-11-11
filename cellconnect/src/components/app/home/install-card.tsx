"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { BellRing, Share, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

const HIDDEN_KEY = "cc-install-card-hidden";

type Mode = "none" | "install" | "enable";

function isHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false; // stockage indisponible (navigation privée) : la carte reste proposée
  }
}

function isIos() {
  return /iPhone|iPod|iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detect(pushAvailable: boolean): Mode {
  if (isHidden()) return "none";
  const standalone = isStandalone();
  if (isIos() && !standalone) return "install";
  if (standalone && pushAvailable && "Notification" in window && Notification.permission === "default") return "enable";
  return "none";
}

const noSubscribe = () => () => undefined;

/**
 * Sur iPhone, les rappels n'arrivent que si CellConnect est ajouté à l'écran d'accueil.
 * - Safari (hors écran d'accueil) : comment ajouter l'application.
 * - Application ouverte depuis l'écran d'accueil, notifications pas encore demandées : lien vers les réglages.
 * « Plus tard » masque la carte sur cet appareil.
 */
export function InstallCard({ pushAvailable }: { pushAvailable: boolean }) {
  const getSnapshot = useCallback(() => detect(pushAvailable), [pushAvailable]);
  const mode = useSyncExternalStore(noSubscribe, getSnapshot, () => "none" as Mode);
  const [dismissed, setDismissed] = useState(false);

  function later() {
    setDismissed(true);
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // stockage indisponible : masqué pour cette visite seulement
    }
  }

  if (dismissed || mode === "none") return null;

  const laterButton = (
    <Button variant="ghost" size="sm" onClick={later}>
      Plus tard
    </Button>
  );

  if (mode === "enable") {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4 sm:pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-bg text-warm-text">
            <BellRing className="h-5 w-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">Recevoir les rappels sur ce téléphone</span>
            <span className="block text-muted">Autorisez les notifications pour être prévenu avant chaque rencontre.</span>
          </p>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            {laterButton}
            <Link href="/parametres#notifications" className={buttonVariants({ size: "sm" })}>
              Activer
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 shrink-0 text-warm" aria-hidden /> Recevoir les rappels sur ce téléphone
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">Ajoutez CellConnect à l&apos;écran d&apos;accueil de votre iPhone : vous recevrez les rappels comme un message.</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Dans Safari, touchez <Share className="inline h-4 w-4 align-[-2px] text-accent" aria-hidden /> <strong>Partager</strong>.
          </li>
          <li>
            Choisissez <strong>Sur l&apos;écran d&apos;accueil</strong>, puis <strong>Ajouter</strong>.
          </li>
          <li>Ouvrez CellConnect depuis sa nouvelle icône.</li>
        </ol>
        <div className="mt-3 flex justify-end">{laterButton}</div>
      </CardContent>
    </Card>
  );
}
