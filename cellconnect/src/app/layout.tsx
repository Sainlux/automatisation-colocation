import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CellConnect AI", template: "%s · CellConnect AI" },
  description: "Vos messages deviennent des dates dans votre agenda.",
  applicationName: "CellConnect AI",
  // iPhone : ouverte depuis l'écran d'accueil, l'application s'affiche sans la barre de Safari.
  appleWebApp: { capable: true, title: "CellConnect", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Contenu jusque sous l'encoche / la barre d'accueil (les marges utilisent env(safe-area-inset-*)).
  viewportFit: "cover",
  // Le clavier virtuel redimensionne la page : les barres collantes restent au-dessus du clavier.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

// Applique le thème avant le rendu (évite le flash) : préférence enregistrée, sinon système.
const themeScript = `(function(){try{var t=localStorage.getItem('cc-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
