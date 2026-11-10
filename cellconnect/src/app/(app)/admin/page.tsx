"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { t } from "@/i18n";

type Role = "org_admin" | "group_leader" | "member" | "guest" | "super_admin";

export default function AdminPage() {
  const { me } = useMe();
  const { data, error, reload } = useApi<{ members: { id: string; userId: string; role: Role; name: string; email: string | null }[] }>(isAdmin(me.role) ? "/api/orgs/members" : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  if (!isAdmin(me.role)) return <EmptyState icon={ShieldAlert} title="Accès réservé">Cette page est réservée aux administrateurs de l&apos;organisation.</EmptyState>;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <Loading />;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      reload();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Erreur" });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Administration" description={me.organization?.name} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => apiFetch("/api/orgs/members", { method: "POST", json: { email, role } }).then(() => setEmail("")), "Membre ajouté.");
            }}
          >
            <Field label="E-mail du compte CellConnect" htmlFor="m-email" className="flex-1">
              <Input id="m-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Rôle" htmlFor="m-role">
              <Select id="m-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="member">{t.roles.member}</option>
                <option value="group_leader">{t.roles.group_leader}</option>
                <option value="org_admin">{t.roles.org_admin}</option>
                <option value="guest">{t.roles.guest}</option>
              </Select>
            </Field>
            <Button type="submit">Ajouter</Button>
          </form>
          <p className="mt-2 text-xs text-muted">La personne doit d&apos;abord avoir créé son compte.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Membres ({data.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted">{m.email}</p>
                </div>
                <Select aria-label={`Rôle de ${m.name}`} className="sm:w-56" value={m.role} disabled={m.role === "super_admin"} onChange={(e) => run(() => apiFetch(`/api/orgs/members/${m.id}`, { method: "PATCH", json: { role: e.target.value } }), "Rôle mis à jour.")}>
                  {m.role === "super_admin" && <option value="super_admin">{t.roles.super_admin}</option>}
                  <option value="org_admin">{t.roles.org_admin}</option>
                  <option value="group_leader">{t.roles.group_leader}</option>
                  <option value="member">{t.roles.member}</option>
                  <option value="guest">{t.roles.guest}</option>
                </Select>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
