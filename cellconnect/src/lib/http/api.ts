import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "@/lib/errors";
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
 *  - erreurs normalisées { error: { code, message, details } }.
 */

type Params = Promise<Record<string, string>>;
type Handler<A extends boolean> = (args: { req: NextRequest; params: Record<string, string>; ctx: A extends true ? Ctx : null }) => Promise<Response | unknown>;

interface Options<A extends boolean> {
  auth?: A;
  /** Requêtes max par minute (par utilisateur ou IP). */
  rateLimit?: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, perMinute: number, now = Date.now()): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - 60000);
  if (hits.length >= perMinute) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10000) buckets.clear();
  return true;
}

/**
 * Limitation de débit partagée : en mode Supabase, compteur atomique en base
 * (fonction rate_limit_hit), valable pour toutes les instances serverless.
 * En mode local (une seule instance), compteur en mémoire.
 * En cas d'indisponibilité de la base, repli sur la mémoire (journalisé).
 */
export async function sharedRateLimit(key: string, perMinute: number): Promise<boolean> {
  if (env.dataBackend !== "supabase") return checkRateLimit(key, perMinute);
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key.slice(0, 300), p_max: perMinute, p_window_seconds: 60 });
  if (error) {
    log("warn", "rate_limit_fallback", { error: error.message });
    return checkRateLimit(key, perMinute);
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

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation", message: "Données invalides.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (e instanceof UniqueViolationError) return NextResponse.json({ error: { code: "conflict", message: "Cette ressource existe déjà." } }, { status: 409 });
  log("error", "unhandled_api_error", { error: (e as Error)?.message, stack: (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") });
  return NextResponse.json({ error: { code: "internal", message: "Erreur interne. Réessayez plus tard." } }, { status: 500 });
}

export function api<A extends boolean = true>(fn: Handler<A>, opts: Options<A> = {}) {
  const auth = opts.auth ?? true;
  return async (req: NextRequest, context: { params: Params }) => {
    try {
      if (!isSameOrigin(req)) throw new AppError(403, "csrf", "Origine de la requête refusée.");
      const ctx = auth ? await requireCtx() : null;
      if (opts.rateLimit) {
        const who = ctx?.userId ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
        if (!(await sharedRateLimit(`${req.nextUrl.pathname}:${req.method}:${who}`, opts.rateLimit))) {
          throw new AppError(429, "rate_limited", "Trop de requêtes. Patientez une minute.");
        }
      }
      const params = context?.params ? await context.params : {};
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
    throw badRequest("Corps de requête JSON invalide.");
  }
  return schema.parse(json);
}

/**
 * Idempotence : une même clé (en-tête Idempotency-Key) renvoie la réponse
 * déjà calculée au lieu de rejouer l'opération (double clic, réseau instable).
 */
export async function idempotent<T>(ctx: Ctx, req: Request, scope: string, fn: () => Promise<T>): Promise<T> {
  const key = req.headers.get("idempotency-key");
  if (!key) return fn();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw badRequest("Idempotency-Key invalide.");
  const [hit] = await ctx.store.select("idempotency_keys", { where: [["user_id", "eq", ctx.userId], ["scope", "eq", scope], ["key", "eq", key]] });
  if (hit) return hit.response as T;
  const result = await fn();
  try {
    await ctx.store.insert("idempotency_keys", { user_id: ctx.userId, scope, key, response: result as unknown });
  } catch (e) {
    if (!(e instanceof UniqueViolationError)) throw e;
  }
  return result;
}
