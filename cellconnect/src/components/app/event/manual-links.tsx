"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { inviteShareText } from "./logic";

export interface ManualLink {
  /** Adresse e-mail de la personne (affichée), ou null pour un lien unique. */
  email: string | null;
  link: string;
}

/**
 * Liens d'invitation que l'e-mail n'a pas pu porter : l'utilisateur les transmet lui-même.
 * Jamais d'erreur technique (SMTP) affichée : seulement l'avertissement et les deux boutons.
 */
export function ManualLinks({ links, what, className }: { links: ManualLink[]; what?: string | null; className?: string }) {
  if (!links.length) return null;
  return (
    <Alert tone="warning" title={t.words.manualLinkIntro} className={className}>
      <ul className="mt-2 space-y-3">
        {links.map((l) => (
          <li key={l.link} className="space-y-1.5">
            {l.email && <p className="font-medium wrap-anywhere">{l.email}</p>}
            <LinkActions link={l.link} what={what} />
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/** Boutons « Copier le lien » et « Partager sur WhatsApp » pour un lien. */
export function LinkActions({ link, what }: { link: string; what?: string | null }) {
  const [copied, setCopied] = useState<"ok" | "ko" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("ko");
    }
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied === "ok" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied === "ok" ? t.words.linkCopied : t.words.copyLink}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(inviteShareText(link, what))}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          <Share2 className="h-4 w-4" aria-hidden /> {t.words.shareWhatsApp}
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      </div>
      {/* Copie refusée par le navigateur : le lien reste sélectionnable à la main. */}
      {copied === "ko" && <p className="text-xs wrap-anywhere select-all">{link}</p>}
      <span className="sr-only" aria-live="polite">
        {copied === "ok" ? t.words.linkCopied : ""}
      </span>
    </div>
  );
}
