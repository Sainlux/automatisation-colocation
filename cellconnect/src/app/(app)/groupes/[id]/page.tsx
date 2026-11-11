"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, type ReactNode } from "react";
import { CalendarDays, LogOut, Search, UserMinus, UserPlus } from "lucide-react";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";
import { plural } from "@/components/app/format";
import { t } from "@/i18n";

type GroupRole = "leader" | "member" | "guest";
interface Member {
  id: string;
  userId: string;
  role: GroupRole;
  name: string;
  email: string | null;
}
interface Data {
  group: { id: string; name: string; description: string | null; color: string };
  canManage: boolean;
  members: Member[];
}
type Confirm = { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; run: () => Promise<void> };

const ROLES: GroupRole[] = ["member", "leader", "guest"];
/** Recherche tolérante : sans casse ni accents. */
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const MAX_RESULTS = 8;

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const { data, error, reload } = useApi<Data>(`/api/groups/${id}`);
  const org = useApi<{ members: { userId: string; name: string }[] }>(data?.canManage ? "/api/orgs/members" : null);
  const [query, setQuery] = useState("");
  const [addRole, setAddRole] = useState<GroupRole>("member");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const back = { href: "/groupes", label: t.nav.groups };

  if (error) return <ErrorState status={error.status} message={error.message} onRetry={reload} back={back} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.states.loading} back={back} />
        <ListSkeleton rows={3} />
      </div>
    );
  }

  const groupName = data.group.name;
  const myId = me.profile.id;
  const self = data.members.find((m) => m.userId === myId);
  const others = data.members.filter((m) => m.userId !== myId);
  const notMembers = org.data?.members.filter((m) => !data.members.some((x) => x.userId === m.userId)) ?? [];
  const q = norm(query.trim());
  const matches = q ? notMembers.filter((m) => norm(m.name).includes(q)) : notMembers;

  async function run(fn: () => Promise<unknown>, success: string) {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "success", text: success });
      reload();
    } catch (e) {
      setNotice({ tone: "danger", text: e instanceof ApiError ? e.message : "Action impossible pour le moment." });
    }
  }

  function changeRole(m: Member, role: GroupRole) {
    const apply = () => run(() => apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "PATCH", json: { role } }), "Rôle mis à jour.");
    const mine = m.userId === myId;
    // Changement à risque : donner la responsabilité du groupe, ou modifier son propre rôle.
    if (!mine && role !== "leader") return void apply();
    setConfirm({
      title: mine ? "Changer votre propre rôle ?" : `Nommer ${m.name} responsable ?`,
      body: mine
        ? `Vous deviendrez « ${t.roles[role]} ». Si vous n'êtes plus responsable, vous ne pourrez peut-être plus gérer ce groupe.`
        : `${m.name} pourra gérer les membres et les événements de « ${groupName} ».`,
      confirmLabel: mine ? "Changer mon rôle" : "Nommer responsable",
      run: apply,
    });
  }

  function removeMember(m: Member) {
    setConfirm({
      title: `Retirer ${m.name} du groupe ?`,
      body: `${m.name} ne fera plus partie de « ${groupName} ». Vous pourrez l'ajouter à nouveau plus tard.`,
      confirmLabel: "Retirer du groupe",
      danger: true,
      run: () => run(() => apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "DELETE" }), `${m.name} ne fait plus partie du groupe.`),
    });
  }

  function leave(m: Member) {
    setConfirm({
      title: "Quitter le groupe ?",
      body: `Vous ne ferez plus partie de « ${groupName} ». Pour revenir, un responsable devra vous ajouter.`,
      confirmLabel: "Quitter le groupe",
      danger: true,
      run: async () => {
        setNotice(null);
        try {
          await apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "DELETE" });
          router.push("/groupes");
        } catch (e) {
          setNotice({ tone: "danger", text: e instanceof ApiError ? e.message : "Impossible de quitter le groupe pour le moment." });
        }
      },
    });
  }

  const roleControl = (m: Member) =>
    data.canManage ? (
      <Select aria-label={`Rôle de ${m.name}`} className="w-full sm:w-44" value={m.role} onChange={(e) => changeRole(m, e.target.value as GroupRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t.roles[r]}
          </option>
        ))}
      </Select>
    ) : (
      <span className="text-sm text-muted">{t.roles[m.role]}</span>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.group.name}
        back={back}
        description={
          <span className="inline-flex items-start gap-2">
            <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: data.group.color }} />
            <span>{data.group.description ?? plural(data.members.length, "membre", "membres")}</span>
          </span>
        }
        actions={
          <Link href={`/calendrier?vue=group:${id}`} className={buttonVariants({ variant: "outline" })}>
            <CalendarDays className="h-4 w-4" aria-hidden /> Calendrier du groupe
          </Link>
        }
      />
      {notice && (
        <Alert tone={notice.tone} live>
          {notice.text}
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{plural(data.members.length, "membre", "membres")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {self && (
              <li className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{self.name} (vous)</p>
                    {self.email && <p className="text-xs text-muted wrap-anywhere">{self.email}</p>}
                  </div>
                  {roleControl(self)}
                </div>
                <Button variant="ghost" size="sm" className="-ml-2 text-danger hover:bg-danger-bg" onClick={() => leave(self)}>
                  <LogOut className="h-4 w-4" aria-hidden /> Quitter le groupe
                </Button>
              </li>
            )}
            {others.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-medium">{m.name}</p>
                  {m.email && <p className="text-xs text-muted wrap-anywhere">{m.email}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {roleControl(m)}
                  {data.canManage && (
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Retirer ${m.name} du groupe`} onClick={() => removeMember(m)}>
                      <UserMinus className="h-5 w-5" aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {data.canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" aria-hidden /> Ajouter un membre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <Field label="Rechercher une personne de l'église" htmlFor="member-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                  <Input id="member-search" type="search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Prénom ou nom" autoComplete="off" />
                </div>
              </Field>
              <Field label="Ajouter comme" htmlFor="member-role">
                <Select id="member-role" value={addRole} onChange={(e) => setAddRole(e.target.value as GroupRole)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {org.loading && !org.data ? (
              <ListSkeleton rows={2} />
            ) : notMembers.length === 0 ? (
              <p className="text-sm text-muted">Toutes les personnes de l&apos;église font déjà partie du groupe.</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted" role="status">
                Personne ne correspond à « {query.trim()} ».
              </p>
            ) : (
              <ul aria-label="Personnes à ajouter" className="space-y-1">
                {matches.slice(0, MAX_RESULTS).map((c) => (
                  <li key={c.userId}>
                    <Button
                      variant="ghost"
                      className="h-auto min-h-11 w-full justify-start py-2 text-left"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await run(() => apiFetch(`/api/groups/${id}/members`, { method: "POST", json: { userId: c.userId, role: addRole } }), `${c.name} fait maintenant partie du groupe (${t.roles[addRole].toLowerCase()}).`);
                        setQuery("");
                        setBusy(false);
                      }}
                    >
                      <UserPlus className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 wrap-anywhere">{c.name}</span>
                    </Button>
                  </li>
                ))}
                {matches.length > MAX_RESULTS && <li className="px-3 text-xs text-muted">Précisez la recherche pour voir les {matches.length - MAX_RESULTS} autres personnes.</li>}
              </ul>
            )}
            <p className="text-xs text-muted">
              {isAdmin(me.role) ? (
                <>
                  Quelqu&apos;un manque ?{" "}
                  <Link href="/admin" className="font-medium text-accent underline underline-offset-2">
                    Ajoutez-le d&apos;abord à l&apos;église
                  </Link>
                  , puis revenez ici.
                </>
              ) : (
                "Quelqu'un manque ? Demandez à un administrateur de l'ajouter d'abord à l'église."
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(confirm)}
      onClose={onClose}
      title={confirm?.title ?? ""}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant={confirm?.danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              if (!confirm) return;
              setBusy(true);
              await confirm.run();
              setBusy(false);
              onClose();
            }}
          >
            {confirm?.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{confirm?.body}</p>
    </Dialog>
  );
}
