import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const dataDir = path.join(os.tmpdir(), `cellconnect-e2e-${process.pid}`);
// E2E_BASE_URL : viser un serveur déjà démarré (ex. mode Supabase) au lieu d'en lancer un en mode local.
const external = process.env.E2E_BASE_URL;

/** Tests de bout en bout : build de production en mode local (données temporaires). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: external ?? "http://localhost:3200", trace: "off", locale: "fr-CH", timezoneId: "Europe/Zurich" },
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
    env: { DATA_BACKEND: "local", DATA_DIR: dataDir, SESSION_SECRET: "e2e-secret", OPENAI_API_KEY: "", SMTP_HOST: "" },
  },
});
