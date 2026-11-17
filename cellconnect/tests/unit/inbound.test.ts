import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { FakeMailer, makeUser, memoryStore } from "./helpers";
import { setHttpFetch } from "@/lib/integrations/http";
import { __setStoreForTests } from "@/lib/db";
import { emailToItems, handleInboundEmail, inboundAddress, parseFormPayload, parseJsonPayload, userFromAddress } from "@/lib/inbound/email";
import { handleTelegramUpdate, linkCode, userFromLinkCode, type TgUpdate } from "@/lib/inbound/telegram";
import { POST as emailWebhook } from "@/app/api/inbound/email/route";
import { POST as telegramWebhook } from "@/app/api/inbound/telegram/route";

const MESSAGE = `Formation Cellules « Zoom »

1. Lundi 16 novembre 20h30 - 22h
2. Lundi 14 décembre 20h30 - 22h
3. Mercredi 20 janvier 20h30 - 22h
4. Mercredi 17 février 20h30 - 22h
5. Lundi 15 mars 20h30 - 22h`;

const dataDir = mkdtempSync(path.join(tmpdir(), "cc-inbound-"));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

/** API Telegram simulée. */
type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let files: Record<string, Buffer> = {};

beforeEach(() => {
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    APP_URL: "https://cellconnect.test",
    INBOUND_EMAIL_DOMAIN: "in.cellconnect.test",
    INBOUND_EMAIL_SECRET: "secret-de-test-adresse-1234",
    INBOUND_EMAIL_WEBHOOK_TOKEN: "jeton-webhook-email-1234",
    TELEGRAM_BOT_TOKEN: "123456:ABC-test",
    TELEGRAM_BOT_USERNAME: "CellConnectBot",
    TELEGRAM_WEBHOOK_SECRET: "secret_webhook_telegram_1234",
  });
  calls = [];
  files = {};
  setHttpFetch(async (input, init) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: `photos/${body?.file_id}.jpg`, file_size: files[String(body?.file_id)]?.length } });
    const f = /\/file\/bot[^/]+\/photos\/(.+)\.jpg$/.exec(url);
    if (f) return new Response(new Uint8Array(files[f[1]]), { status: 200 });
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
});
afterEach(() => {
  setHttpFetch(null);
  __setStoreForTests(null as never);
});

const sent = () => calls.filter((c) => c.url.endsWith("/sendMessage")).map((c) => String(c.body?.text));

describe("réception par e-mail", () => {
  it("adresse personnelle signée : retrouve le compte, refuse une signature ou un domaine faux", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const addr = inboundAddress(u.userId)!;
    expect(addr).toMatch(/^agenda\+[0-9a-f]{48}@in\.cellconnect\.test$/);
    expect(userFromAddress(addr)).toBe(u.userId);
    expect(userFromAddress(addr.toUpperCase().replace("IN.CELLCONNECT.TEST", "in.cellconnect.test"))).toBe(u.userId);
    expect(userFromAddress(addr.replace(/.@/, (m) => (m[0] === "0" ? "1@" : "0@")))).toBeNull();
    expect(userFromAddress(addr.replace("in.cellconnect.test", "autre.test"))).toBeNull();
    delete process.env.INBOUND_EMAIL_DOMAIN;
    expect(inboundAddress(u.userId)).toBeNull();
  });

  it("Postmark : un message transféré devient une analyse à vérifier et l'utilisateur est prévenu", async () => {
    const store = memoryStore();
    const mailer = new FakeMailer();
    const u = await makeUser(store, "Daniel", mailer);
    const mail = parseJsonPayload({
      From: "Quelqu'un <autre@exemple.ch>",
      ToFull: [{ Email: inboundAddress(u.userId), Name: "" }],
      Subject: "Fwd: Formation Cellules",
      TextBody: `---------- Message transféré ----------\n${MESSAGE}`,
      Attachments: [],
    });
    const r = await handleInboundEmail(store, mailer, mail);
    expect(r.accepted).toBe(true);
    if (!r.accepted) return;
    await r.finish();
    const rows = await store.select("extracted_events", { where: [["job_id", "eq", r.jobId]] });
    expect(rows).toHaveLength(5);
    // Rien n'est ajouté à l'agenda : seulement des brouillons à vérifier.
    expect(await store.select("events", {})).toHaveLength(0);
    const [n] = await store.select("notifications", { where: [["user_id", "eq", u.userId]] });
    expect(n.title).toContain("5 dates à vérifier");
    expect(n.data).toMatchObject({ url: `/capture/${r.jobId}` });
    // La réponse part à l'adresse du COMPTE, pas à l'expéditeur.
    expect(mailer.sent.map((m) => m.to)).toEqual([u.email]);
    expect(mailer.sent[0].text).toContain(`https://cellconnect.test/capture/${r.jobId}`);
  });

  it("Mailgun (multipart) : fichier .ics pris en compte, petites images (logos) ignorées", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    const form = new FormData();
    form.set("recipient", inboundAddress(u.userId)!);
    form.set("sender", "orga@exemple.ch");
    form.set("subject", "Agenda");
    form.set("body-plain", "Voici le calendrier.");
    const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a@b\r\nDTSTART:20270120T193000Z\r\nDTEND:20270120T210000Z\r\nSUMMARY:Formation\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    form.append("attachment-1", new File([ics], "invitation.ics", { type: "text/calendar" }));
    const logo = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
    form.append("attachment-2", new File([new Uint8Array(logo)], "logo.png", { type: "image/png" }));
    const mail = await parseFormPayload(form);
    expect(mail.recipients).toContain(inboundAddress(u.userId));
    const items = emailToItems(mail);
    expect(items.map((i) => i.type)).toEqual(["text", "ics"]);
    const r = await handleInboundEmail(store, new FakeMailer(), mail);
    expect(r.accepted).toBe(true);
  });

  it("adresse inconnue ou contenu vide : ignoré sans rien créer", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    expect(await handleInboundEmail(store, new FakeMailer(), parseJsonPayload({ To: "agenda+0000@in.cellconnect.test", TextBody: MESSAGE }))).toMatchObject({ accepted: false });
    expect(await handleInboundEmail(store, new FakeMailer(), parseJsonPayload({ To: inboundAddress(u.userId), TextBody: "  " }))).toMatchObject({ accepted: false, reason: "empty" });
    expect(await store.select("extraction_jobs", {})).toHaveLength(0);
  });

  it("webhook : jeton obligatoire, canal désactivé sans configuration", async () => {
    __setStoreForTests(memoryStore());
    const req = (token: string) => new NextRequest(`https://cellconnect.test/api/inbound/email?token=${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ To: "x@y.ch", TextBody: "a" }) });
    expect((await emailWebhook(req("mauvais-jeton"))).status).toBe(401);
    expect((await emailWebhook(req("jeton-webhook-email-1234"))).status).toBe(200);
    delete process.env.INBOUND_EMAIL_WEBHOOK_TOKEN;
    expect((await emailWebhook(req("jeton-webhook-email-1234"))).status).toBe(503);
  });
});

describe("bot Telegram", () => {
  const msg = (update_id: number, chatId: number, extra: Record<string, unknown>, type = "private"): TgUpdate =>
    ({ update_id, message: { message_id: update_id, chat: { id: chatId, type }, from: { id: chatId, username: "daniel" }, ...extra } }) as TgUpdate;

  it("code de liaison signé, valable 15 minutes", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const now = new Date("2026-11-10T12:00:00Z");
    const code = linkCode(id, now);
    expect(code).toMatch(/^[0-9a-f]{56}$/);
    expect(userFromLinkCode(code, now)).toBe(id);
    expect(userFromLinkCode(code, new Date(now.getTime() + 16 * 60000))).toBeNull();
    expect(userFromLinkCode(code.slice(0, -1) + (code.endsWith("0") ? "1" : "0"), now)).toBeNull();
  });

  it("liaison, message transféré → dates à vérifier, renvois ignorés, /stop", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());

    // Conversation non liée : explication, aucune analyse.
    await handleTelegramUpdate(store, new FakeMailer(), msg(1, 42, { text: MESSAGE }));
    expect(sent().at(-1)).toContain("pas encore reliée");

    // Liaison.
    await handleTelegramUpdate(store, new FakeMailer(), msg(2, 42, { text: `/start ${linkCode(u.userId)}` }));
    expect(sent().at(-1)).toContain("C'est relié");
    const [link] = await store.select("messaging_links", {});
    expect(link).toMatchObject({ user_id: u.userId, external_id: "42", label: "@daniel" });

    // Message transféré.
    const r = await handleTelegramUpdate(store, new FakeMailer(), msg(3, 42, { text: MESSAGE }));
    expect(sent().at(-1)).toBe("Reçu, je lis le message…");
    await r.followUp!();
    const [job] = await store.select("extraction_jobs", { where: [["user_id", "eq", u.userId]] });
    expect(sent().at(-1)).toContain("5 dates trouvées");
    const last = calls.filter((c) => c.url.endsWith("/sendMessage")).at(-1)!;
    expect(last.body?.reply_markup).toEqual({ inline_keyboard: [[{ text: "Vérifier les dates", url: `https://cellconnect.test/capture/${job.id}` }]] });
    expect(await store.select("events", {})).toHaveLength(0);

    // Le même update renvoyé par Telegram n'est pas retraité.
    const before = calls.length;
    expect(await handleTelegramUpdate(store, new FakeMailer(), msg(3, 42, { text: MESSAGE }))).toEqual({});
    expect(calls.length).toBe(before);
    expect(await store.select("extraction_jobs", {})).toHaveLength(1);

    // Délier.
    await handleTelegramUpdate(store, new FakeMailer(), msg(4, 42, { text: "/stop" }));
    expect(await store.select("messaging_links", {})).toHaveLength(0);
  });

  it("photo : la plus grande taille est téléchargée et stockée en privé", async () => {
    const store = memoryStore();
    const u = await makeUser(store, "Daniel", new FakeMailer());
    await handleTelegramUpdate(store, new FakeMailer(), msg(1, 7, { text: `/start ${linkCode(u.userId)}` }));
    files.grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)]);
    files.petite = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(10)]);
    const r = await handleTelegramUpdate(store, new FakeMailer(), msg(2, 7, { photo: [{ file_id: "petite", width: 90, height: 160 }, { file_id: "grande", width: 1080, height: 1920 }], caption: "Planning" }));
    expect(calls.find((c) => c.url.endsWith("/getFile"))?.body).toEqual({ file_id: "grande" });
    expect(r.followUp).toBeTypeOf("function");
    const uploads = await store.select("uploads", { where: [["user_id", "eq", u.userId]] });
    expect(uploads.map((x) => x.kind).sort()).toEqual(["image", "text"]);
    expect(uploads.find((x) => x.kind === "image")?.size_bytes).toBe(files.grande.length);
  });

  it("groupes ignorés ; webhook protégé par son secret", async () => {
    const store = memoryStore();
    expect(await handleTelegramUpdate(store, new FakeMailer(), msg(1, -100, { text: MESSAGE }, "group"))).toEqual({});
    expect(calls).toHaveLength(0);
    __setStoreForTests(store);
    const req = (secret: string) =>
      new NextRequest("https://cellconnect.test/api/inbound/telegram", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(msg(5, 1, { text: "/aide" }, "group")) });
    expect((await telegramWebhook(req("faux"))).status).toBe(401);
    expect((await telegramWebhook(req("secret_webhook_telegram_1234"))).status).toBe(200);
  });
});
