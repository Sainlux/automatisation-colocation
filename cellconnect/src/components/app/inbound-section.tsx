"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";

interface InboundState {
  email: { available: boolean; address: string | null };
  telegram: { available: boolean; botUsername: string | null; linked: { label: string | null; since: string } | null };
}

/**
 * « Recevoir des messages » : transférer un e-mail ou un message Telegram
 * pour que ses dates soient proposées à la vérification (jamais ajoutées seules).
 */
export function InboundSection({ admin }: { admin: boolean }) {
  const { data, error, reload } = useApi<InboundState>("/api/inbound");

  // Retour depuis Telegram après la liaison : on actualise l'état.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  if (error) return <p className="text-sm text-danger">{error.message}</p>;
  if (!data) return <p className="text-sm text-muted">Chargement…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-pretty text-muted">
        Transférez un message qui contient des dates : vous recevez un lien pour les vérifier. Rien n&apos;est ajouté à votre agenda sans votre accord.
      </p>
      <ul className="divide-y divide-border">
        <li className="py-3">
          <EmailRow state={data.email} admin={admin} />
        </li>
        <li className="py-3">
          <TelegramRow state={data.telegram} admin={admin} onChange={reload} />
        </li>
      </ul>
      <Disclosure summary="Et WhatsApp ?">
        <p className="text-sm text-pretty text-muted">
          WhatsApp ne permet pas aux applications de lire vos conversations. Depuis WhatsApp, appui long sur le message › Partager (ou Copier), puis
          collez-le dans Importer. Une liaison officielle (WhatsApp Business) est prévue plus tard.
        </p>
      </Disclosure>
    </div>
  );
}

function EmailRow({ state, admin }: { state: InboundState["email"]; admin: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!state.address) return;
    try {
      await navigator.clipboard.writeText(state.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="text-sm">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Par e-mail</p>
          {state.address ? (
            <>
              <p className="mt-0.5 text-xs text-muted">Transférez l&apos;e-mail à votre adresse personnelle :</p>
              <p className="mt-2 rounded-xl bg-subtle px-3 py-2 font-mono text-xs wrap-anywhere select-all">{state.address}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Adresse copiée" : "Copier l'adresse"}
                </Button>
                <span aria-live="polite" className="sr-only">
                  {copied ? "Adresse copiée" : ""}
                </span>
              </div>
              <p className="mt-2 text-xs text-pretty text-muted">Astuce : ajoutez-la à vos contacts sous le nom « CellConnect ». Gardez-la pour vous : elle est propre à votre compte.</p>
            </>
          ) : (
            <p className="mt-0.5 text-xs text-muted">
              Pas encore activé.{admin ? " À configurer : INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_SECRET, INBOUND_EMAIL_WEBHOOK_TOKEN (voir docs/MESSAGERIES.md)." : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TelegramRow({ state, admin, onChange }: { state: InboundState["telegram"]; admin: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "muted"; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/inbound/telegram/link", { method: "POST" });
      setMsg({ tone: "muted", text: "Telegram s'ouvre : touchez « Démarrer », puis revenez ici." });
      window.location.assign(url);
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Connexion impossible. Vérifiez votre réseau." });
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/inbound/telegram/link", { method: "DELETE" });
      onChange();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre réseau." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <div className="flex items-start gap-3">
        <Send className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Par Telegram</p>
            {state.linked && <Badge tone="success">Relié{state.linked.label ? ` · ${state.linked.label}` : ""}</Badge>}
          </div>
          {!state.available ? (
            <p className="mt-0.5 text-xs text-muted">
              Pas encore activé.{admin ? " À configurer : TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET (voir docs/MESSAGERIES.md)." : ""}
            </p>
          ) : state.linked ? (
            <>
              <p className="mt-0.5 text-xs text-pretty text-muted">
                Transférez le message à <span className="font-medium">@{state.botUsername}</span> dans Telegram : texte, capture, PDF ou fichier d&apos;agenda.
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2" loading={busy} onClick={disconnect}>
                Délier Telegram
              </Button>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-pretty text-muted">Reliez votre compte Telegram une fois ; ensuite, il suffit de transférer les messages au bot.</p>
              <Button type="button" size="sm" className="mt-2" loading={busy} onClick={connect}>
                Connecter Telegram
              </Button>
            </>
          )}
          <p aria-live="polite" className={cn("text-xs", msg?.tone === "danger" ? "text-danger" : "text-muted", msg && "mt-2")}>
            {msg?.text}
          </p>
        </div>
      </div>
    </div>
  );
}
