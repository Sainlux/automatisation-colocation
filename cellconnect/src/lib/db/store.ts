import type { TableName, Tables } from "@/lib/types";

/**
 * Abstraction minimale d'accès aux données.
 *
 * Deux implémentations :
 *  - LocalStore    : fichier JSON privé (mode démo / développement local) ;
 *  - SupabaseStore : PostgreSQL via Supabase (production).
 *
 * Les services métier (agents) n'utilisent que cette interface, ce qui
 * garantit que les règles d'autorisation et la logique sont identiques dans
 * les deux modes.
 */

export type FilterOp = "eq" | "neq" | "in" | "lt" | "lte" | "gt" | "gte" | "is";
export type Filter<T> = [keyof T & string, FilterOp, unknown];

export interface Query<T> {
  where?: Filter<T>[];
  order?: { column: keyof T & string; ascending?: boolean }[];
  limit?: number;
}

export type NewRow<T> = Omit<T, "id" | "created_at"> & { id?: string; created_at?: string };

export class UniqueViolationError extends Error {
  constructor(
    public table: string,
    public columns: string[],
  ) {
    super(`Violation d'unicité sur ${table}(${columns.join(", ")})`);
  }
}

export interface Store {
  select<K extends TableName>(table: K, query?: Query<Tables[K]>): Promise<Tables[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  insert<K extends TableName>(table: K, row: NewRow<Tables[K]>): Promise<Tables[K]>;
  insertMany<K extends TableName>(table: K, rows: NewRow<Tables[K]>[]): Promise<Tables[K][]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>;
  delete<K extends TableName>(table: K, id: string): Promise<void>;
  deleteWhere<K extends TableName>(table: K, where: Filter<Tables[K]>[]): Promise<number>;
}

/** Contraintes d'unicité, miroir des index UNIQUE SQL (appliquées par LocalStore). */
export const UNIQUE_CONSTRAINTS: Partial<Record<TableName, string[][]>> = {
  profiles: [["email"]],
  local_users: [["email"]],
  organizations: [["slug"]],
  organization_members: [["organization_id", "user_id"]],
  group_members: [["group_id", "user_id"]],
  event_participants: [["event_id", "user_id"]],
  event_occurrences: [["event_id", "starts_at"]],
  invitations: [["token_hash"]],
  push_subscriptions: [["endpoint"]],
  messaging_links: [["channel", "external_id"], ["user_id", "channel"]],
  calendar_conflicts: [["user_id", "event_a_id", "event_b_id", "occurrence_a_start", "occurrence_b_start"]],
  reminders: [["dedupe_key"]],
  notifications: [["dedupe_key"]],
  notification_deliveries: [["notification_id", "channel"]],
  agent_tasks: [["idempotency_key"]],
  idempotency_keys: [["user_id", "scope", "key"]],
  calendar_sync_records: [["connection_id", "event_id"], ["connection_id", "external_id"]],
};

export function matches<T>(row: T, where: Filter<T>[] | undefined): boolean {
  if (!where) return true;
  return where.every(([col, op, value]) => {
    const v = (row as Record<string, unknown>)[col];
    switch (op) {
      case "eq":
        return v === value;
      case "neq":
        return v !== value;
      case "in":
        return Array.isArray(value) && value.includes(v);
      case "is":
        return value === null ? v === null || v === undefined : v === value;
      case "lt":
        return v !== null && v !== undefined && (v as string | number) < (value as string | number);
      case "lte":
        return v !== null && v !== undefined && (v as string | number) <= (value as string | number);
      case "gt":
        return v !== null && v !== undefined && (v as string | number) > (value as string | number);
      case "gte":
        return v !== null && v !== undefined && (v as string | number) >= (value as string | number);
    }
  });
}
