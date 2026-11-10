import "server-only";

/**
 * Lecture centralisée des variables d'environnement.
 * Aucun secret n'est jamais exposé au navigateur : seules les variables
 * préfixées NEXT_PUBLIC_ le seraient, et on n'en utilise que pour Supabase
 * (URL + clé anonyme, publiques par conception).
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export type DataBackend = "local" | "supabase";

export const env = {
  get dataBackend(): DataBackend {
    const explicit = read("DATA_BACKEND");
    if (explicit === "local" || explicit === "supabase") return explicit;
    return read("NEXT_PUBLIC_SUPABASE_URL") && read("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : "local";
  },
  get dataDir(): string {
    return read("DATA_DIR") ?? ".data";
  },
  get sessionSecret(): string {
    const s = read("SESSION_SECRET");
    if (s) return s;
    if (process.env.NODE_ENV === "production" && this.dataBackend === "local") {
      throw new Error("SESSION_SECRET est obligatoire en production (mode local).");
    }
    // Clé de développement uniquement — jamais utilisée en production.
    return "dev-only-insecure-session-secret-change-me";
  },
  get encryptionKey(): string | undefined {
    return read("TOKEN_ENCRYPTION_KEY");
  },
  get appUrl(): string {
    return read("APP_URL") ?? "http://localhost:3000";
  },
  get defaultTimezone(): string {
    return read("DEFAULT_TIMEZONE") ?? "Europe/Zurich";
  },
  supabase: {
    get url() {
      return read("NEXT_PUBLIC_SUPABASE_URL");
    },
    get anonKey() {
      return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    },
    get serviceRoleKey() {
      return read("SUPABASE_SERVICE_ROLE_KEY");
    },
    get bucket() {
      return read("SUPABASE_CAPTURES_BUCKET") ?? "captures";
    },
  },
  openai: {
    get apiKey() {
      return read("OPENAI_API_KEY");
    },
    get model() {
      return read("OPENAI_MODEL") ?? "gpt-4o";
    },
  },
  smtp: {
    get host() {
      return read("SMTP_HOST");
    },
    get port() {
      return Number(read("SMTP_PORT") ?? "587");
    },
    get user() {
      return read("SMTP_USER");
    },
    get pass() {
      return read("SMTP_PASS");
    },
    get from() {
      return read("SMTP_FROM") ?? "CellConnect AI <no-reply@cellconnect.local>";
    },
    get configured() {
      return Boolean(read("SMTP_HOST"));
    },
  },
  google: {
    get clientId() {
      return read("GOOGLE_CLIENT_ID");
    },
    get clientSecret() {
      return read("GOOGLE_CLIENT_SECRET");
    },
    get configured() {
      return Boolean(read("GOOGLE_CLIENT_ID") && read("GOOGLE_CLIENT_SECRET") && read("TOKEN_ENCRYPTION_KEY"));
    },
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  uploads: {
    get maxImageBytes() {
      return Number(read("MAX_IMAGE_BYTES") ?? 10 * 1024 * 1024);
    },
    get maxPdfBytes() {
      return Number(read("MAX_PDF_BYTES") ?? 15 * 1024 * 1024);
    },
    get maxTextChars() {
      return Number(read("MAX_TEXT_CHARS") ?? 20000);
    },
    get maxFilesPerAnalysis() {
      return Number(read("MAX_FILES_PER_ANALYSIS") ?? 5);
    },
  },
};

/** État des intégrations, affiché honnêtement dans l'interface. */
export function integrationStatus() {
  return {
    dataBackend: env.dataBackend,
    ai: env.openai.apiKey ? { available: true, provider: "openai", model: env.openai.model } : { available: false },
    email: { available: env.smtp.configured },
    google: { available: env.google.configured },
    outlook: { available: false, reason: "Prévu pour une version ultérieure" },
    zoom: { available: false, reason: "Prévu pour une version ultérieure" },
    push: { available: false, reason: "Prévu pour une version ultérieure" },
  };
}
