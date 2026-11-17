import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { __setStoreForTests } from "@/lib/db";
import { GET as cronTick } from "@/app/api/cron/tick/route";

/** /api/cron/tick : appelé par Vercel Cron ou un planificateur externe avec Authorization: Bearer <CRON_SECRET>. */
const dataDir = mkdtempSync(path.join(tmpdir(), "cc-cron-"));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const SECRET = "secret-cron-de-test-1234567890";

function call(authorization?: string, query = "") {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return cronTick(new NextRequest(`http://localhost/api/cron/tick${query}`, { headers }));
}

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "local");
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("CRON_SECRET", SECRET);
  // Nouveau stockage local (fichier dans DATA_DIR) à chaque test.
  __setStoreForTests(null as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  __setStoreForTests(null as never);
});

describe("/api/cron/tick", () => {
  it("401 si CRON_SECRET est vide, même avec « Bearer  » sans valeur", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const auth of [undefined, "", "Bearer ", "Bearer  ", "Bearer undefined"]) {
      const res = await call(auth);
      expect(res.status, `en-tête ${JSON.stringify(auth)}`).toBe(401);
    }
  });

  it("401 sans en-tête ou avec un mauvais secret", async () => {
    for (const auth of [undefined, "", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `bearer ${SECRET}`, `Basic ${SECRET}`]) {
      const res = await call(auth);
      expect(res.status, `en-tête ${JSON.stringify(auth)}`).toBe(401);
    }
    const res = await call(`Bearer mauvais`);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("200 avec le bon secret (stockage local vide), avec ou sans ?pull=1", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pulled: 0 });

    const pulled = await call(`Bearer ${SECRET}`, "?pull=1");
    expect(pulled.status).toBe(200);
    expect(await pulled.json()).toMatchObject({ pulled: 0 });
  });
});
