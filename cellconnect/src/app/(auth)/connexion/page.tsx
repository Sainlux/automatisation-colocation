"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/client/api";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", json: { email: f.get("email"), password: f.get("password") } });
      const next = new URLSearchParams(window.location.search).get("suite");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <h1 className="mb-1 text-lg font-semibold">Connexion</h1>
        <p className="mb-4 text-sm text-muted">Heureux de vous revoir.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Mot de passe" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Se connecter
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-accent hover:underline">
            Créer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
