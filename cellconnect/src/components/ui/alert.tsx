import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Règle : au plus un encadré coloré visible par écran.
 * Les autres messages passent en size="compact" ou dans un <Disclosure>.
 * - danger  : vraie erreur ou échec ; warning : à relire, chevauchement (une décision, pas une erreur).
 * - live    : à activer seulement pour un message qui apparaît après une action
 *             (role="alert" pour danger, role="status" sinon). Par défaut, aucun rôle.
 *
 * Exemple : <Alert tone="warning" size="compact">2 dates sont à relire.</Alert>
 */
const tones = {
  info: { cls: "bg-info-bg text-fg border-accent/30", Icon: Info, iconCls: "text-accent" },
  success: { cls: "bg-success-bg text-fg border-success/30", Icon: CircleCheck, iconCls: "text-success" },
  warning: { cls: "bg-warning-bg text-fg border-warning/30", Icon: TriangleAlert, iconCls: "text-warning" },
  danger: { cls: "bg-danger-bg text-fg border-danger/30", Icon: CircleAlert, iconCls: "text-danger" },
};

export function Alert({
  tone = "info",
  size = "default",
  live = false,
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof tones;
  size?: "default" | "compact";
  live?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const t = tones[tone];
  const compact = size === "compact";
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn("flex rounded-xl border", compact ? "gap-2 p-2 text-xs" : "gap-3 p-3 text-sm", t.cls, className)}
    >
      <t.Icon className={cn("shrink-0", compact ? "mt-px h-4 w-4" : "mt-0.5 h-5 w-5", t.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1 wrap-anywhere">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "leading-relaxed text-fg/90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
