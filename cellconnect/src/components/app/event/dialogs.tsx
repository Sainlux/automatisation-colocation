"use client";

import { useRef, useState } from "react";
import { apiFetch, errorText, useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { ChoiceCard, ChoiceGroup } from "@/components/ui/choice";
import { fmtLongDate, fmtOffset, frTypo, plural, REMINDER_PRESETS } from "@/components/app/format";
import { REMINDER_LIMITS } from "@/lib/schemas/reminder";
import { t } from "@/i18n";
import { finalReminders, parseCustomReminder, REMINDER_UNITS, splitEmails, type ReminderUnit } from "./logic";
import { ManualLinks, type ManualLink } from "./manual-links";
import type { Delivery, Done } from "./types";

/** Message d'erreur dans une boîte : lu par les lecteurs d'écran (role="alert"). */
function DialogError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Alert tone="danger" live>
      {text}
    </Alert>
  );
}

/* ───────────── Annuler l'événement pour tous ───────────── */

export function CancelDialog({ open, onClose, eventId, participants, onDone }: { open: boolean; onClose: () => void; eventId: string; participants: number; onDone: Done }) {
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ notified: number; deliveries: Delivery[] }>(`/api/events/${eventId}?confirm=true&message=${encodeURIComponent(message)}`, { method: "DELETE" });
      onDone({
        tone: "success",
        text: `Événement annulé. ${r.notified ? `${plural(r.notified, "participant prévenu", "participants prévenus")}.` : "Personne d'autre n'était inscrit."}`,
        deliveries: r.deliveries,
      });
    } catch (e) {
      setErr(errorText(e, "Annulation impossible pour le moment. Vérifiez votre connexion internet, puis réessayez."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Annuler l'événement pour tous ?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            Oui, annuler pour tous
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          L&apos;événement sera annulé pour <strong>tout le monde</strong>
          {participants > 0 ? ` (${plural(participants, "autre participant", "autres participants")})` : ""}. Pour simplement ne pas y aller, choisissez plutôt « Me retirer ».
        </p>
        <Field label="Message aux participants (facultatif)" htmlFor="cancel-msg">
          <Textarea id="cancel-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <DialogError text={err} />
      </div>
    </Dialog>
  );
}

/* ───────────── Me retirer ───────────── */

export function WithdrawDialog({
  open,
  onClose,
  eventId,
  title,
  defaultMessage,
  isOrganizer,
  personal,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  defaultMessage: string;
  isOrganizer: boolean;
  personal: boolean;
  onDone: Done;
}) {
  const [notify, setNotify] = useState(!isOrganizer);
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ cancelledPersonalEvent: boolean; notified: boolean; deliveries: Delivery[] }>(`/api/events/${eventId}/withdraw`, {
        method: "POST",
        json: { notifyOrganizer: notify, message },
      });
      onDone({
        tone: "success",
        text: r.cancelledPersonalEvent
          ? "Événement retiré de votre agenda."
          : `Vous ne participez plus. L'événement est maintenu pour les autres.${r.notified ? " L'organisateur a été prévenu." : ""}`,
        deliveries: r.deliveries,
      });
    } catch (e) {
      setErr(errorText(e, "Impossible de vous retirer pour le moment. Vérifiez votre connexion internet, puis réessayez."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Me retirer de cet événement"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button loading={busy} onClick={confirm}>
            {frTypo(`Me retirer de « ${title} »`)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {personal ? "Cet événement personnel sera retiré de votre agenda." : "Votre désistement retire votre participation et vos rappels. L'événement reste maintenu pour les autres participants."}
        </p>
        {!isOrganizer && <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Prévenir l'organisateur" />}
        {notify && !isOrganizer && (
          <Field label="Message" htmlFor="wd-msg" hint="Ne mentionnez que ce que vous souhaitez partager.">
            <Textarea id="wd-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        )}
        <DialogError text={err} />
      </div>
    </Dialog>
  );
}

/* ───────────── Inviter ───────────── */

type EmailResult = { email: string; status: string; link?: string };

/**
 * Invitation d'un groupe, de membres de l'église ou d'adresses e-mail.
 * Si un e-mail n'a pas pu partir, la boîte reste ouverte : l'utilisateur transmet le lien lui-même.
 */
export function InviteDialog({
  open,
  onClose,
  eventId,
  eventTitle,
  groupId,
  exclude,
  onDone,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  groupId: string | null;
  exclude: string[];
  onDone: Done;
  /** Les invitations sont parties (même en partie) : la fiche se recharge sans fermer la boîte. */
  onChanged: () => void;
}) {
  const members = useApi<{ members: { userId: string; name: string }[] }>(open ? "/api/orgs/members" : null);
  const groups = useApi<{ groups: { id: string; name: string; canManage: boolean }[] }>(open ? "/api/groups" : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [emails, setEmails] = useState("");
  const [group, setGroup] = useState(groupId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Envois réussis en partie : résumé et liens à transmettre à la main. */
  const [partial, setPartial] = useState<{ text: string; links: ManualLink[] } | null>(null);
  const candidates = members.data?.members.filter((m) => !exclude.includes(m.userId)) ?? [];

  async function send() {
    const list = splitEmails(emails);
    if (!selected.length && !group && !list.length) {
      setErr("Choisissez un groupe, une personne ou saisissez une adresse e-mail.");
      return;
    }
    setBusy(true);
    setErr(null);
    const parts: string[] = [];
    try {
      if (selected.length || group) {
        const r = await apiFetch<{ results: { status: string }[] }>(`/api/events/${eventId}/invite`, {
          method: "POST",
          json: { userIds: selected, groupId: group || null },
        });
        parts.push(`${plural(r.results.filter((x) => x.status === "invited").length, "invitation envoyée", "invitations envoyées")}.`);
        setSelected([]);
      }
      if (list.length) {
        const r = await apiFetch<{ results: EmailResult[] }>("/api/invitations/email", { method: "POST", json: { emails: list, eventId } });
        const sent = r.results.filter((x) => x.status === "email_sent" || x.status === "invited_member").length;
        const links = r.results.filter((x): x is EmailResult & { link: string } => Boolean(x.link)).map((x) => ({ email: x.email, link: x.link }));
        if (sent) parts.push(`${plural(sent, "invitation envoyée", "invitations envoyées")} par e-mail.`);
        setEmails("");
        if (links.length) {
          onChanged();
          setPartial({ text: parts.join(" "), links });
          return;
        }
      }
      onDone({ tone: "success", text: parts.join(" ") || "Invitations envoyées." });
    } catch (e) {
      setErr(errorText(e, "Invitation impossible pour le moment. Vérifiez votre connexion internet, puis réessayez."));
      if (parts.length) onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Échap déclenche « cancel » puis « close » : on ne conclut qu'une fois.
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    setTimeout(() => (finished.current = false), 0);
    if (partial) onDone({ tone: "warning", text: `${partial.text ? `${partial.text} ` : ""}${plural(partial.links.length, "lien à transmettre vous-même", "liens à transmettre vous-même")}.` });
    else onClose();
    setPartial(null);
  };

  return (
    <Dialog
      open={open}
      onClose={finish}
      title="Inviter"
      footer={
        partial ? (
          <Button onClick={finish}>Terminé</Button>
        ) : (
          <Button loading={busy} onClick={send}>
            Envoyer les invitations
          </Button>
        )
      }
    >
      {partial ? (
        <div className="space-y-3">
          {partial.text && <p className="text-sm">{partial.text}</p>}
          <ManualLinks links={partial.links} what={eventTitle} />
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Inviter un groupe entier" htmlFor="inv-group">
            <Select id="inv-group" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Aucun groupe</option>
              {groups.data?.groups
                .filter((g) => g.canManage)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="text-sm font-medium">Ou des personnes</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">Aucune autre personne dans l&apos;église.</p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {candidates.map((m) => (
                <li key={m.userId}>
                  <Checkbox checked={selected.includes(m.userId)} onChange={(e) => setSelected(e.target.checked ? [...selected, m.userId] : selected.filter((x) => x !== m.userId))} label={m.name} />
                </li>
              ))}
            </ul>
          )}
          <Field label="Inviter par e-mail (personnes sans compte)" htmlFor="inv-emails" hint="Séparez les adresses par des virgules. Elles reçoivent un lien valable 30 jours.">
            <Textarea id="inv-emails" rows={2} inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="prenom@exemple.ch, autre@exemple.ch" />
          </Field>
          <DialogError text={err} />
        </div>
      )}
    </Dialog>
  );
}

/* ───────────── Rappels ───────────── */

/** Rappels de cet événement : puces des délais habituels + « [nombre] [unité] avant ». */
export function RemindersDialog({ open, onClose, eventId, current, onDone }: { open: boolean; onClose: () => void; eventId: string; current: number[]; onDone: Done }) {
  const [offsets, setOffsets] = useState<number[]>(current);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<ReminderUnit>("hours");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Les rappels déjà programmés hors des délais proposés restent visibles et retirables.
  const choices = [...REMINDER_PRESETS, ...current.filter((c) => !REMINDER_PRESETS.some((p) => p.value === c)).map((value) => ({ value, label: fmtOffset(value) }))].sort(
    (a, b) => b.value - a.value,
  );
  const toggle = (v: number) => {
    setErr(null);
    setOffsets(offsets.includes(v) ? offsets.filter((x) => x !== v) : [...offsets, v]);
  };

  async function save() {
    const custom = parseCustomReminder(amount, unit);
    if (custom.error) {
      setErr(custom.error);
      document.getElementById("custom-rem")?.focus();
      return;
    }
    const final = finalReminders(offsets, custom.minutes);
    if (final.error) {
      setErr(final.error);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/api/reminders", { method: "POST", json: { eventId, offsets: final.offsets } });
      onDone({ tone: "success", text: final.offsets.length ? "Rappels mis à jour." : "Plus aucun rappel pour cet événement." });
    } catch (e) {
      setErr(errorText(e, "Enregistrement impossible pour le moment. Vérifiez votre connexion internet, puis réessayez."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rappels pour cet événement"
      footer={
        <Button loading={busy} onClick={save}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Me rappeler</legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((p) => (
              <Button key={p.value} type="button" variant="outline" className="h-11 px-3 first-letter:uppercase" pressed={offsets.includes(p.value)} onClick={() => toggle(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{REMINDER_LIMITS.count} rappels au plus.</p>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Autre rappel</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="custom-rem"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Nombre"
              aria-invalid={Boolean(err && amount) || undefined}
              className="w-20"
              value={amount}
              onChange={(e) => {
                setErr(null);
                setAmount(e.target.value);
              }}
              placeholder="ex. 3"
            />
            <Select aria-label="Unité" className="w-32" value={unit} onChange={(e) => setUnit(e.target.value as ReminderUnit)}>
              {REMINDER_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
            <span className="text-sm">avant</span>
          </div>
          <p className="mt-1 text-xs text-muted">Entre 5 minutes et 4 semaines avant le début.</p>
        </fieldset>
        <DialogError text={err} />
      </div>
    </Dialog>
  );
}

/* ───────────── Rétablir une date ───────────── */

export function RestoreDialog({ open, onClose, onConfirm, busy, error }: { open: boolean; onClose: () => void; onConfirm: () => void; busy: boolean; error: string | null }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rétablir cette date ?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            Rétablir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{t.words.restoreConfirm}</p>
        <DialogError text={error} />
      </div>
    </Dialog>
  );
}

/* ───────────── Modifier une série : cette date ou toutes ? ───────────── */

export type EditScope = "one" | "all";

export function EditScopeDialog({
  open,
  onClose,
  occurrenceStart,
  seriesStart,
  timezone,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  occurrenceStart: string;
  seriesStart: string;
  timezone: string;
  onChoose: (scope: EditScope) => void;
}) {
  const [scope, setScope] = useState<EditScope | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Que voulez-vous modifier ?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button disabled={!scope} onClick={() => scope && onChoose(scope)}>
            Continuer
          </Button>
        </>
      }
    >
      <ChoiceGroup legend="Cet événement se répète." name="edit-scope" value={scope} onChange={(v) => setScope(v as EditScope)}>
        <ChoiceCard value="one" title={t.words.thisDateOnly} hint={<span className="first-letter:uppercase">{fmtLongDate(occurrenceStart, timezone)}</span>} />
        <ChoiceCard value="all" title={t.words.allDates} hint={`Commence le ${fmtLongDate(seriesStart, timezone)}`} />
      </ChoiceGroup>
    </Dialog>
  );
}
