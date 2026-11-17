"use client";

import { useState, type FormEvent } from "react";
import { ShieldAlert } from "lucide-react";
import { apiFetch, errorText, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";
import { ManualLinks, type ManualLink } from "@/components/app/event/manual-links";
import { LiveRegion, useScrollIntoView } from "@/components/app/event/live-region";
import { t } from "@/i18n";

type Role = "org_admin" | "group_leader" | "member" | "guest" | "super_admin";
type Member = { id: string; userId: string; role: Role; name: string; email: string | null };
type Notice = { tone: "success" | "danger"; text: string; links?: ManualLink[] };
type Confirm = { title: string; body: string; confirmLabel: string; run: () => Promise<void> };

const ASSIGNABLE: Exclude<Role, "super_admin">[] = ["member", "group_leader", "org_admin", "guest"];

export default function AdminPage() {
  const { me, reload: reloadMe } = useMe();
  const admin = isAdmin(me.role);
  const { data, error, reload } = useApi<{ members: Member[] }>(admin ? "/api/orgs/members" : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "super_admin">>("member");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const noticeRef = useScrollIntoView<HTMLDivElement>(notice);

  if (!admin) return <EmptyState icon={ShieldAlert} title="Accès réservé">Cette page est réservée aux administrateurs de l&apos;église.</EmptyState>;
  if (error && !data) return <ErrorState status={error.status} message={error.message} onRetry={reload} />;

  async function changeRole(m: Member, next: Role) {
    setNotice(null);
    try {
      await apiFetch(`/api/orgs/members/${m.id}`, { method: "PATCH", json: { role: next } });
      setNotice({ tone: "success", text: `${m.name} : ${t.roles[next].toLowerCase()}.` });
      reload();
      if (m.userId === me.profile.id) reloadMe();
    } catch (e) {
      setNotice({ tone: "danger", text: errorText(e, t.words.actionFailed) });
    }
  }

  /** Confirmation pour tout passage vers ou depuis « Administrateur », et toujours pour son propre rôle. */
  function requestRole(m: Member, next: Role) {
    if (next === m.role) return;
    const mine = m.userId === me.profile.id;
    const sensitive = mine || next === "org_admin" || m.role === "org_admin";
    if (!sensitive) return void changeRole(m, next);
    setConfirm({
      title: mine ? "Changer votre propre rôle ?" : next === "org_admin" ? `Nommer ${m.name} administrateur ?` : `Retirer le rôle d'administrateur à ${m.name} ?`,
      body: mine
        ? `Vous deviendrez « ${t.roles[next]} ».${next !== "org_admin" ? " Vous n'aurez peut-être plus accès à cette page." : ""}`
        : next === "org_admin"
          ? `${m.name} pourra gérer les membres, les rôles et tous les groupes de l'église.`
          : `${m.name} deviendra « ${t.roles[next]} » et ne pourra plus gérer les membres de l'église.`,
      confirmLabel: mine ? "Changer mon rôle" : "Confirmer",
      run: () => changeRole(m, next),
    });
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setAdding(true);
    setNotice(null);
    try {
      // Le serveur répond de la même façon que l'adresse ait un compte ou non (pas de divulgation).
      const r = await apiFetch<{ invited: boolean; emailSent: boolean; link: string | null }>("/api/orgs/members", { method: "POST", json: { email: address, role } });
      setNotice(
        r.link
          ? { tone: "success", text: `Invitation préparée pour ${address}.`, links: [{ email: address, link: r.link }] }
          : { tone: "success", text: `${t.words.invitationSent} à ${address}. La personne rejoindra l'église en ouvrant le lien reçu.` },
      );
      setEmail("");
      reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(err, t.words.actionFailed) });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t.nav.admin} description={me.organization?.name} />
      <LiveRegion message={notice?.text} assertive={notice?.tone === "danger"} />
      {notice && (
        <div ref={noticeRef} className="scroll-mt-20 space-y-2">
          <Alert tone={notice.tone}>{notice.text}</Alert>
          {notice.links && <ManualLinks links={notice.links} what={null} />}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={add}>
            <Field label={t.words.emailAddress} htmlFor="m-email" className="flex-1">
              <Input
                id="m-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@exemple.ch"
              />
            </Field>
            <Field label="Rôle" htmlFor="m-role">
              <Select id="m-role" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "super_admin">)}>
                {ASSIGNABLE.map((r) => (
                  <option key={r} value={r}>
                    {t.roles[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={adding}>
              Ajouter
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">La personne reçoit une invitation par e-mail (lien valable 30 jours), qu&apos;elle ait déjà un compte ou non.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Membres{data ? ` (${data.members.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <ListSkeleton rows={3} />
          ) : (
            <ul className="divide-y divide-border">
              {data.members.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium wrap-anywhere">
                      {m.name}
                      {m.userId === me.profile.id && <span className="text-muted"> (vous)</span>}
                    </p>
                    {m.email && <p className="text-xs text-muted wrap-anywhere">{m.email}</p>}
                  </div>
                  <Select aria-label={`Rôle de ${m.name}`} className="sm:w-56" value={m.role} disabled={m.role === "super_admin"} onChange={(e) => requestRole(m, e.target.value as Role)}>
                    {m.role === "super_admin" && <option value="super_admin">{t.roles.super_admin}</option>}
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {t.roles[r]}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
