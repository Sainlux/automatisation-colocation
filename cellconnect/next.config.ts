import type { NextConfig } from "next";

/**
 * CellConnect AI — configuration Next.js.
 *
 * Les pages applicatives sont rendues côté client et consomment les Route
 * Handlers (/api/*). Toutes les données sont liées à la session : on ne
 * pré-rend donc rien de personnalisé et on n'active pas Cache Components.
 */
const isProd = process.env.NODE_ENV === "production";

/**
 * Politique de sécurité du contenu (production uniquement : le serveur de
 * développement a besoin d'eval et de WebSocket). 'unsafe-inline' reste
 * nécessaire aux scripts d'hydratation de Next.js sans nonce.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "worker-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Le dépôt contient une autre application à la racine : on fixe la racine du projet.
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["nodemailer", "@electric-sql/pglite"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          ...(isProd
            ? [
                { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
                { key: "Content-Security-Policy", value: CSP },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
