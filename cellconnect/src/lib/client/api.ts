"use client";

import { useCallback, useEffect, useState } from "react";

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

/** Appel JSON vers les Route Handlers ; redirige vers la connexion si la session a expiré. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown; idempotencyKey?: string; noAuthRedirect?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let bodyInit = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    bodyInit = JSON.stringify(init.json);
  }
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const res = await fetch(url, { ...init, headers, body: bodyInit, credentials: "same-origin" });
  if (res.status === 401 && !init.noAuthRedirect && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = `/connexion?suite=${encodeURIComponent(window.location.pathname)}`;
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Erreur ${res.status}`, e?.details);
  }
  return data as T;
}

export function useApi<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T | null; error: ApiError | null }>({ key: null, data: null, error: null });
  const key = url ? `${nonce}:${url}` : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const k = `${nonce}:${url}`;
    apiFetch<T>(url)
      .then((data) => !cancelled && setState({ key: k, data, error: null }))
      .catch((e) => !cancelled && setState((prev) => ({ key: k, data: prev.data, error: e instanceof ApiError ? e : new ApiError(0, "network", "Connexion impossible. Vérifiez votre réseau.") })));
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((data: T) => setState((prev) => ({ ...prev, data })), []);
  return { data: state.data, error: state.key === key ? state.error : null, loading: Boolean(url) && state.key !== key, reload, setData };
}

export function newIdempotencyKey() {
  return crypto.randomUUID().replace(/-/g, "");
}
