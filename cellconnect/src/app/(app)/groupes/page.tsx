"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Plus, Users } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { canLead, useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StaleBanner } from "@/components/ui/states";
import { plural } from "@/components/app/format";
import { t } from "@/i18n";

interface G {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
  myRole: "leader" | "member" | "guest" | null;
}

function GroupCard({ g }: { g: G }) {
  return (
    <Card className="flex h-full flex-col hover:bg-subtle/60">
      {/* Deux liens distincts : la carte mène au groupe, « Voir l'agenda » à son agenda. */}
      <Link href={`/groupes/${g.id}`} className="flex flex-1 items-start gap-3 rounded-2xl p-4 sm:p-5">
        <span aria-hidden className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: g.color }} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold wrap-anywhere">{g.name}</span>
          {g.description && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{g.description}</span>}
          <span className="mt-2 flex flex-wrap gap-2">
            <Badge>{plural(g.memberCount, "membre", "membres")}</Badge>
            {g.myRole && <Badge tone="primary">{t.roles[g.myRole]}</Badge>}
          </span>
        </span>
      </Link>
      <Link href={`/calendrier?vue=group:${g.id}`} className="mx-4 mb-2 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-accent hover:underline sm:mx-5">
        <CalendarDays className="h-4 w-4" aria-hidden /> Voir l&apos;agenda<span className="sr-only"> de « {g.name} »</span>
      </Link>
    </Card>
  );
}

function Section({ title, groups }: { title?: string; groups: G[] }) {
  if (!groups.length) return null;
  return (
    <section className="space-y-2">
      {title && <h2 className="text-sm font-semibold text-muted">{title}</h2>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <li key={g.id}>
            <GroupCard g={g} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function GroupsPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<{ groups: G[] }>("/api/groups");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#23367a" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const led = data?.groups.filter((g) => g.myRole === "leader") ?? [];
  const others = data?.groups.filter((g) => g.myRole !== "leader") ?? [];
  // Les intertitres n'ont de sens que si les deux sections sont présentes.
  const split = led.length > 0 && others.length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.groups}
        description="Cellules, équipes, formations : chaque groupe a son agenda commun."
        actions={
          canLead(me.role) && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Créer un groupe
            </Button>
          )
        }
      />
      {loading && !data ? (
        <ListSkeleton rows={3} />
      ) : error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={reload} />
      ) : !data?.groups.length ? (
        <EmptyState icon={Users} title="Aucun groupe">
          {canLead(me.role) ? "Créez votre premier groupe (ex. « Cellule Annemasse »)." : "Un responsable doit vous ajouter à un groupe."}
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {error && <StaleBanner onRetry={reload} />}
          <Section title={split ? "Je dirige" : undefined} groups={led} />
          <Section title={split ? "Autres groupes" : undefined} groups={others} />
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau groupe"
        footer={
          <Button
            loading={busy}
            onClick={async () => {
              if (!form.name.trim()) {
                setErr("Donnez un nom au groupe.");
                return;
              }
              setBusy(true);
              setErr(null);
              try {
                await apiFetch("/api/groups", { method: "POST", json: { ...form, description: form.description || null } });
                setOpen(false);
                setForm({ name: "", description: "", color: "#23367a" });
                reload();
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Création impossible.");
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
            <Input id="g-color" type="color" className="h-11 w-20 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Field>
          {err && (
            <Alert tone="danger" live>
              {err}
            </Alert>
          )}
        </div>
      </Dialog>
    </div>
  );
}
