"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/app/password-input";
import { apiFetch, ApiError } from "@/lib/client/api";

type Errors = Partial<Record<"email" | "password", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const sp = useSearchParams();
  const prefilled = sp.get("email") ?? "";
  const next = sp.get("suite");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const found: Errors = {};
    if (!email) found.email = "Saisissez votre adresse e-mail.";
    else if (!EMAIL_RE.test(email)) found.email = "Cette adresse e-mail semble incomplète (exemple : prenom@exemple.ch).";
    if (!password) found.password = "Saisissez votre mot de passe.";
    setErrors(found);
    setError(null);
    const first = (["email", "password"] as const).find((k) => found[k]);
    if (first) {
      form.querySelector<HTMLInputElement>(`#${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", json: { email, password } });
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible. Vérifiez votre connexion internet, puis réessayez.");
      setLoading(false);
    }
  }

  const signupHref = next ? `/inscription?suite=${encodeURIComponent(next)}` : "/inscription";

  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <h1 className="mb-1 text-2xl leading-tight font-bold tracking-tight">Connexion</h1>
        <p className="mb-4 text-sm text-muted">Heureux de vous revoir.</p>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
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
              defaultValue={prefilled}
              autoFocus={!prefilled}
              required
            />
          </Field>
          <Field label="Mot de passe" htmlFor="password" error={errors.password}>
            <PasswordInput id="password" name="password" autoComplete="current-password" enterKeyHint="go" autoFocus={Boolean(prefilled)} required />
          </Field>
          {error && (
            <Alert tone="danger" live>
              {error}
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Se connecter
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link href={signupHref} className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
            Créer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
