import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AppError, notFound } from "@/lib/errors";
import { log } from "@/lib/audit";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/db";
import { requireCtx } from "@/lib/auth/session";
import type { Ctx } from "@/lib/context";
import { UniqueViolationError } from "@/lib/db/store";

/**
 * Enveloppe commune des Route Handlers :
 *  - authentification (session vérifiée côté serveur) ;
 *  - protection CSRF (vérification de l'origine pour les requêtes d'écriture) ;
 *  - limitation de débit (mémoire, par utilisateur et par route) ;
 *  - identifiants d'URL validés (UUID) avant tout accès aux données ;
 *  - erreurs normalisées { error: { code, message, details } }.
 */

// Messages de validation Zod en français (chargé une fois par processus).
z.config(z.locales.fr());

/** Message affiché quand la requête elle-même est inexploitable (origine, JSON, Idempotency-Key). */
export const REQUEST_REJECTED = "La demande n'a pas pu être traitée. Rechargez la page, puis réessayez.";

type Params = Promise<Record<string, string>>;
type Handler<A extends boolean> = (args: { req: NextRequest; params: Record<string, string>; ctx: A extends true ? Ctx : null }) => Promise<Response | unknown>;

interface Options<A extends boolean> {
  auth?: A;
  /** Requêtes max par minute (par utilisateur ou IP). */
  rateLimit?: number;
}

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10000;

export function checkRateLimit(key: string, perMinute: number, now = Date.now(), windowMs = 60000): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  // Réinsertion : l'ordre de la Map reflète le dernier accès (éviction des plus anciennes clés).
  buckets.delete(key);
  if (hits.length >= perMinute) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_BUCKETS) {
    let excess = buckets.size - Math.floor(MAX_BUCKETS * 0.9);
    for (const k of buckets.keys()) {
      if (excess-- <= 0) break;
      buckets.delete(k);
    }
  }
  return true;
}

/**
 * Adresse IP du client. X-Real-IP n'est lue que si un proxy de confiance la
 * pose (env.trustRealIp : Vercel ou TRUST_REAL_IP=1) ; sinon le client pourrait
 * la falsifier. À défaut, l'entrée de X-Forwarded-For ajoutée par le proxy de
 * confiance le plus proche (TRUST_PROXY_HOPS, 1 par défaut) : les valeurs plus
 * à gauche sont fournies par le client et peuvent être falsifiées.
 */
export function clientIp(req: Request, hops = env.trustProxyHops): string {
  if (env.trustRealIp) {
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (chain.length === 0) return "anon";
  return chain[Math.max(0, chain.length - hops)];
}

/**
 * Limitation de débit partagée : en mode Supabase, compteur atomique en base
 * (fonction rate_limit_hit), valable pour toutes les instances serverless.
 * En mode local (une seule instance), compteur en mémoire.
 * En cas d'indisponibilité de la base, repli sur la mémoire (journalisé).
 * La clé (qui contient une IP ou un identifiant) n'est stockée en base que
 * sous forme d'empreinte SHA-256 (minimisation des données).
 */
export async function sharedRateLimit(key: string, perWindow: number, windowSeconds = 60): Promise<boolean> {
  if (env.dataBackend !== "supabase") return checkRateLimit(key, perWindow, Date.now(), windowSeconds * 1000);
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: createHash("sha256").update(key).digest("hex"), p_max: perWindow, p_window_seconds: windowSeconds });
  if (error) {
    log("warn", "rate_limit_fallback", { error: error.message });
    return checkRateLimit(key, perWindow, Date.now(), windowSeconds * 1000);
  }
  return data === true;
}

export function isSameOrigin(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** Réponse d'erreur au format commun { error: { code, message, details } }. */
export function jsonError(status: number, code: string, message: string, details: unknown = null) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return jsonError(e.status, e.code, e.message, e.details ?? null);
  if (e instanceof ZodError) {
    return jsonError(
      400,
      "validation",
      "Certaines informations sont à corriger.",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (e instanceof UniqueViolationError) return jsonError(409, "conflict", "Cet élément existe déjà.");
  log("error", "unhandled_api_error", { error: (e as Error)?.message, stack: (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") });
  return jsonError(500, "internal", "Erreur interne. Réessayez plus tard.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paramètres d'URL `id` ou `…Id` : un identifiant mal formé donne 404 (jamais une erreur SQL). */
export function assertIdParams(params: Record<string, string>) {
  for (const [name, value] of Object.entries(params)) {
    if ((name === "id" || name.endsWith("Id")) && !UUID_RE.test(value)) throw notFound();
  }
}

export function api<A extends boolean = true>(fn: Handler<A>, opts: Options<A> = {}) {
  const auth = opts.auth ?? true;
  return async (req: NextRequest, context: { params: Params }) => {
    try {
      if (!isSameOrigin(req)) throw new AppError(403, "csrf", REQUEST_REJECTED);
      const ctx = auth ? await requireCtx() : null;
      if (opts.rateLimit) {
        const who = ctx?.userId ?? clientIp(req);
        if (!(await sharedRateLimit(`${req.nextUrl.pathname}:${req.method}:${who}`, opts.rateLimit))) {
          throw new AppError(429, "rate_limited", "Trop de requêtes. Patientez une minute.");
        }
      }
      const params = context?.params ? await context.params : {};
      assertIdParams(params);
      const out = await fn({ req, params, ctx: ctx as never });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError(400, "bad_request", REQUEST_REJECTED);
  }
  return schema.parse(json);
}

/**
 * Idempotence : une même clé (en-tête Idempotency-Key) renvoie la réponse
 * déjà calculée au lieu de rejouer l'opération (double clic, réseau instable).
 *
 * La clé est réservée AVANT l'exécution (ligne sans réponse) : deux requêtes
 * simultanées ne peuvent pas exécuter l'opération deux fois. Si l'opération
 * échoue, la réservation est libérée pour permettre un nouvel essai.
 */
export async function idempotent<T>(ctx: Ctx, req: Request, scope: string, fn: () => Promise<T>): Promise<T> {
  const key = req.headers.get("idempotency-key");
  if (!key) return fn();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new AppError(400, "bad_request", REQUEST_REJECTED);
  return runIdempotent(ctx, scope, key, fn, true);
}

/** Au-delà de ce délai, une réservation sans réponse est considérée abandonnée (processus interrompu). */
const STALE_RESERVATION_MS = 5 * 60000;

async function runIdempotent<T>(ctx: Ctx, scope: string, key: string, fn: () => Promise<T>, retryStale: boolean): Promise<T> {
  let reserved;
  try {
    reserved = await ctx.store.insert("idempotency_keys", { user_id: ctx.userId, scope, key, response: null });
  } catch (e) {
    if (!(e instanceof UniqueViolationError)) throw e;
    const [hit] = await ctx.store.select("idempotency_keys", { where: [["user_id", "eq", ctx.userId], ["scope", "eq", scope], ["key", "eq", key]] });
    if (hit && hit.response !== null && hit.response !== undefined) return hit.response as T;
    if (hit && retryStale && Date.parse(hit.created_at) < Date.now() - STALE_RESERVATION_MS) {
      await ctx.store.delete("idempotency_keys", hit.id);
      return runIdempotent(ctx, scope, key, fn, false);
    }
    throw new AppError(409, "in_progress", "Enregistrement déjà en cours.");
  }
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    await ctx.store.delete("idempotency_keys", reserved.id).catch(() => undefined);
    throw e;
  }
  await ctx.store.update("idempotency_keys", reserved.id, { response: (result ?? { ok: true }) as unknown });
  return result;
}
