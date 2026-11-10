"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building,
  CalendarDays,
  CalendarX,
  ChevronRight,
  Ellipsis,
  History,
  House,
  LogOut,
  Mail,
  MessageSquarePlus,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, useApi } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState, ListSkeleton, Skeleton } from "@/components/ui/states";
import { LogoMark, Wordmark } from "./logo";
import { plural } from "./format";
import { isAdmin, MeContext, type Counters, type Me } from "./session";

type CounterKey = keyof Counters;
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  counter?: CounterKey;
}

/* Source unique des entrées de navigation : la barre latérale, la barre d'onglets et la feuille « Plus » en dérivent. */
const ITEMS = {
  home: { href: "/", label: t.nav.home, icon: House },
  capture: { href: "/capture", label: t.nav.capture, icon: MessageSquarePlus },
  calendar: { href: "/calendrier", label: t.nav.calendar, icon: CalendarDays },
  conflicts: { href: "/conflits", label: t.nav.conflicts, icon: CalendarX, counter: "conflicts" },
  invitations: { href: "/invitations", label: t.nav.invitations, icon: Mail, counter: "invitations" },
  notifications: { href: "/notifications", label: t.nav.notifications, icon: Bell, counter: "notifications" },
  groups: { href: "/groupes", label: t.nav.groups, icon: Users },
  settings: { href: "/parametres", label: t.nav.settings, icon: Settings },
  history: { href: "/historique", label: t.nav.history, icon: History },
  admin: { href: "/admin", label: t.nav.admin, icon: Building },
} satisfies Record<string, NavItem>;

const TODO_TITLE = "À traiter";
const CHURCH: NavItem[] = [ITEMS.invitations, ITEMS.groups];
const accountItems = (admin: boolean): NavItem[] => [ITEMS.settings, ITEMS.history, ...(admin ? [ITEMS.admin] : [])];

/** Sections de la barre latérale (ordinateur). */
function sidebarSections(admin: boolean): { title?: string; items: NavItem[] }[] {
  const todo: NavItem[] = [ITEMS.conflicts, ITEMS.invitations, ITEMS.notifications];
  return [
    { items: [ITEMS.home, ITEMS.capture, ITEMS.calendar] },
    { title: TODO_TITLE, items: todo },
    { title: t.moreSheet.church, items: CHURCH.filter((i) => !todo.includes(i)) },
    { title: t.moreSheet.account, items: accountItems(admin) },
  ];
}

/** Onglets de la barre du bas (mobile), avant le bouton « Plus ». */
const TABS: NavItem[] = [ITEMS.home, ITEMS.calendar, { ...ITEMS.capture, label: t.nav.captureShort }, ITEMS.conflicts];

/** Parcours focalisé : pendant la vérification d'un import, la barre d'onglets disparaît. */
const isFocusedFlow = (path: string) => /^\/capture\/[^/]+$/.test(path) && path !== "/capture/partage";

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** Texte lu par les lecteurs d'écran à côté d'un compteur. */
function counterText(key: CounterKey, n: number) {
  if (key === "conflicts") return `${n} à résoudre`;
  if (key === "invitations") return `${n} en attente`;
  return plural(n, "non lue", "non lues");
}

const capCount = (n: number) => (n > 9 ? "9+" : String(n));

/** Pastille chiffrée décorative (le nombre est porté par le nom accessible du lien). */
function CountBadge({ n, tone, className }: { n: number; tone: "danger" | "warning"; className?: string }) {
  if (n <= 0) return null;
  return (
    <Badge
      aria-hidden
      size="count"
      tone={tone === "danger" ? "solidDanger" : undefined}
      className={cn(tone === "warning" && "bg-warning text-warning-fg", className)}
    >
      {capCount(n)}
    </Badge>
  );
}

const counterTone = (key: CounterKey) => (key === "conflicts" ? "warning" : "danger");

const ZERO: Counters = { notifications: 0, conflicts: 0, invitations: 0 };
/** Délai minimal entre deux rafraîchissements des compteurs au retour sur l'application. */
const WAKE_THROTTLE_MS = 60_000;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me, error, reload } = useApi<Me>("/api/me");
  const [counters, setCountersState] = useState<Counters>(ZERO);
  const [moreOpen, setMoreOpen] = useState(false);
  const focused = isFocusedFlow(path);

  // Toute navigation (lien, bouton retour du navigateur) referme la feuille « Plus ».
  const [sheetPath, setSheetPath] = useState(path);
  if (sheetPath !== path) {
    setSheetPath(path);
    setMoreOpen(false);
  }

  // Service worker : notifications push et partage vers l'application (PWA).
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // Le chemin courant est lu au moment du chargement, sans relancer l'effet à chaque navigation.
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const [tick, setTick] = useState(0);
  const refreshCounters = useCallback(() => setTick((n) => n + 1), []);
  const setCounters = useCallback((patch: Partial<Counters>) => setCountersState((prev) => ({ ...prev, ...patch })), []);

  const lastLoad = useRef(0);
  const loadSeq = useRef(0);
  const loadCounters = useCallback(() => {
    const seq = ++loadSeq.current;
    lastLoad.current = Date.now();
    // Sur l'accueil, la page charge déjà /api/dashboard et pousse ses chiffres via setCounters.
    const onHome = pathRef.current === "/";
    Promise.all([
      onHome ? Promise.resolve(null) : apiFetch<{ openConflicts: number; pendingInvitations: number }>("/api/dashboard"),
      apiFetch<{ unread: number }>("/api/notifications"),
    ])
      .then(([d, n]) => {
        if (seq !== loadSeq.current) return; // une réponse plus récente est déjà partie
        setCountersState((prev) => ({
          notifications: n.unread,
          conflicts: d ? d.openConflicts : prev.conflicts,
          invitations: d ? d.pendingInvitations : prev.invitations,
        }));
      })
      .catch(() => undefined); // compteurs non bloquants
  }, []);

  useEffect(() => {
    loadCounters();
  }, [tick, loadCounters]);

  // Retour sur l'application (onglet visible, fenêtre active) : rafraîchit au plus une fois par minute.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current >= WAKE_THROTTLE_MS) loadCounters();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [loadCounters]);

  const ctx = useMemo(() => (me ? { me, reload, counters, refreshCounters, setCounters } : null), [me, reload, counters, refreshCounters, setCounters]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/connexion";
  }

  const admin = me ? isAdmin(me.role) : false;
  const closeMore = () => setMoreOpen(false);
  // L'onglet « Plus » est actif quand la page courante fait partie de la feuille.
  const moreActive = moreOpen || [...CHURCH, ...accountItems(admin)].some((i) => isActive(path, i.href));
  const bellCount = counters.notifications + counters.invitations;
  const bellParts = [
    counters.notifications > 0 && plural(counters.notifications, "notification non lue", "notifications non lues"),
    counters.invitations > 0 && plural(counters.invitations, "invitation en attente", "invitations en attente"),
  ].filter(Boolean);
  const bellLabel = `${t.nav.notifications} : ${bellParts.length ? bellParts.join(", ") : "rien de nouveau"}`;

  const content = error && !me ? (
    <ErrorState status={error.status} message={error.message} onRetry={reload} />
  ) : ctx ? (
    children
  ) : (
    <div aria-busy="true" className="space-y-5">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <ListSkeleton rows={3} />
    </div>
  );

  const frame = (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-card focus:p-3">
        Aller au contenu
      </a>
      <div className="lg:flex">
        {/* Barre latérale (ordinateur) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <Link href="/" className="flex items-center gap-2 px-5 py-5" aria-label={`${t.app.name}, ${t.nav.home}`}>
            <LogoMark className="h-7 w-7 text-primary" />
            <Wordmark />
          </Link>
          <nav aria-label="Navigation principale" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {sidebarSections(admin).map((section, si) =>
              section.items.length ? (
                <div key={section.title ?? si}>
                  {section.title && <h2 className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">{section.title}</h2>}
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(path, item.href);
                      const primary = item.href === ITEMS.capture.href;
                      const n = item.counter ? counters[item.counter] : 0;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-(--dur-fast)",
                              primary
                                ? "my-1 bg-primary font-medium text-primary-fg shadow-sm hover:bg-primary-hover"
                                : "text-muted hover:bg-subtle hover:text-fg",
                              !primary && active && "bg-subtle font-medium text-fg",
                              primary && active && "ring-2 ring-ring ring-offset-2 ring-offset-card",
                            )}
                          >
                            <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {item.counter && n > 0 && (
                              <>
                                <span className="sr-only"> ({counterText(item.counter, n)})</span>
                                <CountBadge n={n} tone={counterTone(item.counter)} />
                              </>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </nav>
          <div className="border-t border-border p-3">
            {me ? (
              <>
                <p className="truncate px-3 text-sm font-medium">{me.profile.display_name}</p>
                <p className="truncate px-3 text-xs text-muted">{me.organization?.name}</p>
              </>
            ) : (
              <div className="space-y-2 px-3 py-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            )}
            <button onClick={logout} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-subtle hover:text-fg">
              <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* En-tête mobile */}
          <header className="sticky top-0 z-20 border-b border-border bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
            <div className="flex h-14 items-center justify-between pr-2 pl-4">
              <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl" aria-label={`${t.app.name}, ${t.nav.home}`}>
                <LogoMark className="h-7 w-7 text-primary" />
                <Wordmark />
              </Link>
              <Link
                href="/notifications"
                aria-label={bellLabel}
                aria-current={isActive(path, "/notifications") ? "page" : undefined}
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-fg hover:bg-subtle"
              >
                <Bell className="h-6 w-6" aria-hidden />
                <CountBadge n={bellCount} tone="danger" className="absolute -top-0.5 -right-0.5 ring-2 ring-card" />
              </Link>
            </div>
          </header>

          <main
            id="contenu"
            aria-busy={!me && !error ? true : undefined}
            className={cn("mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6 lg:pt-8 lg:pb-10", focused ? "pb-24" : "pb-[calc(var(--bottom-nav-h)+5rem)]")}
          >
            {content}
          </main>
        </div>
      </div>

      {/* Barre d'onglets (mobile), absente pendant la vérification d'un import. */}
      {!focused && (
        <nav id="bottom-nav" aria-label="Navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <ul className="grid h-16 grid-cols-5">
            {TABS.map((item) => {
              const active = isActive(path, item.href);
              const n = item.counter ? counters[item.counter] : 0;
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.counter && n > 0 ? `${item.label} (${counterText(item.counter, n)})` : undefined}
                    className={cn("flex h-full flex-col items-center justify-center gap-0.5 px-0.5 text-xs text-muted", active && "font-semibold text-primary")}
                  >
                    <TabIcon icon={item.icon} active={active}>
                      {item.counter && <CountBadge n={n} tone={counterTone(item.counter)} className="absolute -top-1 right-1 ring-2 ring-card" />}
                    </TabIcon>
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-label={counters.invitations > 0 ? `${t.nav.more} (${plural(counters.invitations, "invitation en attente", "invitations en attente")})` : undefined}
                className={cn("flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 text-xs text-muted", moreActive && "font-semibold text-primary")}
              >
                <TabIcon icon={Ellipsis} active={moreActive}>
                  {counters.invitations > 0 && (
                    <Badge aria-hidden tone="danger" variant="dot" className="absolute top-0.5 right-3 ring-2 ring-card">
                      {t.nav.invitations}
                    </Badge>
                  )}
                </TabIcon>
                <span className="max-w-full truncate">{t.nav.more}</span>
              </button>
            </li>
          </ul>
        </nav>
      )}

      <Sheet
        open={moreOpen && !focused}
        onClose={closeMore}
        title={t.moreSheet.title}
        footer={
          <Button variant="ghost" className="w-full text-danger hover:bg-danger-bg" onClick={logout}>
            <LogOut className="h-5 w-5" aria-hidden /> Se déconnecter
          </Button>
        }
      >
        {me && (
          <div className="flex items-center gap-3 rounded-xl bg-subtle p-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-fg">
              {(me.profile.display_name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{me.profile.display_name}</p>
              <p className="text-xs text-muted">
                {[me.organization?.name, t.roles[me.role]].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        )}
        <SheetSection title={t.moreSheet.church} items={CHURCH} path={path} counters={counters} onNavigate={closeMore} />
        <SheetSection title={t.moreSheet.account} items={accountItems(admin)} path={path} counters={counters} onNavigate={closeMore} />
      </Sheet>
    </>
  );

  // Toujours le même arbre : le cadre n'est pas remonté quand le profil arrive.
  return <MeContext value={ctx}>{frame}</MeContext>;
}

/** Icône d'onglet ; l'onglet actif est marqué par une pastille derrière l'icône (façon iOS). */
function TabIcon({ icon: Icon, active, children }: { icon: LucideIcon; active: boolean; children?: React.ReactNode }) {
  return (
    <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-(--dur-fast)", active && "bg-primary/10")}>
      <Icon className="h-6 w-6" aria-hidden />
      {children}
    </span>
  );
}

function SheetSection({ title, items, path, counters, onNavigate }: { title: string; items: NavItem[]; path: string; counters: Counters; onNavigate: () => void }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const n = item.counter ? counters[item.counter] : 0;
          const active = isActive(path, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-base hover:bg-subtle", active && "bg-subtle font-medium")}
              >
                <item.icon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.counter && n > 0 && (
                  <>
                    <span className="sr-only"> ({counterText(item.counter, n)})</span>
                    <CountBadge n={n} tone={counterTone(item.counter)} />
                  </>
                )}
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
