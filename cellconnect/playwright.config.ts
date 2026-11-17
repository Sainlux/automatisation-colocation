import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { TEST_NOW } from "./tests/e2e/constants";

const dataDir = path.join(os.tmpdir(), `cellconnect-e2e-${process.pid}`);
// E2E_BASE_URL : viser un serveur déjà démarré (ex. mode Supabase) au lieu d'en lancer un en mode local.
const external = process.env.E2E_BASE_URL;
const CI = !!process.env.CI;
// Navigateur déjà installé sur la machine (ex. /usr/bin/google-chrome) quand ceux de Playwright ne le sont pas.
const executablePath = process.env.E2E_CHROMIUM_PATH;

/** Tests de bout en bout : build de production en mode local (données temporaires). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  // En intégration continue : un test.only oublié fait échouer la suite, une seule reprise, rapport HTML conservé.
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? "http://localhost:3200",
    trace: CI ? "retain-on-failure" : "off",
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
    env: { DATA_BACKEND: "local", DATA_DIR: dataDir, SESSION_SECRET: "e2e-secret", OPENAI_API_KEY: "", SMTP_HOST: "", TEST_NOW, TRUST_REAL_IP: "1" },
  },
});
