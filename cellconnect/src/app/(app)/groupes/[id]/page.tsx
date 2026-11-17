"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { CalendarDays, LogOut, Mail, Search, UserMinus, UserPlus } from "lucide-react";
import { apiFetch, errorText, useApi } from "@/lib/client/api";
import { isAdmin, useMe } from "@/components/app/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, LiveRegion } from "@/components/ui/alert";
import { ConfirmDialog, type Confirm } from "@/components/ui/confirm-dialog";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";
import { plural } from "@/components/app/format";
import { ManualLinks, type ManualLink } from "@/components/app/event/manual-links";
import { useScrollIntoView } from "@/components/app/event/live-region";
import { splitEmails } from "@/components/app/event/logic";
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
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string; links?: ManualLink[] } | null>(null);
  const [emails, setEmails] = useState("");
  const [inviting, setInviting] = useState(false);
  const noticeRef = useScrollIntoView<HTMLDivElement>(notice);
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
      setNotice({ tone: "danger", text: errorText(e, t.words.actionFailed) });
    }
  }

  /** Invitation par e-mail (plusieurs adresses) : la personne rejoint l'église et ce groupe. */
  async function inviteByEmail() {
    const list = splitEmails(emails);
    if (!list.length) {
      setNotice({ tone: "danger", text: "Saisissez au moins une adresse e-mail (exemple : prenom@exemple.ch)." });
      return;
    }
    setInviting(true);
    setNotice(null);
    try {
      const r = await apiFetch<{ results: { email: string; status: string; link?: string }[] }>("/api/invitations/email", {
        method: "POST",
        json: { emails: list, groupId: id, orgRole: "member" },
      });
      const links = r.results.filter((x): x is { email: string; status: string; link: string } => Boolean(x.link)).map((x) => ({ email: x.email, link: x.link }));
      const sent = r.results.filter((x) => x.status === "email_sent").length;
      // Personnes déjà dans l'église : ajoutées directement au groupe, sans e-mail.
      const added = r.results.filter((x) => x.status === "already_member" || x.status === "invited_member").length;
      setNotice({
        tone: links.length ? "warning" : "success",
        text: [
          sent ? `${plural(sent, "invitation envoyée", "invitations envoyées")}.` : "",
          added ? `${plural(added, "personne déjà dans l'église ajoutée", "personnes déjà dans l'église ajoutées")} au groupe.` : "",
          links.length ? `${plural(links.length, "lien à transmettre", "liens à transmettre")} vous-même.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        links,
      });
      setEmails("");
      reload();
    } catch (e) {
      setNotice({ tone: "danger", text: errorText(e, t.words.actionFailed) });
    } finally {
      setInviting(false);
    }
  }

  function changeRole(m: Member, role: GroupRole) {
    const apply = () => run(() => apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "PATCH", json: { role } }), "Rôle mis à jour.");
    if (role === m.role) return;
    const mine = m.userId === myId;
    const demote = m.role === "leader" && role !== "leader";
    // Changement à risque : donner ou retirer la responsabilité du groupe, ou modifier son propre rôle.
    if (!mine && role !== "leader" && !demote) return void apply();
    setConfirm({
      title: mine ? "Changer votre propre rôle ?" : demote ? `Retirer la responsabilité à ${m.name} ?` : `Nommer ${m.name} responsable ?`,
      body: mine
        ? `Vous deviendrez « ${t.roles[role]} ». Si vous n'êtes plus responsable, vous ne pourrez peut-être plus gérer ce groupe.`
        : demote
          ? `${m.name} deviendra « ${t.roles[role]} » et ne pourra plus gérer les membres ni les événements de « ${groupName} ».`
          : `${m.name} pourra gérer les membres et les événements de « ${groupName} ».`,
      confirmLabel: mine ? "Changer mon rôle" : demote ? "Retirer la responsabilité" : "Nommer responsable",
      danger: demote && !mine,
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
          setNotice({ tone: "danger", text: errorText(e, "Impossible de quitter le groupe pour le moment. Vérifiez votre connexion internet, puis réessayez.") });
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
            <CalendarDays className="h-4 w-4" aria-hidden /> {t.words.groupCalendar}
          </Link>
        }
      />
      <LiveRegion tone={notice?.tone === "danger" ? "danger" : "polite"}>{notice?.text}</LiveRegion>
      {notice && (
        <div ref={noticeRef} className="scroll-mt-20 space-y-2">
          <Alert tone={notice.tone}>{notice.text}</Alert>
          {notice.links && <ManualLinks links={notice.links} what={groupName} />}
        </div>
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
            <Field label="Rechercher une personne de l'église" htmlFor="member-search">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input id="member-search" type="search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Prénom ou nom" autoComplete="off" />
              </div>
            </Field>
            {org.loading && !org.data ? (
              <ListSkeleton rows={2} />
            ) : org.error && !org.data ? (
              <p className="text-sm text-muted">
                La liste des personnes de l&apos;église n&apos;a pas pu être chargée.{" "}
                <button type="button" onClick={org.reload} className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
                  Réessayer
                </button>
              </p>
            ) : org.data && org.data.members.length <= 1 ? (
              <p className="text-sm text-pretty">Vous êtes pour l&apos;instant seul dans votre église. Invitez les membres de votre cellule par e-mail ci-dessous.</p>
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
                        await run(() => apiFetch(`/api/groups/${id}/members`, { method: "POST", json: { userId: c.userId, role: "member" } }), `${c.name} fait maintenant partie du groupe.`);
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
            <div className="space-y-2 border-t border-border pt-3">
              <Field
                label="Inviter par e-mail"
                htmlFor="group-emails"
                hint="Une ou plusieurs adresses, séparées par des virgules. Chaque personne reçoit un lien valable 30 jours pour rejoindre l'église et ce groupe."
              >
                <Textarea
                  id="group-emails"
                  rows={2}
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="prenom@exemple.ch, autre@exemple.ch"
                />
              </Field>
              <Button variant="outline" loading={inviting} onClick={inviteByEmail}>
                <Mail className="h-4 w-4" aria-hidden /> Envoyer les invitations
              </Button>
            </div>
            {isAdmin(me.role) && (
              <p className="text-xs text-muted">
                Rôles dans l&apos;église :{" "}
                <Link href="/admin" className="font-medium text-accent underline underline-offset-2">
                  {t.nav.admin}
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
