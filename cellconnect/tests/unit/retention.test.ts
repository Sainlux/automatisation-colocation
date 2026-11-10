import { describe, expect, it } from "vitest";
import { FakeMailer, makeUser, memoryStore, NOW } from "./helpers";
import { purgeDue, purgeExpiredData, retentionPolicy } from "@/lib/retention";

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

describe("Politique de conservation", () => {
  it("purge les données expirées et conserve le reste", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const deleted: string[] = [];
    const old = await store.insert("uploads", { organization_id: u.orgId, user_id: u.userId, kind: "image", mime_type: "image/png", size_bytes: 1, sha256: "x", storage_path: "o/u/old", original_name: null, deleted_at: null, created_at: daysAgo(40) });
    const recent = await store.insert("uploads", { organization_id: u.orgId, user_id: u.userId, kind: "image", mime_type: "image/png", size_bytes: 1, sha256: "y", storage_path: "o/u/new", original_name: null, deleted_at: null, created_at: daysAgo(2) });
    const base = { organization_id: u.orgId, user_id: u.userId, step: "ready" as const, provider: "x", error: null, warnings: [], context_notes: null, attempts: 1, updated_at: NOW.toISOString(), completed_at: null };
    const oldJob = await store.insert("extraction_jobs", { ...base, upload_ids: [old.id], status: "completed", created_at: daysAgo(40) });
    await store.insert("extraction_jobs", { ...base, upload_ids: [recent.id], status: "completed", created_at: daysAgo(2) });
    await store.insert("extracted_events", { job_id: oldJob.id, organization_id: u.orgId, user_id: u.userId, position: 0, raw: {}, draft: {}, status: "created", event_id: null });
    const n = (read: boolean, d: number, k: string) =>
      store.insert("notifications", { user_id: u.userId, organization_id: u.orgId, type: "system", title: "t", body: "b", data: {}, read_at: read ? daysAgo(d) : null, dedupe_key: k, created_at: daysAgo(d) });
    await n(true, 200, "a"); // lue, ancienne → purgée
    await n(false, 200, "b"); // non lue → conservée
    await n(true, 10, "c"); // récente → conservée
    await store.insert("idempotency_keys", { user_id: u.userId, scope: "s", key: "k1", response: {}, created_at: daysAgo(8) });
    await store.insert("audit_logs", { organization_id: u.orgId, actor_id: u.userId, action: "old", entity_type: "x", entity_id: null, metadata: {}, created_at: daysAgo(400) });

    const r = await purgeExpiredData(store, NOW, retentionPolicy(), async (p) => void deleted.push(p));
    expect(r).toMatchObject({ extractions: 1, notifications: 1, idempotency: 1, audit: 1 });
    expect(deleted).toEqual(["o/u/old"]);
    expect(await store.get("uploads", old.id)).toBeNull();
    expect(await store.get("uploads", recent.id)).not.toBeNull();
    expect(await store.select("extracted_events", {})).toHaveLength(0);
    expect((await store.select("notifications", {})).map((x) => x.dedupe_key).sort()).toEqual(["b", "c"]);
    expect(await store.select("audit_logs", { where: [["action", "eq", "account.created"]] })).toHaveLength(1);
  });

  it("au plus une purge par jour", async () => {
    const store = memoryStore();
    expect(await purgeDue(store, NOW)).toBe(true);
    await purgeExpiredData(store, NOW);
    expect(await purgeDue(store, new Date())).toBe(false);
  });

  it("durées configurables", () => {
    process.env.RETENTION_EXTRACTION_DAYS = "7";
    expect(retentionPolicy().extractionDays).toBe(7);
    process.env.RETENTION_EXTRACTION_DAYS = "abc";
    expect(retentionPolicy().extractionDays).toBe(30);
    delete process.env.RETENTION_EXTRACTION_DAYS;
  });
});
