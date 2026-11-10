"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Building,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Camera,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { apiFetch, useApi } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { ErrorState, Loading } from "@/components/ui/states";
import { isAdmin, MeContext, type Me } from "./session";

const NAV = [
  { href: "/", label: t.nav.dashboard, icon: LayoutDashboard },
  { href: "/capture", label: t.nav.capture, icon: Camera },
  { href: "/calendrier", label: t.nav.calendar, icon: CalendarDays },
  { href: "/groupes", label: t.nav.groups, icon: Users },
  { href: "/invitations", label: t.nav.invitations, icon: Mail, counter: "invitations" as const },
  { href: "/notifications", label: t.nav.notifications, icon: Bell, counter: "notifications" as const },
  { href: "/conflits", label: t.nav.conflicts, icon: CalendarX, counter: "conflicts" as const },
  { href: "/historique", label: t.nav.history, icon: History },
  { href: "/parametres", label: t.nav.settings, icon: Settings },
];

const MOBILE = [
  { href: "/", label: t.nav.home, icon: LayoutDashboard },
  { href: "/calendrier", label: "Agenda", icon: CalendarDays },
  { href: "/capture", label: "Capture", icon: Camera, primary: true },
  { href: "/conflits", label: "Conflits", icon: CalendarX, counter: "conflicts" as const },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

function CounterBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white", className)} aria-label={`${n} en attente`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me, error, reload } = useApi<Me>("/api/me");
  const [counters, setCounters] = useState({ notifications: 0, conflicts: 0, invitations: 0 });
  const [moreOpen, setMoreOpen] = useState(false);

  const [tick, setTick] = useState(0);
  const refreshCounters = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<{ openConflicts: number; pendingInvitations: number }>("/api/dashboard"), apiFetch<{ unread: number }>("/api/notifications")])
      .then(([d, n]) => !cancelled && setCounters({ conflicts: d.openConflicts, invitations: d.pendingInvitations, notifications: n.unread }))
      .catch(() => undefined); // compteurs non bloquants
    return () => {
      cancelled = true;
    };
  }, [tick, path]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/connexion";
  }

  if (error) return <div className="mx-auto max-w-lg p-6"><ErrorState message={error.message} onRetry={reload} /></div>;
  if (!me) return <Loading />;

  const nav = isAdmin(me.role) ? [...NAV, { href: "/admin", label: t.nav.admin, icon: Building }] : NAV;

  return (
    <MeContext value={{ me, reload, counters, refreshCounters }}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-2">
        Aller au contenu
      </a>
      <div className="lg:flex">
        {/* Barre latérale (ordinateur) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex" aria-label="Navigation principale">
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="rounded-xl bg-primary p-1.5 text-primary-fg">
              <CalendarCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-semibold tracking-tight">CellConnect AI</span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(path, item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg",
                  isActive(path, item.href) && "bg-subtle font-medium text-fg",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
                {"counter" in item && item.counter && <CounterBadge n={counters[item.counter]} />}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border p-3">
            <p className="truncate px-3 text-sm font-medium">{me.profile.display_name}</p>
            <p className="truncate px-3 text-xs text-muted">{me.organization?.name}</p>
            <button onClick={logout} className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-subtle hover:text-fg">
              <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* En-tête mobile */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <CalendarCheck className="h-5 w-5 text-primary" aria-hidden /> CellConnect
            </Link>
            <Link href="/notifications" className="relative rounded-full p-2 hover:bg-subtle" aria-label={`Notifications (${counters.notifications} non lues)`}>
              <Bell className="h-5 w-5" />
              {counters.notifications > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-danger" />}
            </Link>
          </header>

          <main id="contenu" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </div>

      {/* Navigation inférieure (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navigation">
        <ul className="grid grid-cols-5">
          {MOBILE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(path, item.href) ? "page" : undefined}
                className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted", isActive(path, item.href) && "text-primary")}
              >
                {item.primary ? (
                  <span className="-mt-5 rounded-2xl bg-primary p-3 text-primary-fg shadow-lg">
                    <item.icon className="h-5 w-5" aria-hidden />
                  </span>
                ) : (
                  <item.icon className="h-5 w-5" aria-hidden />
                )}
                {item.label}
                {"counter" in item && item.counter && counters[item.counter] > 0 && <span className="absolute right-[30%] top-1.5 h-2 w-2 rounded-full bg-danger" />}
              </Link>
            </li>
          ))}
          <li>
            <button onClick={() => setMoreOpen(true)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted" aria-expanded={moreOpen}>
              <Menu className="h-5 w-5" aria-hidden />
              {t.nav.more}
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Plus de sections">
          <button className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} aria-label="Fermer" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{me.organization?.name}</p>
              <button onClick={() => setMoreOpen(false)} className="rounded-full p-2 hover:bg-subtle" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {nav
                .filter((n) => !MOBILE.some((m) => m.href === n.href))
                .map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setMoreOpen(false)} className="relative flex flex-col items-center gap-1 rounded-2xl bg-subtle p-3 text-center text-xs">
                      <item.icon className="h-5 w-5" aria-hidden />
                      {item.label}
                      {"counter" in item && item.counter && <CounterBadge n={counters[item.counter]} className="absolute right-1 top-1" />}
                    </Link>
                  </li>
                ))}
              <li>
                <button onClick={logout} className="flex w-full flex-col items-center gap-1 rounded-2xl bg-subtle p-3 text-xs">
                  <LogOut className="h-5 w-5" aria-hidden /> Déconnexion
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </MeContext>
  );
}
