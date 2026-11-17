import "server-only";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { LocalStore } from "./local-store";
import { SupabaseStore } from "./supabase-store";
import type { Store } from "./store";

const g = globalThis as unknown as { __ccStore?: Store; __ccAdmin?: SupabaseClient };

/** Client Supabase « service role » — serveur uniquement, jamais exposé au navigateur. */
export function supabaseAdmin(): SupabaseClient {
  if (!g.__ccAdmin) {
    const { url, serviceRoleKey } = env.supabase;
    if (!url || !serviceRoleKey) throw new Error("Supabase n'est pas configuré.");
    g.__ccAdmin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__ccAdmin;
}

export function getStore(): Store {
  if (!g.__ccStore) {
    g.__ccStore =
      env.dataBackend === "supabase"
        ? new SupabaseStore(supabaseAdmin())
        : new LocalStore(path.resolve(env.dataDir, "cellconnect.json"));
  }
  return g.__ccStore;
}

/** Réservé aux tests. */
export function __setStoreForTests(store: Store) {
  g.__ccStore = store;
}

export type { Store } from "./store";
