import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TableName, Tables } from "@/lib/types";
import { matches, UNIQUE_CONSTRAINTS, UniqueViolationError, type Filter, type NewRow, type Query, type Store } from "./store";

type Data = { [K in TableName]?: Tables[K][] };

/**
 * Stockage local dans un fichier JSON privé (hors du dossier public).
 * Destiné au développement et à la démonstration mono-instance : les
 * écritures sont sérialisées et le fichier est réécrit de façon atomique.
 * Pour la production, utiliser SupabaseStore.
 */
export class LocalStore implements Store {
  private data: Data = {};
  private loaded = false;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string | null) {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.data = {};
    }
  }

  private async persist() {
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  /** Sérialise les opérations pour éviter les écritures concurrentes. */
  private run<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.chain.then(async () => {
      await this.load();
      return fn();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  private rows<K extends TableName>(table: K): Tables[K][] {
    return ((this.data[table] as Tables[K][] | undefined) ??= [] as Tables[K][]) as Tables[K][];
  }

  private checkUnique<K extends TableName>(table: K, row: Tables[K], ignoreId?: string) {
    for (const cols of UNIQUE_CONSTRAINTS[table] ?? []) {
      const r = row as unknown as Record<string, unknown>;
      if (cols.some((c) => r[c] === null || r[c] === undefined)) continue;
      const clash = this.rows(table).some((other) => {
        const o = other as unknown as Record<string, unknown>;
        return o.id !== ignoreId && cols.every((c) => o[c] === r[c]);
      });
      if (clash) throw new UniqueViolationError(table, cols);
    }
  }

  select<K extends TableName>(table: K, query: Query<Tables[K]> = {}) {
    return this.run(() => {
      let out = this.rows(table).filter((r) => matches(r, query.where));
      for (const o of [...(query.order ?? [])].reverse()) {
        out = [...out].sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[o.column] as string | number;
          const bv = (b as unknown as Record<string, unknown>)[o.column] as string | number;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return o.ascending === false ? -cmp : cmp;
        });
      }
      if (query.limit !== undefined) out = out.slice(0, query.limit);
      return structuredClone(out);
    });
  }

  get<K extends TableName>(table: K, id: string) {
    return this.run(() => {
      const r = this.rows(table).find((x) => (x as { id: string }).id === id);
      return r ? structuredClone(r) : null;
    });
  }

  insert<K extends TableName>(table: K, row: NewRow<Tables[K]>) {
    return this.insertMany(table, [row]).then((r) => r[0]);
  }

  insertMany<K extends TableName>(table: K, rows: NewRow<Tables[K]>[]) {
    return this.run(async () => {
      const now = new Date().toISOString();
      const created: Tables[K][] = [];
      for (const row of rows) {
        const full = { created_at: now, ...row, id: row.id ?? randomUUID() } as unknown as Tables[K];
        if ("updated_at" in (full as object) || table === "events" || table === "profiles") {
          (full as unknown as Record<string, unknown>).updated_at ??= now;
        }
        this.checkUnique(table, full);
        this.rows(table).push(full);
        created.push(full);
      }
      await this.persist();
      return structuredClone(created);
    });
  }

  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    return this.run(async () => {
      const list = this.rows(table);
      const idx = list.findIndex((x) => (x as { id: string }).id === id);
      if (idx < 0) throw new Error(`${table} ${id} introuvable`);
      const next = { ...list[idx], ...patch, id } as Tables[K];
      if ("updated_at" in (list[idx] as object)) (next as unknown as Record<string, unknown>).updated_at = new Date().toISOString();
      this.checkUnique(table, next, id);
      list[idx] = next;
      await this.persist();
      return structuredClone(next);
    });
  }

  delete<K extends TableName>(table: K, id: string) {
    return this.run(async () => {
      const list = this.rows(table);
      const idx = list.findIndex((x) => (x as { id: string }).id === id);
      if (idx >= 0) list.splice(idx, 1);
      await this.persist();
    });
  }

  deleteWhere<K extends TableName>(table: K, where: Filter<Tables[K]>[]) {
    return this.run(async () => {
      const list = this.rows(table);
      const keep = list.filter((r) => !matches(r, where));
      const removed = list.length - keep.length;
      (this.data as Record<string, unknown>)[table] = keep;
      await this.persist();
      return removed;
    });
  }
}
