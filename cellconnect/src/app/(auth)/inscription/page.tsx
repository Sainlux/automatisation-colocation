"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/client/api";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    setDetails([]);
    try {
      const r = await apiFetch<{ needsEmailConfirmation: boolean }>("/api/auth/signup", {
        method: "POST",
        json: { name: f.get("name"), email: f.get("email"), password: f.get("password"), organizationName: f.get("organizationName") || null },
      });
      if (r.needsEmailConfirmation) {
        setConfirm(true);
        setLoading(false);
      } else window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Inscription impossible.");
      if (err instanceof ApiError && Array.isArray(err.details)) setDetails((err.details as { message: string }[]).map((d) => d.message));
      setLoading(false);
    }
  }

  if (confirm) {
    return (
      <Alert tone="success" title="Vérifiez votre boîte e-mail">
        Un lien de confirmation vous a été envoyé. Cliquez dessus puis <Link href="/connexion" className="underline">connectez-vous</Link>.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <h1 className="mb-1 text-lg font-semibold">Créer un compte</h1>
        <p className="mb-4 text-sm text-muted">Gratuit, en moins d&apos;une minute.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Votre nom" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required minLength={2} />
          </Field>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Mot de passe" htmlFor="password" hint="10 caractères minimum.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="Église / organisation (facultatif)" htmlFor="organizationName" hint="Vous pourrez inviter d'autres responsables ensuite.">
            <Input id="organizationName" name="organizationName" placeholder="Ex. Église de Genève" />
          </Field>
          {error && (
            <Alert tone="danger" title={error}>
              {details.length > 0 && (
                <ul className="list-disc pl-4">
                  {details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Créer mon compte
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
