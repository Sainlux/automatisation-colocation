import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const dataDir = path.join(os.tmpdir(), `cellconnect-e2e-${process.pid}`);
// E2E_BASE_URL : viser un serveur déjà démarré (ex. mode Supabase) au lieu d'en lancer un en mode local.
const external = process.env.E2E_BASE_URL;
/** Date figée du serveur (lue par serverNow, mode local uniquement) : les années déduites restent stables. */
const TEST_NOW = "2026-11-10T12:00:00Z";
// Navigateur déjà installé sur la machine (ex. /usr/bin/google-chrome) quand ceux de Playwright ne le sont pas.
const executablePath = process.env.E2E_CHROMIUM_PATH;

/** Tests de bout en bout : build de production en mode local (données temporaires). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: external ?? "http://localhost:3200",
    trace: "off",
    locale: "fr-CH",
    timezoneId: "Europe/Zurich",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: external
    ? undefined
    : {
    command: "npx next start -p 3200",
    url: "http://localhost:3200/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: { DATA_BACKEND: "local", DATA_DIR: dataDir, SESSION_SECRET: "e2e-secret", OPENAI_API_KEY: "", SMTP_HOST: "", TEST_NOW },
  },
});
