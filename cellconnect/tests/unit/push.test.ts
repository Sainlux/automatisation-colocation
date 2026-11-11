import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import * as webpush from "web-push";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece");
import { FakeMailer, makeUser, memoryStore, NOW } from "./helpers";
import { notify, processPendingDeliveries } from "@/lib/agents/notification-agent";
import { setPushSender, type PushSender } from "@/lib/channels/push";

/**
 * Un « service push » local reçoit la requête Web Push réelle (chiffrée
 * aes128gcm + en-têtes VAPID) et la DÉCHIFFRE avec la clé de l'appareil,
 * comme le ferait le navigateur.
 */
const vapid = webpush.generateVAPIDKeys();
const device = createECDH("prime256v1");
device.generateKeys();
const authSecret = randomBytes(16);
const received: { headers: http.IncomingHttpHeaders; payload: unknown }[] = [];
let respondWith = 201;
let server: https.Server;
let endpoint = "";
let agent: https.Agent;

beforeAll(async () => {
  // Certificat auto-signé pour 127.0.0.1, approuvé UNIQUEMENT par l'agent de ce test.
  const dir = mkdtempSync(path.join(os.tmpdir(), "cc-push-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem")], { stdio: "ignore" });
  const cert = readFileSync(path.join(dir, "c.pem"));
  agent = new https.Agent({ ca: cert });
  server = https.createServer({ key: readFileSync(path.join(dir, "k.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const plain = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: device, authSecret: authSecret.toString("base64url") });
      received.push({ headers: req.headers, payload: JSON.parse(plain.toString("utf8")) });
      res.statusCode = respondWith;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  endpoint = `https://127.0.0.1:${(server.address() as { port: number }).port}/push/abc`;
});
afterAll(() => server.close());

// Expéditeur réel (bibliothèque web-push) pointé vers le service local.
const realSender: PushSender = {
  available: true,
  async send(t, payload) {
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(payload), {
        TTL: 60,
        agent,
        vapidDetails: { subject: "mailto:test@exemple.ch", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      });
      return "ok";
    } catch (e) {
      const s = (e as { statusCode?: number }).statusCode;
      if (s === 404 || s === 410) return "gone";
      throw new Error(`Push ${s} ${(e as Error).message}`);
    }
  },
};

describe("Notifications push web", () => {
  it("chiffre, signe (VAPID) et livre la notification ; le contenu est lisible par l'appareil seul", async () => {
    setPushSender(realSender);
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    await store.insert("push_subscriptions", { user_id: u.userId, endpoint, p256dh: device.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url"), user_agent: null, disabled_at: null, last_error: null });
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "reminder", title: "Rappel : Formation", body: "Ce soir 20h30", data: { eventId: "e1" }, dedupeKey: "p1", email: true }, new FakeMailer(), NOW);
    const push = r.deliveries.find((d) => d.channel === "push")!;
    expect(push.status).toBe("sent");
    expect(received).toHaveLength(1);
    expect(received[0].payload).toMatchObject({ title: "Rappel : Formation", body: "Ce soir 20h30", url: "/evenements/e1" });
    expect(received[0].headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(received[0].headers["content-encoding"]).toBe("aes128gcm");
  });

  it("abonnement expiré (410) : désactivé automatiquement", async () => {
    setPushSender(realSender);
    respondWith = 410;
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const sub = await store.insert("push_subscriptions", { user_id: u.userId, endpoint, p256dh: device.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url"), user_agent: null, disabled_at: null, last_error: null });
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "system", title: "T", body: "B", dedupeKey: "p2", email: true }, new FakeMailer(), NOW);
    expect(r.deliveries.find((d) => d.channel === "push")!.status).toBe("skipped");
    expect((await store.get("push_subscriptions", sub.id))!.disabled_at).not.toBeNull();
    respondWith = 201;
  });

  it("panne du service push : nouvelle tentative différée puis succès", async () => {
    setPushSender(realSender);
    respondWith = 503;
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    await store.insert("push_subscriptions", { user_id: u.userId, endpoint, p256dh: device.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url"), user_agent: null, disabled_at: null, last_error: null });
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "system", title: "T", body: "B", dedupeKey: "p3", email: true }, new FakeMailer(), NOW);
    expect(r.deliveries.find((d) => d.channel === "push")!.status).toBe("pending");
    respondWith = 201;
    const later = new Date(NOW.getTime() + 5 * 60000);
    const done = await processPendingDeliveries(store, new FakeMailer(), later);
    expect(done.find((d) => d.channel === "push")!.status).toBe("sent");
  });

  it("sans abonnement, aucune livraison push n'est créée", async () => {
    setPushSender(realSender);
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const r = await notify(store, { userId: u.userId, orgId: u.orgId, type: "system", title: "T", body: "B", dedupeKey: "p4", email: true }, new FakeMailer(), NOW);
    expect(r.deliveries.some((d) => d.channel === "push")).toBe(false);
  });
});
