import { LogoMark, Wordmark } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="mb-6 flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2">
          <LogoMark className="h-9 w-9 text-primary" />
          <Wordmark className="text-2xl" />
        </div>
        <p className="text-sm text-pretty text-muted">Collez un message WhatsApp avec des dates : elles arrivent dans votre agenda, sans conflit.</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-pretty text-muted">
        Vos messages et captures restent privés : ils ne sont jamais publiés et peuvent être supprimés après la lecture.
      </p>
    </main>
  );
}
