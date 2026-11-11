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
  microsoft: {
    get clientId() {
      return read("MS_CLIENT_ID");
    },
    get clientSecret() {
      return read("MS_CLIENT_SECRET");
    },
    get tenant() {
      return read("MS_TENANT") ?? "common";
    },
    get configured() {
      return Boolean(read("MS_CLIENT_ID") && read("MS_CLIENT_SECRET") && read("TOKEN_ENCRYPTION_KEY"));
    },
  },
  zoom: {
    get clientId() {
      return read("ZOOM_CLIENT_ID");
    },
    get clientSecret() {
      return read("ZOOM_CLIENT_SECRET");
    },
    get configured() {
      return Boolean(read("ZOOM_CLIENT_ID") && read("ZOOM_CLIENT_SECRET") && read("TOKEN_ENCRYPTION_KEY"));
    },
  },
  /** Les webhooks exigent une URL publique en https. */
  get webhooksEnabled() {
    return (read("APP_URL") ?? "").startsWith("https://");
  },
  push: {
    get publicKey() {
      return read("VAPID_PUBLIC_KEY");
    },
    get privateKey() {
      return read("VAPID_PRIVATE_KEY");
    },
    get subject() {
      return read("VAPID_SUBJECT") ?? "mailto:admin@cellconnect.local";
    },
    get configured() {
      return Boolean(read("VAPID_PUBLIC_KEY") && read("VAPID_PRIVATE_KEY"));
    },
  },
  /** Réception de messages à analyser (transfert d'e-mail, bot Telegram). */
  inbound: {
    email: {
      /** Domaine qui reçoit les e-mails transférés (ex. in.cellconnect.ch), relié au fournisseur entrant. */
      get domain() {
        return read("INBOUND_EMAIL_DOMAIN")?.toLowerCase();
      },
      /** Clé qui signe l'adresse personnelle de chaque utilisateur. */
      get secret() {
        return read("INBOUND_EMAIL_SECRET");
      },
      /** Jeton attendu dans l'URL du webhook appelé par le fournisseur (Postmark, Mailgun, SendGrid…). */
      get webhookToken() {
        return read("INBOUND_EMAIL_WEBHOOK_TOKEN");
      },
      get configured() {
        return Boolean(read("INBOUND_EMAIL_DOMAIN") && (read("INBOUND_EMAIL_SECRET") ?? "").length >= 16 && (read("INBOUND_EMAIL_WEBHOOK_TOKEN") ?? "").length >= 16);
      },
    },
    telegram: {
      get botToken() {
        return read("TELEGRAM_BOT_TOKEN");
      },
      get botUsername() {
        return read("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "");
      },
      /** Valeur envoyée par Telegram dans l'en-tête X-Telegram-Bot-Api-Secret-Token. */
      get webhookSecret() {
        return read("TELEGRAM_WEBHOOK_SECRET");
      },
      get configured() {
        return Boolean(read("TELEGRAM_BOT_TOKEN") && read("TELEGRAM_BOT_USERNAME") && /^[A-Za-z0-9_-]{16,256}$/.test(read("TELEGRAM_WEBHOOK_SECRET") ?? ""));
      },
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
    outlook: env.microsoft.configured ? { available: true } : { available: false, reason: "Identifiants Microsoft non configurés (MS_CLIENT_ID, MS_CLIENT_SECRET)" },
    zoom: env.zoom.configured ? { available: true } : { available: false, reason: "Identifiants Zoom non configurés (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)" },
    push: env.push.configured ? { available: true } : { available: false, reason: "Clés VAPID non configurées (npm run vapid)" },
    inboundEmail: env.inbound.email.configured
      ? { available: true }
      : { available: false, reason: "Réception d'e-mails non configurée (INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_SECRET, INBOUND_EMAIL_WEBHOOK_TOKEN)" },
    telegram: env.inbound.telegram.configured
      ? { available: true }
      : { available: false, reason: "Bot Telegram non configuré (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET)" },
  };
}
