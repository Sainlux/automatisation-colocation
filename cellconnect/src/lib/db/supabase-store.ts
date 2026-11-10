import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "@/lib/types";
import { UniqueViolationError, type Filter, type NewRow, type Query, type Store } from "./store";

/**
 * Implémentation Supabase/PostgreSQL de l'interface Store.
 *
 * Utilisée côté serveur uniquement, avec le client « service role ».
 * L'autorisation applicative est vérifiée dans les agents (même code qu'en
 * mode local) ; les politiques RLS des migrations protègent en plus tout
 * accès direct depuis le navigateur avec la clé anonyme.
 */
export class SupabaseStore implements Store {
  constructor(private readonly client: SupabaseClient) {}

  private fail(table: string, error: { code?: string; message: string; details?: string }): never {
    if (error.code === "23505") throw new UniqueViolationError(table, [error.details ?? "?"]);
    throw new Error(`Supabase ${table}: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(q: any, where: Filter<unknown>[] = []) {
    for (const [col, op, value] of where) {
      switch (op) {
        case "eq":
          q = q.eq(col, value);
          break;
        case "neq":
          q = q.neq(col, value);
          break;
        case "in":
          q = q.in(col, value as unknown[]);
          break;
        case "is":
          q = q.is(col, value);
          break;
        case "lt":
          q = q.lt(col, value);
          break;
        case "lte":
          q = q.lte(col, value);
          break;
        case "gt":
          q = q.gt(col, value);
          break;
        case "gte":
          q = q.gte(col, value);
          break;
      }
    }
    return q;
  }

  async select<K extends TableName>(table: K, query: Query<Tables[K]> = {}) {
    let q = this.applyFilters(this.client.from(table).select("*"), query.where as Filter<unknown>[]);
    for (const o of query.order ?? []) q = q.order(o.column, { ascending: o.ascending !== false });
    if (query.limit !== undefined) q = q.limit(query.limit);
    const { data, error } = await q;
    if (error) this.fail(table, error);
    return (data ?? []) as Tables[K][];
  }

  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail(table, error);
    return (data ?? null) as Tables[K] | null;
  }

  async insert<K extends TableName>(table: K, row: NewRow<Tables[K]>) {
    const [r] = await this.insertMany(table, [row]);
    return r;
  }

  async insertMany<K extends TableName>(table: K, rows: NewRow<Tables[K]>[]) {
    if (rows.length === 0) return [];
    const { data, error } = await this.client.from(table).insert(rows as never).select("*");
    if (error) this.fail(table, error);
    return data as Tables[K][];
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const { data, error } = await this.client.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) this.fail(table, error);
    return data as Tables[K];
  }

  async delete<K extends TableName>(table: K, id: string) {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) this.fail(table, error);
  }

  async deleteWhere<K extends TableName>(table: K, where: Filter<Tables[K]>[]) {
    if (where.length === 0) throw new Error("deleteWhere sans filtre refusé");
    const q = this.applyFilters(this.client.from(table).delete({ count: "exact" }), where as Filter<unknown>[]);
    const { error, count } = await q;
    if (error) this.fail(table, error);
    return count ?? 0;
  }
}
