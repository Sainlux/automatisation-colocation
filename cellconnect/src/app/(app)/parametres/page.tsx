"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { BellRing, CalendarSync, ChevronRight, CircleCheck, Download, Monitor, Moon, Sun } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { ActionBar } from "@/components/ui/action-bar";
import { Disclosure } from "@/components/ui/disclosure";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/states";
import { InboundSection } from "@/components/app/inbound-section";
import { fmtMinutes, fmtOffsets } from "@/components/app/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const ZONES: Record<string, string> = {
  "Europe/Zurich": "Suisse (Zurich)",
  "Europe/Paris": "France (Paris)",
  "Europe/Brussels": "Belgique (Bruxelles)",
  "Europe/Berlin": "Allemagne (Berlin)",
  "Europe/London": "Royaume-Uni (Londres)",
  "America/Montreal": "Canada (Montréal)",
  "Africa/Abidjan": "Côte d'Ivoire (Abidjan)",
  "Africa/Kinshasa": "RD Congo (Kinshasa)",
  UTC: "Temps universel (UTC)",
};

/** Rappels proposés (minutes avant le début). Le serveur accepte au plus 6 rappels, de 5 min à 4 semaines. */
const REMINDERS: { value: number; label: string }[] = [
  { value: 10080, label: "1 semaine" },
  { value: 1440, label: "1 jour" },
  { value: 120, label: "2 h" },
  { value: 60, label: "1 h" },
  { value: 30, label: "30 min" },
  { value: 15, label: "15 min" },
];

const BUFFERS = [0, 15, 30, 45, 60];

const THEMES: { value: "system" | "light" | "dark"; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Automatique", icon: Monitor },
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
];

/** Contrôle segmenté et puces : au moins 44 px de haut, à toutes les tailles d'écran. */
const chip = "h-11 px-3 sm:min-h-11";

type Form = {
  display_name: string;
  timezone: string;
  reminder_offsets: number[];
  travel_buffer_minutes: number;
  notify_email: boolean;
  delete_captures_after_analysis: boolean;
  theme: "system" | "light" | "dark";
};

const sameForm = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

export default function SettingsPage() {
  const { me, reload } = useMe();
  const p = me.profile;
  const admin = isAdmin(me.role);
  const integ = me.integrations;
  const [saved, setSaved] = useState<Form>(() => ({
    display_name: p.display_name,
    timezone: p.timezone,
    reminder_offsets: [...p.reminder_offsets].sort((a, b) => b - a),
    travel_buffer_minutes: p.travel_buffer_minutes,
    notify_email: p.notify_email,
    delete_captures_after_analysis: p.delete_captures_after_analysis,
    theme: p.theme,
  }));
  const [form, setForm] = useState<Form>(saved);
  const [customBuffer, setCustomBuffer] = useState(!BUFFERS.includes(p.travel_buffer_minutes));
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = !sameForm(form, saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaveState(null);
  };

  // L'apparence s'applique tout de suite (aperçu) ; elle est enregistrée avec le reste.
  useEffect(() => {
    try {
      localStorage.setItem("cc-theme", form.theme);
    } catch {
      /* stockage indisponible */
    }
    const dark = form.theme === "dark" || (form.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [form.theme]);

  // Le message « Enregistré » s'efface seul.
  useEffect(() => {
    if (saveState?.tone !== "success") return;
    const id = setTimeout(() => setSaveState(null), 3000);
    return () => clearTimeout(id);
  }, [saveState]);

  async function save() {
    if (form.display_name.trim().length < 2) {
      setNameError("Indiquez au moins 2 caractères.");
      document.getElementById("name")?.focus();
      return;
    }
    setNameError(null);
    setBusy(true);
    setSaveState(null);
    try {
      const payload = { ...form, display_name: form.display_name.trim() };
      await apiFetch("/api/me", { method: "PATCH", json: payload });
      setSaved(payload);
      setForm(payload);
      setSaveState({ tone: "success", text: "Paramètres enregistrés." });
      reload();
    } catch (e) {
      setSaveState({ tone: "danger", text: e instanceof ApiError ? e.message : "Enregistrement impossible. Vérifiez votre connexion internet." });
    } finally {
      setBusy(false);
    }
  }

  const toggleOffset = (o: number) =>
    set("reminder_offsets", form.reminder_offsets.includes(o) ? form.reminder_offsets.filter((x) => x !== o) : [...form.reminder_offsets, o].sort((a, b) => b - a));

  const zoneOptions = [...new Set([form.timezone, ...Object.keys(ZONES)])];
  // Un rappel enregistré hors de la liste proposée reste visible (et peut être retiré).
  const reminderOptions = [
    ...REMINDERS,
    ...saved.reminder_offsets.filter((o) => !REMINDERS.some((r) => r.value === o)).map((o) => ({ value: o, label: fmtMinutes(o) })),
  ].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <PageHeader title={t.nav.settings} />

      <Section title="Profil">
        <Field label="Nom affiché" htmlFor="name" error={nameError}>
          <Input id="name" autoComplete="name" value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
        </Field>
        <p className="text-sm">
          <span className="text-muted">Adresse e-mail : </span>
          <span className="wrap-anywhere">{p.email}</span>
        </p>
        <Field label="Fuseau horaire" htmlFor="tz" hint="Le passage à l'heure d'été ou d'hiver est automatique.">
          <Select id="tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {ZONES[z] ?? z}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="min-w-0">
          <legend className="mb-1 text-sm font-medium">Temps de trajet entre deux rencontres</legend>
          <div role="group" aria-label="Minutes de trajet" className="flex flex-wrap gap-2">
            {BUFFERS.map((b) => (
              <Button
                key={b}
                type="button"
                variant="outline"
                className={chip}
                pressed={!customBuffer && form.travel_buffer_minutes === b}
                onClick={() => {
                  setCustomBuffer(false);
                  set("travel_buffer_minutes", b);
                }}
              >
                {b === 0 ? "Aucun" : `${b} min`}
              </Button>
            ))}
            <Button type="button" variant="outline" className={chip} pressed={customBuffer} onClick={() => setCustomBuffer(true)}>
              Autre
            </Button>
          </div>
          {customBuffer && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="buffer"
                type="number"
                inputMode="numeric"
                min={0}
                max={240}
                className="w-24"
                aria-label="Temps de trajet en minutes"
                value={form.travel_buffer_minutes}
                onChange={(e) => set("travel_buffer_minutes", Math.min(240, Math.max(0, Math.round(Number(e.target.value) || 0))))}
              />
              <span className="text-sm text-muted">minutes (240 au plus)</span>
            </div>
          )}
          <p className="mt-1 text-xs text-muted">
            {form.travel_buffer_minutes === 0
              ? "Seuls les vrais chevauchements sont signalés."
              : `CellConnect vous prévient s'il reste moins de ${form.travel_buffer_minutes} min entre deux rencontres.`}
          </p>
        </fieldset>
      </Section>

      <Section id="notifications" title="Rappels et notifications">
        <fieldset className="min-w-0">
          <legend className="mb-1 text-sm font-medium">Rappels par défaut</legend>
          <div className="flex flex-wrap gap-2">
            {reminderOptions.map((r) => (
              <Button key={r.value} type="button" variant="outline" className={chip} pressed={form.reminder_offsets.includes(r.value)} onClick={() => toggleOffset(r.value)}>
                {r.label}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            {form.reminder_offsets.length ? `Rappel ${fmtOffsets(form.reminder_offsets)}.` : "Aucun rappel."} S&apos;applique aux prochains événements ajoutés.
          </p>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-1 text-sm font-medium">Où recevoir les notifications</legend>
          <ul className="divide-y divide-border">
            <li className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block">{t.channel.in_app}</span>
                <span className="mt-0.5 block text-xs text-muted">La cloche en haut de l&apos;écran.</span>
              </span>
              <Badge tone="success">Toujours activé</Badge>
            </li>
            <li className="py-2">
              <Switch
                label={t.channel.email}
                hint={integ.email.available ? <span className="wrap-anywhere">À {p.email}</span> : "Non disponible pour le moment."}
                checked={integ.email.available && form.notify_email}
                disabled={!integ.email.available}
                onChange={(e) => set("notify_email", e.target.checked)}
              />
            </li>
            <li className="py-2">
              <PushControl available={integ.push.available} reason={admin ? integ.push.reason : undefined} />
            </li>
          </ul>
        </fieldset>
      </Section>

      <Section id="messages" title="Recevoir des messages">
        <InboundSection admin={admin} />
      </Section>

      <Section title="Apparence">
        <div role="group" aria-label="Thème" className="grid grid-cols-3 gap-2">
          {THEMES.map((th) => (
            <Button key={th.value} type="button" variant="outline" className={cn(chip, "px-2")} pressed={form.theme === th.value} onClick={() => set("theme", th.value)}>
              <th.icon className="h-4 w-4 shrink-0" aria-hidden /> {th.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">« Automatique » suit le réglage de votre téléphone.</p>
      </Section>

      <Link href="/parametres/calendriers" className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Card className="hover:bg-subtle">
          <CardContent className="flex items-center gap-3 pt-4 sm:pt-5">
            <CalendarSync className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Calendriers connectés</p>
              <p className="text-sm text-muted">Google Agenda, Outlook, fichiers .ics</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          </CardContent>
        </Card>
      </Link>

      <Organizations />

      <Section id="donnees" title="Mes données">
        <Switch
          label="Supprimer mes captures après l'analyse"
          hint="Recommandé. Les messages et images importés sont effacés dès que les dates sont lues."
          checked={form.delete_captures_after_analysis}
          onChange={(e) => set("delete_captures_after_analysis", e.target.checked)}
        />
        <ul className="list-disc space-y-1 pl-5 text-sm text-pretty">
          <li>
            Les messages collés sont lus par CellConnect, sans IA.
            {integ.ai.available && " Un message ambigu peut être transmis à l'IA (OpenAI) uniquement pour en extraire les dates."}
          </li>
          <li>
            {integ.ai.available
              ? "Les photos et captures sont lues par l'IA (OpenAI). Votre agenda, vos groupes et vos contacts ne lui sont jamais transmis."
              : "La lecture des photos n'est pas activée : rien n'est transmis à une IA."}
          </li>
        </ul>
        <p className="text-sm text-muted">Selon la loi suisse sur la protection des données (nLPD) et le RGPD, vous pouvez exporter ou supprimer vos données à tout moment.</p>
        <a href="/api/account/export" className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
          <Download className="h-4 w-4" aria-hidden /> Exporter mes données
        </a>
        <DeleteAccount />
      </Section>

      {admin && <Services />}

      {(dirty || saveState) && (
        <ActionBar
          status={
            saveState ? (
              <span className={cn("inline-flex items-center gap-1", saveState.tone === "success" ? "text-success" : "text-danger")}>
                {saveState.tone === "success" && <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />}
                {saveState.text}
              </span>
            ) : (
              "Modifications non enregistrées."
            )
          }
        >
          {dirty && (
            <Button onClick={save} loading={busy}>
              Enregistrer
            </Button>
          )}
        </ActionBar>
      )}
    </div>
  );
}

/** Section de réglages : une carte, un fieldset, un titre (legend contenant le h2). */
function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="p-4 sm:p-5">
      <fieldset className="min-w-0">
        <legend className="pb-3">
          <h2 className="text-lg leading-snug font-semibold">{title}</h2>
        </legend>
        <div className="space-y-4">{children}</div>
      </fieldset>
    </Card>
  );
}

function Organizations() {
  const { me } = useMe();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion internet.");
      setBusy(null);
    }
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Indiquez un nom d'au moins 2 caractères.");
      return;
    }
    void run("create", () => apiFetch("/api/orgs", { method: "POST", json: { name: name.trim() } }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Églises et organisations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          {me.organizations.map((o) => (
            <li key={o.id} className="flex min-h-12 items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-medium wrap-anywhere">{o.name}</span>
                <span className="block text-xs text-muted">{t.roles[o.role]}</span>
              </span>
              {o.id === me.organization?.id ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Button size="sm" variant="outline" loading={busy === o.id} disabled={Boolean(busy)} onClick={() => run(o.id, () => apiFetch("/api/orgs/switch", { method: "POST", json: { orgId: o.id } }))}>
                  Basculer
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={create} noValidate>
          <Field label="Créer une nouvelle organisation" htmlFor="new-org" error={error}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="new-org" placeholder="Ex. Église de Lausanne" enterKeyHint="done" value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" variant="outline" loading={busy === "create"} disabled={Boolean(busy)}>
                Créer
              </Button>
            </div>
          </Field>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccount() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = value.trim().toUpperCase() === "SUPPRIMER";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/account", { method: "DELETE", json: { confirm: "SUPPRIMER" } });
      window.location.assign("/inscription");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Suppression impossible. Vérifiez votre connexion internet.");
      setBusy(false);
    }
  }

  return (
    <Disclosure summary={<span className="text-danger">Supprimer mon compte</span>}>
      <div className="space-y-3">
        <p className="text-pretty text-muted">Irréversible. Vos captures, événements personnels et participations sont effacés.</p>
        <Field label="Saisissez SUPPRIMER pour confirmer" htmlFor="delete-confirm" error={error}>
          <Input id="delete-confirm" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button variant="danger" className="w-full sm:w-auto" disabled={!confirmed} loading={busy} onClick={remove}>
          Supprimer définitivement
        </Button>
      </div>
    </Disclosure>
  );
}

function Services() {
  const { me } = useMe();
  const integ = me.integrations;
  return (
    <Card>
      <CardHeader>
        <CardTitle>État des services</CardTitle>
        <Badge>Administrateur</Badge>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          <Service name="Stockage des données" ok detail={integ.dataBackend === "supabase" ? "Supabase (PostgreSQL)" : "Mode démonstration"} />
          <Service name="Lecture des photos (IA)" ok={integ.ai.available} detail={integ.ai.available ? `${integ.ai.provider} · ${integ.ai.model}` : "Clé OpenAI non configurée"} />
          <Service name="Lecture des messages" ok detail="Sans IA" />
          <Service name="E-mails" ok={integ.email.available} detail={integ.email.available ? "SMTP configuré" : "SMTP non configuré"} />
          <Service name="Google Agenda" ok={integ.google.available} detail={integ.google.available ? "Disponible" : "Identifiants non configurés"} />
          <Service name="Outlook" ok={integ.outlook.available} detail={integ.outlook.available ? "Disponible" : (integ.outlook.reason ?? "Non configuré")} />
          <Service name="Zoom" ok={integ.zoom.available} detail={integ.zoom.available ? "Disponible" : (integ.zoom.reason ?? "Non configuré")} />
          <Service name="Notifications push" ok={integ.push.available} detail={integ.push.available ? "Clés VAPID configurées" : (integ.push.reason ?? "Non configuré")} />
        </ul>
      </CardContent>
    </Card>
  );
}

function Service({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2">
      <span>{name}</span>
      <Badge tone={ok ? "success" : "neutral"}>{detail}</Badge>
    </li>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const noopSubscribe = () => () => undefined;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

type PushState = "checking" | "on" | "off" | "denied";

/** Push sur cet appareil : détecte l'abonnement existant et n'affiche qu'un seul bouton. */
function PushControl({ available, reason }: { available: boolean; reason?: string }) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => true,
  );
  const ios = useSyncExternalStore(noopSubscribe, isIos, () => false);
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);

  useEffect(() => {
    if (!available || !supported) return;
    let cancelled = false;
    (async () => {
      if (Notification.permission === "denied") return "denied" as const;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      return sub && Notification.permission === "granted" ? ("on" as const) : ("off" as const);
    })()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [available, supported]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const { publicKey } = await apiFetch<{ publicKey: string | null }>("/api/push");
      if (!publicKey) throw new Error("Les notifications push ne sont pas disponibles pour le moment.");
      const perm = await Notification.requestPermission();
      if (perm === "denied") {
        setState("denied");
        return;
      }
      if (perm !== "granted") throw new Error("Autorisation non accordée. Touchez de nouveau « Activer » et choisissez « Autoriser ».");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await apiFetch("/api/push", { method: "POST", json: sub.toJSON() });
      setState("on");
      setMsg({ tone: "success", text: "Notifications activées sur cet appareil." });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Activation impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await apiFetch("/api/push", { method: "DELETE", json: { endpoint: sub?.endpoint ?? null } });
      await sub?.unsubscribe();
      setState("off");
      setMsg({ tone: "muted", text: "Notifications désactivées sur cet appareil." });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Désactivation impossible. Vérifiez votre connexion internet." });
    } finally {
      setBusy(false);
    }
  }

  let hint: ReactNode;
  let action: ReactNode = null;
  if (!available) hint = reason ? `Non disponible : ${reason}` : "Non disponible pour le moment.";
  else if (!supported)
    hint = ios
      ? "Sur iPhone, ajoutez d'abord CellConnect à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez-le depuis l'icône."
      : "Ce navigateur ne permet pas les notifications push.";
  else if (state === "denied")
    hint = ios
      ? "Les notifications sont bloquées. Pour les réactiver : Réglages de l'iPhone → Notifications → CellConnect → Autoriser les notifications."
      : "Les notifications sont bloquées. Pour les réactiver : touchez le cadenas à gauche de l'adresse, puis autorisez les notifications.";
  else {
    hint = state === "on" ? "Activées : rappels et changements, même application fermée." : "Rappels et changements, même application fermée.";
    action =
      state === "on" ? (
        <Button size="sm" variant="outline" loading={busy} onClick={disable}>
          Désactiver
        </Button>
      ) : (
        <Button size="sm" loading={busy} disabled={state === "checking"} onClick={enable}>
          <BellRing className="h-4 w-4" aria-hidden /> Activer
        </Button>
      );
  }

  return (
    <div className="text-sm">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block">Push sur cet appareil</span>
          <span className="mt-0.5 block text-xs text-pretty text-muted">{hint}</span>
        </span>
        {action}
      </div>
      <p aria-live="polite" className={cn("text-xs", msg?.tone === "success" ? "text-success" : msg?.tone === "danger" ? "text-danger" : "text-muted", msg && "mt-1")}>
        {msg?.text}
      </p>
    </div>
  );
}
