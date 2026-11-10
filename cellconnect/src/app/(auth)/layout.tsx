import { CalendarCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="rounded-xl bg-primary p-2 text-primary-fg">
          <CalendarCheck className="h-6 w-6" aria-hidden />
        </span>
        <span className="text-xl font-semibold tracking-tight">CellConnect AI</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted">
        Vos captures restent privées. Elles ne sont jamais publiées et peuvent être supprimées après analyse.
      </p>
    </main>
  );
}
