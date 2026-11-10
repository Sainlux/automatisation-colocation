"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ArrowLeft, CalendarDays, Trash2 } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { t } from "@/i18n";

interface Data {
  group: { id: string; name: string; description: string | null; color: string };
  canManage: boolean;
  members: { id: string; userId: string; role: "leader" | "member" | "guest"; name: string; email: string | null }[];
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const { data, error, reload } = useApi<Data>(`/api/groups/${id}`);
  const org = useApi<{ members: { userId: string; name: string }[] }>("/api/orgs/members");
  const [add, setAdd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <Loading />;
  const candidates = org.data?.members.filter((m) => !data.members.some((x) => x.userId === m.userId)) ?? [];

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/groupes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Groupes
      </Link>
      <PageHeader
        title={data.group.name}
        description={data.group.description ?? undefined}
        actions={
          <Link href="/calendrier" className={buttonVariants({ variant: "outline" })}>
            <CalendarDays className="h-4 w-4" aria-hidden /> Calendrier
          </Link>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Membres ({data.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name}</p>
                  {m.email && <p className="text-xs text-muted">{m.email}</p>}
                </div>
                {data.canManage ? (
                  <Select aria-label={`Rôle de ${m.name}`} className="w-40" value={m.role} onChange={(e) => run(() => apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "PATCH", json: { role: e.target.value } }))}>
                    <option value="leader">{t.roles.leader}</option>
                    <option value="member">{t.roles.member}</option>
                    <option value="guest">{t.roles.guest}</option>
                  </Select>
                ) : (
                  <span className="text-sm text-muted">{t.roles[m.role]}</span>
                )}
                {(data.canManage || m.userId === me.profile.id) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.userId === me.profile.id ? "Quitter le groupe" : `Retirer ${m.name}`}
                    onClick={() =>
                      run(async () => {
                        await apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "DELETE" });
                        if (m.userId === me.profile.id) router.push("/groupes");
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data.canManage && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Select aria-label="Ajouter un membre" value={add} onChange={(e) => setAdd(e.target.value)}>
                <option value="">Ajouter un membre de l&apos;organisation…</option>
                {candidates.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button disabled={!add} onClick={() => run(async () => { await apiFetch(`/api/groups/${id}/members`, { method: "POST", json: { userId: add } }); setAdd(""); })}>
                Ajouter
              </Button>
            </div>
          )}
          {data.canManage && candidates.length === 0 && <p className="mt-2 text-xs text-muted">Pour ajouter quelqu&apos;un, un administrateur doit d&apos;abord l&apos;ajouter à l&apos;organisation (page Administration).</p>}
        </CardContent>
      </Card>
    </div>
  );
}
