"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Messages affichés quand le serveur n'a pas donné d'explication exploitable. */
export const NETWORK_MESSAGE = "Pas de connexion. Vérifiez votre connexion internet, puis réessayez.";
const SERVER_DOWN_MESSAGE = "Le service ne répond pas. Réessayez dans un instant.";
const GENERIC_MESSAGE = "Action impossible pour le moment. Réessayez.";

/* ───────────── Cache des lectures (stale-while-revalidate) ───────────── */

/** Durée pendant laquelle une lecture est considérée comme à jour (aucune nouvelle requête). */
export const CACHE_TTL_MS = 30_000;

type CacheEntry = { data: unknown; at: number };
const cache = new Map<string, CacheEntry>();
/** Requêtes GET en cours, partagées entre composants qui lisent la même adresse. */
const inflight = new Map<string, Promise<unknown>>();
/**
 * Génération du cache : augmente à chaque invalidation. Une lecture partie avant une
 * modification, une invalidation ou une déconnexion n'écrit plus son résultat dans le cache
 * (sinon elle y remettrait une donnée périmée, ou celle d'un autre compte, marquée « fraîche »).
 */
let generation = 0;

/** Donnée en cache pour une adresse (avec son âge), ou undefined. */
export function peekCache<T>(url: string, now = Date.now()): { data: T; fresh: boolean } | undefined {
  const e = cache.get(url);
  return e ? { data: e.data as T, fresh: now - e.at < CACHE_TTL_MS } : undefined;
}

export function writeCache(url: string, data: unknown, now = Date.now()) {
  cache.set(url, { data, at: now });
}

/** Supprime du cache toutes les adresses qui commencent par `prefix` (ex. « /api/events »). */
export function invalidate(prefix: string) {
  generation += 1;
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/** Vide tout le cache (déconnexion, changement d'église). */
export function clearApiCache() {
  generation += 1;
  cache.clear();
  inflight.clear();
}

/** Après une modification : les données restent affichables, mais seront relues à la prochaine visite. */
function markAllStale() {
  generation += 1;
  for (const e of cache.values()) e.at = 0;
  inflight.clear();
}

/* ───────────── Appels ───────────── */

/** Appel JSON vers les Route Handlers ; redirige vers la connexion si la session a expiré. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown; idempotencyKey?: string; noAuthRedirect?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let bodyInit = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    bodyInit = JSON.stringify(init.json);
  }
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body: bodyInit, credentials: "same-origin" });
  } catch (e) {
    // fetch ne lève une TypeError que si la requête n'a pas pu partir (hors ligne, DNS, coupure).
    if (e instanceof TypeError) throw new ApiError(0, "network", NETWORK_MESSAGE);
    throw e;
  }
  if (res.status === 401 && !init.noAuthRedirect && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = `/connexion?suite=${encodeURIComponent(window.location.pathname)}`;
  }
  const ct = res.headers.get("content-type") ?? "";
  let data: unknown = null;
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null; // corps illisible : traité comme une réponse sans JSON
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const fallback = res.status >= 500 ? SERVER_DOWN_MESSAGE : GENERIC_MESSAGE;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? fallback, e?.details);
  }
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") markAllStale();
  return data as T;
}

/**
 * Texte d'erreur à montrer à l'utilisateur : le message du serveur suivi des précisions
 * de validation (details[].message). Une erreur JavaScript brute n'est jamais affichée
 * (message technique, souvent en anglais) : on montre alors `fallback`.
 */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const extra = Array.isArray(e.details)
    ? e.details
        .map((d) => (d && typeof d === "object" && typeof (d as { message?: unknown }).message === "string" ? (d as { message: string }).message.trim() : ""))
        .filter((m) => m && m !== e.message)
    : [];
  return [e.message || fallback, ...extra].join(" ");
}

/** Lecture GET partagée : une seule requête en vol par adresse ; le résultat alimente le cache. */
function cachedGet<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const gen = generation;
  const p = apiFetch<T>(url)
    .then((data) => {
      if (gen === generation) writeCache(url, data);
      return data;
    })
    .finally(() => {
      if (inflight.get(url) === p) inflight.delete(url);
    });
  inflight.set(url, p);
  return p;
}

/**
 * Lecture d'une adresse de l'API, avec cache « stale-while-revalidate » :
 * - donnée en cache depuis moins de 30 s : affichée sans nouvelle requête ;
 * - donnée plus ancienne : affichée tout de suite (pas de squelette), puis relue en arrière-plan ;
 * - reload() relit toujours le serveur.
 * `loading` reste vrai tant qu'une requête est en cours ; les pages n'affichent un squelette
 * que si `loading && !data`.
 */
export function useApi<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string | null; url: string | null; data: T | null; error: ApiError | null }>({ key: null, url: null, data: null, error: null });
  const key = url ? `${nonce}:${url}` : null;
  const lastNonce = useRef(nonce);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const k = `${nonce}:${url}`;
    const forced = lastNonce.current !== nonce;
    lastNonce.current = nonce;
    const hit = peekCache<T>(url);
    // Toujours asynchrone : l'état n'est jamais modifié pendant l'exécution de l'effet.
    const p = hit?.fresh && !forced ? Promise.resolve(hit.data) : cachedGet<T>(url);
    p.then((data) => !cancelled && setState({ key: k, url, data, error: null })).catch(
      (e) =>
        !cancelled &&
        setState((prev) => ({ key: k, url: prev.url, data: prev.data, error: e instanceof ApiError ? e : new ApiError(0, "network", NETWORK_MESSAGE) })),
    );
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (data: T) => {
      if (url) writeCache(url, data);
      setState((prev) => ({ ...prev, url, data }));
    },
    [url],
  );

  // Donnée de l'adresse courante si on l'a déjà ; sinon le cache ; sinon la précédente (changement de filtre).
  const cached = url && state.url !== url ? peekCache<T>(url)?.data : undefined;
  const data = url && state.url === url ? state.data : (cached ?? state.data);
  return { data, error: state.key === key ? state.error : null, loading: Boolean(url) && state.key !== key, reload, setData };
}

export function newIdempotencyKey() {
  return crypto.randomUUID().replace(/-/g, "");
}
