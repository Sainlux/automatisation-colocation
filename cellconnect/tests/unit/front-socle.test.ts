import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, CACHE_TTL_MS, clearApiCache, errorText, invalidate, peekCache, writeCache } from "@/lib/client/api";
import { fmtLongDate, fmtTimeRange, REMINDER_PRESETS } from "@/components/app/format";
import { plural } from "@/components/app/text";
import { DEFAULT_REMINDER_OFFSETS } from "@/lib/schemas/reminder";

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("errorText", () => {
  it("renvoie le message d'une ApiError suivi des précisions de validation", () => {
    const e = new ApiError(400, "validation", "Données invalides.", [{ path: "title", message: "Le titre est obligatoire." }, { message: "La date est passée." }]);
    expect(errorText(e, "Repli")).toBe("Données invalides. Le titre est obligatoire. La date est passée.");
  });

  it("ignore des détails sans message ou non tableau", () => {
    expect(errorText(new ApiError(409, "conflict", "Déjà fait.", { foo: 1 }), "Repli")).toBe("Déjà fait.");
    expect(errorText(new ApiError(400, "validation", "Erreur.", [null, 3, { message: 4 }]), "Repli")).toBe("Erreur.");
  });

  it("n'affiche jamais le message d'une erreur JavaScript brute", () => {
    expect(errorText(new TypeError("Cannot read properties of undefined"), "Action impossible.")).toBe("Action impossible.");
    expect(errorText("boom", "Action impossible.")).toBe("Action impossible.");
    expect(errorText(undefined, "Action impossible.")).toBe("Action impossible.");
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearApiCache();
  });

  it("traduit une coupure réseau en ApiError « network » lisible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await apiFetch("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "network", message: "Pas de connexion. Vérifiez votre connexion internet, puis réessayez." });
  });

  it("donne un message adapté quand la réponse d'erreur n'est pas du JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 502, message: "Le service ne répond pas. Réessayez dans un instant." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Too many", { status: 429 })));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ status: 429, message: "Action impossible pour le moment. Réessayez." });
  });

  it("garde le message et les détails envoyés par le serveur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: { code: "validation", message: "Données invalides.", details: [{ message: "Heure de fin avant le début." }] } })));
    const err = await apiFetch("/api/x").catch((e) => e);
    expect(errorText(err, "Repli")).toBe("Données invalides. Heure de fin avant le début.");
  });
});

describe("cache des lectures", () => {
  beforeEach(() => clearApiCache());
  afterEach(() => vi.unstubAllGlobals());

  it("une donnée récente est fraîche, puis périmée après 30 s (mais toujours disponible)", () => {
    writeCache("/api/dashboard", { ok: 1 }, 1_000);
    expect(peekCache("/api/dashboard", 1_000 + CACHE_TTL_MS - 1)).toEqual({ data: { ok: 1 }, fresh: true });
    expect(peekCache("/api/dashboard", 1_000 + CACHE_TTL_MS)).toEqual({ data: { ok: 1 }, fresh: false });
    expect(peekCache("/api/autre")).toBeUndefined();
  });

  it("invalidate supprime seulement les adresses du préfixe ; clearApiCache vide tout", () => {
    writeCache("/api/events?from=1", 1);
    writeCache("/api/events/abc", 2);
    writeCache("/api/groups", 3);
    invalidate("/api/events");
    expect(peekCache("/api/events?from=1")).toBeUndefined();
    expect(peekCache("/api/events/abc")).toBeUndefined();
    expect(peekCache("/api/groups")?.data).toBe(3);
    clearApiCache();
    expect(peekCache("/api/groups")).toBeUndefined();
  });

  it("une modification réussie rend les lectures périmées sans les effacer", async () => {
    writeCache("/api/groups", { groups: [] });
    expect(peekCache("/api/groups")?.fresh).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));
    await apiFetch("/api/groups", { method: "POST", json: { name: "Cellule" } });
    expect(peekCache("/api/groups")).toEqual({ data: { groups: [] }, fresh: false });
  });

  it("une lecture GET ne périme pas le cache", async () => {
    writeCache("/api/groups", { groups: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unread: 0 })));
    await apiFetch("/api/notifications");
    expect(peekCache("/api/groups")?.fresh).toBe(true);
  });
});

describe("formats", () => {
  const tz = "Europe/Zurich";
  /** Les formats utilisent des espaces insécables : on les compare comme des espaces simples. */
  const sp = (s: string | undefined) => s?.replace(/[\u00a0\u202f]/g, " ");

  it("fmtTimeRange signale une fin le lendemain", () => {
    // 22h00 – 01h00 à Zurich (hiver, UTC+1)
    expect(sp(fmtTimeRange("2026-11-20T21:00:00Z", "2026-11-21T00:00:00Z", tz))).toBe("22h00 – 01h00 (lendemain)");
  });

  it("fmtTimeRange : même jour, minuit pile et heures seules restent sans mention", () => {
    expect(sp(fmtTimeRange("2026-11-20T19:30:00Z", "2026-11-20T21:00:00Z", tz))).toBe("20h30 – 22h00");
    // 20h00 – 00h00 : la soirée se termine à minuit, pas « le lendemain ».
    expect(sp(fmtTimeRange("2026-11-20T19:00:00Z", "2026-11-20T23:00:00Z", tz))).toBe("20h00 – 00h00");
    expect(sp(fmtTimeRange("20:30", "22:00", tz))).toBe("20h30 – 22h00");
    expect(sp(fmtTimeRange("2026-11-20T19:30:00Z", null, tz))).toBe("20h30");
  });

  it("fmtTimeRange compare les jours dans le fuseau de l'utilisateur, pas en UTC", () => {
    // 23h30 – 00h30 UTC le même jour UTC… mais à Zurich 00h30 – 01h30 : même jour civil.
    expect(sp(fmtTimeRange("2026-11-20T23:30:00Z", "2026-11-21T00:30:00Z", tz))).toBe("00h30 – 01h30");
  });

  it("fmtLongDate écrit la date en toutes lettres", () => {
    expect(fmtLongDate("2026-11-17", tz)).toBe("mardi 17 novembre 2026");
    expect(fmtLongDate("2026-11-17T23:30:00Z", tz)).toBe("mercredi 18 novembre 2026");
  });

  it("REMINDER_PRESETS contient les délais par défaut, avec un libellé, du plus long au plus court", () => {
    for (const v of DEFAULT_REMINDER_OFFSETS) expect(REMINDER_PRESETS.some((p) => p.value === v)).toBe(true);
    expect(sp(REMINDER_PRESETS.find((p) => p.value === 1440)?.label)).toBe("1 jour avant");
    const values = REMINDER_PRESETS.map((p) => p.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(values.length);
  });

  it("plural (text.ts) accorde sans « (s) »", () => {
    expect(plural(0, "date", "dates")).toBe("0 date");
    expect(plural(1, "date", "dates")).toBe("1 date");
    expect(plural(3, "date", "dates")).toBe("3 dates");
  });
});

describe("service worker (public/sw.js)", () => {
  /** Charge sw.js dans un faux contexte de service worker et renvoie ses écouteurs. */
  async function loadSw() {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    const handlers: Record<string, (e: unknown) => void> = {};
    const puts: string[] = [];
    const cache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn((req: Request | string) => (puts.push(typeof req === "string" ? req : req.url), Promise.resolve())), add: vi.fn().mockResolvedValue(undefined), keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
    const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue([]), delete: vi.fn(), match: vi.fn().mockResolvedValue(undefined) };
    const fakeFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    const self = { location: { origin: "https://app.test" }, addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h), skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: {} };
    new Function("self", "caches", "fetch", code)(self, caches, fakeFetch);
    const dispatchFetch = (url: string, init: { method?: string; mode?: string } = {}) => {
      const respondWith = vi.fn();
      handlers.fetch({ request: { url, method: init.method ?? "GET", mode: init.mode ?? "cors" }, respondWith });
      return respondWith;
    };
    return { dispatchFetch, puts };
  }

  it("ne répond jamais lui-même (ni ne met en cache) une requête /api/*", async () => {
    const { dispatchFetch, puts } = await loadSw();
    expect(dispatchFetch("https://app.test/api/dashboard")).not.toHaveBeenCalled();
    expect(dispatchFetch("https://app.test/api/events?from=1", { mode: "navigate" })).not.toHaveBeenCalled();
    expect(dispatchFetch("https://app.test/api/calendar/export", { mode: "navigate" })).not.toHaveBeenCalled();
    expect(puts.some((u) => u.includes("/api/"))).toBe(false);
  });

  it("sert les fichiers /_next/static depuis le cache et prend en charge les navigations", async () => {
    const { dispatchFetch } = await loadSw();
    expect(dispatchFetch("https://app.test/_next/static/chunks/app.js")).toHaveBeenCalledOnce();
    expect(dispatchFetch("https://app.test/calendrier", { mode: "navigate" })).toHaveBeenCalledOnce();
    expect(dispatchFetch("https://autre.test/x.js")).not.toHaveBeenCalled();
  });
});
