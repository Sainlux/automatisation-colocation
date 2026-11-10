import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Applique réellement les migrations dans PostgreSQL (PGlite, WASM) avec un
 * schéma `auth` minimal identique à celui de Supabase, puis vérifie
 * l'isolation RLS entre organisations.
 */
const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
grant usage on schema public to authenticated;
`;

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ORG_A = "10000000-0000-0000-0000-00000000000a";
const ORG_B = "10000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function asUser(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await db.exec(`
    insert into auth.users values ('${A}', 'a@x.ch'), ('${B}', 'b@x.ch');
    insert into profiles (id, email, display_name) values ('${A}', 'a@x.ch', 'Alice'), ('${B}', 'b@x.ch', 'Bob');
    insert into organizations (id, name, slug, created_by) values ('${ORG_A}', 'Org A', 'a', '${A}'), ('${ORG_B}', 'Org B', 'b', '${B}');
    insert into organization_members (organization_id, user_id, role) values ('${ORG_A}', '${A}', 'org_admin'), ('${ORG_B}', '${B}', 'org_admin');
    insert into events (organization_id, created_by, title, starts_at, ends_at) values
      ('${ORG_A}', '${A}', 'Réunion A', '2027-01-20T20:00Z', '2027-01-20T21:00Z'),
      ('${ORG_B}', '${B}', 'Réunion B', '2027-01-20T20:00Z', '2027-01-20T21:00Z');
  `);
});

describe("migrations SQL", () => {
  it("créent toutes les tables attendues", async () => {
    const r = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = r.rows.map((x) => x.table_name);
    for (const t of [
      "organizations", "organization_members", "profiles", "groups", "group_members", "uploads", "extraction_jobs", "extracted_events",
      "events", "event_occurrences", "event_participants", "invitations", "calendar_connections", "calendar_sync_records",
      "calendar_conflicts", "conflict_resolutions", "event_changes", "reminders", "notifications", "notification_deliveries",
      "agent_tasks", "audit_logs", "idempotency_keys",
    ]) expect(names).toContain(t);
  });

  it("RLS : un utilisateur ne voit que les événements de son organisation", async () => {
    const r = await asUser(A, "select title from events");
    expect(r.rows).toEqual([{ title: "Réunion A" }]);
    const rb = await asUser(B, "select title from events");
    expect(rb.rows).toEqual([{ title: "Réunion B" }]);
  });

  it("RLS : impossible de modifier un événement d'une autre organisation", async () => {
    const r = await asUser(A, "update events set title = 'piraté' where title = 'Réunion B' returning id");
    expect(r.rows).toHaveLength(0);
    const check = await db.query<{ title: string }>("select title from events where organization_id = $1", [ORG_B]);
    expect(check.rows[0].title).toBe("Réunion B");
  });

  it("RLS : impossible de créer un événement dans une autre organisation", async () => {
    await expect(asUser(A, `insert into events (organization_id, created_by, title, starts_at, ends_at) values ('${ORG_B}', '${A}', 'x', now(), now() + interval '1 hour')`)).rejects.toThrow();
  });

  it("contraintes : fin après début, lien https uniquement", async () => {
    await expect(db.exec(`insert into events (organization_id, created_by, title, starts_at, ends_at) values ('${ORG_A}', '${A}', 'x', '2027-01-01T10:00Z', '2027-01-01T09:00Z')`)).rejects.toThrow();
    await expect(db.exec(`insert into events (organization_id, created_by, title, starts_at, ends_at, meeting_url) values ('${ORG_A}', '${A}', 'x', '2027-01-01T10:00Z', '2027-01-01T11:00Z', 'javascript:alert(1)')`)).rejects.toThrow();
  });

  it("anonyme (sans session) : aucune donnée visible", async () => {
    const r = await asUser("", "select count(*)::int as n from events");
    expect(r.rows[0]).toEqual({ n: 0 });
  });
});
