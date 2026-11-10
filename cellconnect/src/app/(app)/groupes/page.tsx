"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { canLead, useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";
import { t } from "@/i18n";

interface G {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
  myRole: "leader" | "member" | "guest" | null;
}

export default function GroupsPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<{ groups: G[] }>("/api/groups");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#1d4ed8" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mes groupes"
        description="Cellules, équipes, formations : chaque groupe a son calendrier collectif."
        actions={
          canLead(me.role) && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Créer un groupe
            </Button>
          )
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data?.groups.length ? (
        <EmptyState icon={Users} title="Aucun groupe">
          {canLead(me.role) ? "Créez votre premier groupe (ex. « Cellule Annemasse »)." : "Un responsable doit vous ajouter à un groupe."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groupes/${g.id}`}>
                <Card className="h-full hover:bg-subtle">
                  <CardContent className="flex items-start gap-3 pt-5">
                    <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ background: g.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{g.name}</p>
                      {g.description && <p className="line-clamp-2 text-sm text-muted">{g.description}</p>}
                      <div className="mt-2 flex gap-2">
                        <Badge>{g.memberCount} membre(s)</Badge>
                        {g.myRole && <Badge tone="primary">{t.roles[g.myRole]}</Badge>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau groupe"
        footer={
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await apiFetch("/api/groups", { method: "POST", json: { ...form, description: form.description || null } });
                setOpen(false);
                setForm({ name: "", description: "", color: "#1d4ed8" });
                reload();
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Erreur");
              } finally {
                setBusy(false);
              }
            }}
          >
            Créer
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Nom" htmlFor="g-name">
            <Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="g-desc">
            <Textarea id="g-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Couleur" htmlFor="g-color">
            <Input id="g-color" type="color" className="h-10 w-20 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Field>
          {err && <Alert tone="danger">{err}</Alert>}
        </div>
      </Dialog>
    </div>
  );
}
