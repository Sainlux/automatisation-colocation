"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarSync, ChevronRight, Download } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/states";
import { t } from "@/i18n";

const ZONES = ["Europe/Zurich", "Europe/Paris", "Europe/Brussels", "Europe/London", "Europe/Berlin", "America/Montreal", "Africa/Abidjan", "Africa/Kinshasa", "UTC"];

export default function SettingsPage() {
  const { me, reload } = useMe();
  const p = me.profile;
  const [form, setForm] = useState({
    display_name: p.display_name,
    timezone: p.timezone,
    reminder_offsets: p.reminder_offsets,
    travel_buffer_minutes: p.travel_buffer_minutes,
    notify_email: p.notify_email,
    delete_captures_after_analysis: p.delete_captures_after_analysis,
  });
  const [theme, setTheme] = useState<"system" | "light" | "dark">(p.theme);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const [del, setDel] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("cc-theme", theme);
    } catch {
      /* stockage indisponible */
    }
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/me", { method: "PATCH", json: { ...form, theme } });
      setMsg({ tone: "success", text: "Paramètres enregistrés." });
      reload();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  const toggleOffset = (o: number, on: boolean) => setForm({ ...form, reminder_offsets: on ? [...form.reminder_offsets, o].sort((a, b) => b - a) : form.reminder_offsets.filter((x) => x !== o) });
  const integ = me.integrations;

  return (
    <div className="space-y-5">
      <PageHeader title="Paramètres" />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Profil et préférences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom affiché" htmlFor="name">
              <Input id="name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <Field label="Fuseau horaire" htmlFor="tz" hint="Les heures d'été/hiver sont gérées automatiquement.">
              <Select id="tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {[...new Set([form.timezone, ...ZONES])].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Rappels par défaut</legend>
            <div className="flex flex-wrap gap-4">
              {[
                [1440, "24 h avant"],
                [120, "2 h avant"],
                [30, "30 min avant"],
              ].map(([o, l]) => (
                <Checkbox key={o} checked={form.reminder_offsets.includes(o as number)} onChange={(e) => toggleOffset(o as number, e.target.checked)} label={l as string} />
              ))}
            </div>
          </fieldset>
          <Field label="Temps de déplacement minimal entre deux événements (minutes)" htmlFor="buffer" hint="0 = seuls les vrais chevauchements sont signalés.">
            <Input id="buffer" type="number" min={0} max={240} className="w-32" value={form.travel_buffer_minutes} onChange={(e) => setForm({ ...form, travel_buffer_minutes: Number(e.target.value) || 0 })} />
          </Field>
          <Checkbox checked={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.checked })} label="Recevoir aussi les notifications par e-mail" />
          {!integ.email.available && <p className="text-xs text-warning">Le serveur d&apos;e-mail (SMTP) n&apos;est pas configuré : les e-mails sont indiqués « Non envoyé ».</p>}
          <Checkbox
            checked={form.delete_captures_after_analysis}
            onChange={(e) => setForm({ ...form, delete_captures_after_analysis: e.target.checked })}
            label="Supprimer automatiquement mes captures après l'analyse (recommandé)"
          />
          <Field label="Apparence" htmlFor="theme">
            <Select id="theme" className="w-48" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">Automatique</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </Select>
          </Field>
          <Button onClick={save} loading={busy}>
            Enregistrer
          </Button>
        </CardContent>
      </Card>

      <Link href="/parametres/calendriers" className="block">
        <Card className="hover:bg-subtle">
          <CardContent className="flex items-center gap-3 pt-4">
            <CalendarSync className="h-5 w-5 text-accent" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">Connexions aux calendriers</p>
              <p className="text-sm text-muted">Google Calendar, Outlook, import/export .ics</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Organisations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {me.organizations.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span>
                  {o.name} <span className="text-xs text-muted">· {t.roles[o.role]}</span>
                </span>
                {o.id === me.organization?.id ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={async () => { await apiFetch("/api/orgs/switch", { method: "POST", json: { orgId: o.id } }); window.location.href = "/"; }}>
                    Basculer
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Nom de la nouvelle organisation" placeholder="Nouvelle organisation (église, association…)" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} />
            <Button variant="outline" disabled={newOrg.trim().length < 2} onClick={async () => { await apiFetch("/api/orgs", { method: "POST", json: { name: newOrg } }); window.location.href = "/"; }}>
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>État des services</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            <Service name="Stockage des données" ok detail={integ.dataBackend === "supabase" ? "Supabase (PostgreSQL)" : "Mode local (démonstration)"} />
            <Service name="Analyse d'images (IA)" ok={integ.ai.available} detail={integ.ai.available ? `${integ.ai.provider} · ${integ.ai.model}` : "Clé OpenAI non configurée"} />
            <Service name="Analyse de texte" ok detail="Locale, sans IA" />
            <Service name="E-mails" ok={integ.email.available} detail={integ.email.available ? "SMTP configuré" : "SMTP non configuré"} />
            <Service name="Google Calendar" ok={integ.google.available} detail={integ.google.available ? "Disponible" : "Identifiants non configurés"} />
            <Service name="Outlook" ok={false} detail={integ.outlook.reason ?? ""} />
            <Service name="Zoom (création de réunions)" ok={false} detail={integ.zoom.reason ?? ""} />
            <Service name="Notifications push" ok={false} detail={integ.push.reason ?? ""} />
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mes données</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">Conformément à la nLPD suisse et au RGPD, vous pouvez exporter ou supprimer vos données à tout moment.</p>
          <a href="/api/account/export" className={buttonVariants({ variant: "outline" })}>
            <Download className="h-4 w-4" aria-hidden /> Exporter mes données (JSON)
          </a>
          <div className="rounded-xl border border-danger/40 p-3">
            <p className="text-sm font-medium text-danger">Supprimer mon compte</p>
            <p className="mb-2 text-xs text-muted">Irréversible. Vos captures, événements personnels et participations sont effacés. Saisissez SUPPRIMER pour confirmer.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="Confirmation" value={del} onChange={(e) => setDel(e.target.value)} placeholder="SUPPRIMER" />
              <Button
                variant="danger"
                disabled={del !== "SUPPRIMER"}
                onClick={async () => {
                  await apiFetch("/api/account", { method: "DELETE", json: { confirm: del } });
                  window.location.href = "/inscription";
                }}
              >
                Supprimer définitivement
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Service({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{name}</span>
      <Badge tone={ok ? "success" : "neutral"}>{detail}</Badge>
    </li>
  );
}
