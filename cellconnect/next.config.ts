import type { NextConfig } from "next";

/**
 * CellConnect AI — configuration Next.js.
 *
 * Les pages applicatives sont rendues côté client et consomment les Route
 * Handlers (/api/*). Toutes les données sont liées à la session : on ne
 * pré-rend donc rien de personnalisé et on n'active pas Cache Components.
 */
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
        ],
      },
    ];
  },
};

export default nextConfig;
