import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "@/lib/types";
import { notFound } from "@/lib/errors";
import { UniqueViolationError, type Filter, type FilterOp, type NewRow, type Query, type Store } from "./store";

/** Sous-ensemble typé des méthodes de filtre de PostgREST utilisées ici. */
type SimpleOp = Exclude<FilterOp, "in" | "not_is">;
type Filterable = { [O in SimpleOp]: (column: string, value: unknown) => Filterable } & {
  in: (column: string, values: readonly unknown[]) => Filterable;
  not: (column: string, operator: string, value: unknown) => Filterable;
};

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
    // 22P02 : valeur invalide pour le type (ex. identifiant qui n'est pas un UUID) => ressource introuvable.
    if (error.code === "22P02") throw notFound();
    throw new Error(`Supabase ${table}: ${error.message}`);
  }

  /**
   * Applique les filtres au constructeur de requête PostgREST. Le type d'origine
   * (très générique) est conservé en sortie ; seules les méthodes de filtre sont
   * appelées, via l'interface typée `Filterable`.
   */
  private applyFilters<B>(builder: B, where: Filter<unknown>[] = []): B {
    let q = builder as unknown as Filterable;
    for (const [col, op, value] of where) {
      if (op === "not_is") q = q.not(col, "is", value);
      else if (op === "in") q = q.in(col, value as readonly unknown[]);
      else q = q[op](col, value);
    }
    return q as unknown as B;
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

  async updateWhere<K extends TableName>(table: K, where: Filter<Tables[K]>[], patch: Partial<Tables[K]>) {
    if (where.length === 0) throw new Error("updateWhere sans filtre refusé");
    const q = this.applyFilters(this.client.from(table).update(patch as never), where as Filter<unknown>[]);
    const { data, error } = await q.select("*");
    if (error) this.fail(table, error);
    return (data ?? []) as Tables[K][];
  }

  async count<K extends TableName>(table: K, where: Filter<Tables[K]>[] = []) {
    const q = this.applyFilters(this.client.from(table).select("id", { count: "exact", head: true }), where as Filter<unknown>[]);
    const { error, count } = await q;
    if (error) this.fail(table, error);
    return count ?? 0;
  }

  async deleteWhere<K extends TableName>(table: K, where: Filter<Tables[K]>[]) {
    if (where.length === 0) throw new Error("deleteWhere sans filtre refusé");
    const q = this.applyFilters(this.client.from(table).delete({ count: "exact" }), where as Filter<unknown>[]);
    const { error, count } = await q;
    if (error) this.fail(table, error);
    return count ?? 0;
  }
}
