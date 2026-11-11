"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BellRing, ClipboardPaste, ListChecks, MailCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/app/password-input";
import { apiFetch, ApiError } from "@/lib/client/api";

const FIELDS = ["name", "email", "password", "organizationName"] as const;
type FieldName = (typeof FIELDS)[number];
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

const STEPS = [
  { icon: ClipboardPaste, text: "Collez le message reçu avec les dates." },
  { icon: ListChecks, text: "Vérifiez : CellConnect signale les conflits avec votre agenda." },
  { icon: BellRing, text: "Recevez les rappels avant chaque rencontre." },
];

function validate(v: Record<FieldName, string>): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Indiquez votre prénom et votre nom.";
  if (!v.email.trim()) e.email = "Saisissez votre adresse e-mail.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch).";
  if (v.password.length < MIN_PASSWORD) e.password = `Choisissez un mot de passe d'au moins ${MIN_PASSWORD} caractères.`;
  return e;
}

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const next = useSearchParams().get("suite");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const values = Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) ?? "")])) as Record<FieldName, string>;
    const found = validate(values);
    setErrors(found);
    setError(null);
    const first = FIELDS.find((k) => found[k]);
    if (first) {
      form.querySelector<HTMLInputElement>(`#${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      const r = await apiFetch<{ needsEmailConfirmation: boolean }>("/api/auth/signup", {
        method: "POST",
        json: { name: values.name.trim(), email: values.email.trim(), password: values.password, organizationName: values.organizationName.trim() || null },
      });
      if (r.needsEmailConfirmation) {
        setConfirmEmail(values.email.trim());
        setLoading(false);
      } else {
        window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      }
    } catch (err) {
      setLoading(false);
      // Erreurs de validation du serveur : chaque message est rattaché à son champ.
      const details = err instanceof ApiError && Array.isArray(err.details) ? (err.details as { path?: string; message?: string }[]) : [];
      const byField: Errors = {};
      const rest: string[] = [];
      for (const d of details) {
        const key = FIELDS.find((k) => k === d.path);
        if (key && d.message) byField[key] = d.message;
        else if (d.message) rest.push(d.message);
      }
      setErrors(byField);
      const firstServer = FIELDS.find((k) => byField[k]);
      if (firstServer) form.querySelector<HTMLInputElement>(`#${firstServer}`)?.focus();
      else setError(err instanceof ApiError ? [err.message, ...rest].join(" ") : "Inscription impossible. Vérifiez votre connexion internet, puis réessayez.");
    }
  }

  if (confirmEmail) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5 text-center sm:pt-6">
          <MailCheck className="mx-auto h-10 w-10 text-success" aria-hidden />
          <h1 className="text-2xl leading-tight font-bold tracking-tight">Vérifiez votre boîte e-mail</h1>
          <p className="text-sm text-pretty">
            Un lien de confirmation a été envoyé à <strong className="wrap-anywhere">{confirmEmail}</strong>. Touchez-le pour activer votre compte, puis connectez-vous.
          </p>
          <p className="text-xs text-pretty text-muted">Rien reçu après quelques minutes ? Regardez dans les courriers indésirables (spam).</p>
          <Link href={`/connexion?email=${encodeURIComponent(confirmEmail)}${next ? `&suite=${encodeURIComponent(next)}` : ""}`} className={buttonVariants({ size: "lg", className: "w-full" })}>
            Aller à la connexion
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <h1 className="mb-1 text-2xl leading-tight font-bold tracking-tight">Créer un compte</h1>
        <p className="mb-3 text-sm text-muted">Gratuit, en moins d&apos;une minute.</p>
        <ul className="mb-5 space-y-2 text-sm">
          {STEPS.map((s) => (
            <li key={s.text} className="flex items-start gap-2">
              <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-warm" aria-hidden />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <Field label="Votre nom" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" required minLength={2} />
          </Field>
          <Field label="E-mail" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
            />
          </Field>
          <Field label="Mot de passe" htmlFor="password" error={errors.password}>
            <PasswordInput id="password" name="password" autoComplete="new-password" enterKeyHint="next" required minLength={MIN_PASSWORD} showCount />
          </Field>
          <Field label="Église ou organisation (facultatif)" htmlFor="organizationName" hint="Laissez vide si un responsable vous a invité." error={errors.organizationName}>
            <Input id="organizationName" name="organizationName" autoComplete="organization" enterKeyHint="done" placeholder="Ex. Église de Genève" />
          </Field>
          {error && (
            <Alert tone="danger" live>
              {error}
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Créer mon compte
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Déjà inscrit ?{" "}
          <Link href={next ? `/connexion?suite=${encodeURIComponent(next)}` : "/connexion"} className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
