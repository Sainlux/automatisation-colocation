import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "bg-info-bg text-fg border-accent/30", Icon: Info, iconCls: "text-accent" },
  success: { cls: "bg-success-bg text-fg border-success/30", Icon: CircleCheck, iconCls: "text-success" },
  warning: { cls: "bg-warning-bg text-fg border-warning/30", Icon: TriangleAlert, iconCls: "text-warning" },
  danger: { cls: "bg-danger-bg text-fg border-danger/30", Icon: CircleAlert, iconCls: "text-danger" },
};

export function Alert({ tone = "info", title, children, className, action }: { tone?: keyof typeof tones; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const t = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", t.cls, className)}>
      <t.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-fg/90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
