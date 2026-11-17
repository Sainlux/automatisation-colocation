import type { Store } from "@/lib/db/store";
import { UniqueViolationError, type Filter, type NewRow } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { NotificationDelivery, NotificationRow, NotificationType } from "@/lib/types";
import { log, maskEmails } from "@/lib/audit";
import { getPushSender, type PushSender } from "@/lib/channels/push";

/**
 * NotificationAgent — notifications internes + e-mail.
 *
 * - Anti-doublon : chaque notification porte une `dedupe_key` unique ;
 *   une seconde tentative avec la même clé renvoie la notification existante.
 * - Chaque canal a sa ligne de livraison (`notification_deliveries`) avec un
 *   statut explicite : sent / pending / failed / skipped.
 * - Les e-mails en échec sont retentés avec un délai exponentiel (max 5).
 */

export const MAX_DELIVERY_ATTEMPTS = 5;

export interface NotifyInput {
  userId: string;
  orgId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey: string;
  /** Envoyer aussi par e-mail (si l'utilisateur l'accepte et si le canal est configuré). */
  email?: boolean;
}

export interface NotifyResult {
  notification: NotificationRow;
  duplicate: boolean;
  deliveries: NotificationDelivery[];
}

export async function notify(store: Store, input: NotifyInput, emailSender: ChannelSender, now = new Date()): Promise<NotifyResult> {
  const [existing] = await store.select("notifications", { where: [["dedupe_key", "eq", input.dedupeKey]] });
  if (existing) {
    const deliveries = await store.select("notification_deliveries", { where: [["notification_id", "eq", existing.id]] });
    return { notification: existing, duplicate: true, deliveries };
  }
  let notification: NotificationRow;
  try {
    notification = await store.insert("notifications", {
      user_id: input.userId,
      organization_id: input.orgId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 2000),
      data: input.data ?? {},
      read_at: null,
      dedupe_key: input.dedupeKey,
    });
  } catch (e) {
    if (e instanceof UniqueViolationError) {
      const [n] = await store.select("notifications", { where: [["dedupe_key", "eq", input.dedupeKey]] });
      return { notification: n, duplicate: true, deliveries: [] };
    }
    throw e;
  }

  const nowIso = now.toISOString();
  const deliveries: NotificationDelivery[] = [
    await store.insert("notification_deliveries", {
      notification_id: notification.id,
      user_id: input.userId,
      channel: "in_app",
      status: "sent",
      attempts: 1,
      last_error: null,
      next_attempt_at: null,
      sent_at: nowIso,
    }),
  ];

  if (input.email) {
    // Les livraisons externes sont enregistrées « pending » puis envoyées hors du
    // chemin de la requête (after()) : la réponse n'attend jamais le serveur SMTP.
    const push = getPushSender();
    const [profile, subs] = await Promise.all([
      store.get("profiles", input.userId),
      push.available ? store.select("push_subscriptions", { where: [["user_id", "eq", input.userId], ["disabled_at", "is", null]] }) : Promise.resolve([]),
    ]);
    let status: NotificationDelivery["status"] = "pending";
    let lastError: string | null = null;
    if (!profile?.notify_email) {
      status = "skipped";
      lastError = "E-mails désactivés par le destinataire";
    } else if (!emailSender.available) {
      status = "skipped";
      lastError = "Canal e-mail non configuré (SMTP)";
    }
    const rows: NewRow<NotificationDelivery>[] = [
      {
        notification_id: notification.id,
        user_id: input.userId,
        channel: "email",
        status,
        attempts: 0,
        last_error: lastError,
        next_attempt_at: status === "pending" ? nowIso : null,
        sent_at: null,
      },
    ];
    // Push web : uniquement si l'utilisateur a activé le push sur au moins un appareil.
    if (subs.length && push.available) {
      rows.push({
        notification_id: notification.id,
        user_id: input.userId,
        channel: "push",
        status: "pending",
        attempts: 0,
        last_error: null,
        next_attempt_at: nowIso,
        sent_at: null,
      });
    }
    const external = await store.insertMany("notification_deliveries", rows);
    const pending = external.filter((d) => d.status === "pending");
    const inline = await runAfter(async () => {
      for (const d of pending) await sendDelivery(store, d, d.channel === "push" ? push : emailSender, now);
    });
    if (inline && pending.length) {
      // Exécuté sur place (hors requête : worker, tests) : on renvoie l'état final.
      const fresh = await store.select("notification_deliveries", { where: [["id", "in", external.map((d) => d.id)]] });
      const byId = new Map(fresh.map((d) => [d.id, d]));
      deliveries.push(...external.map((d) => byId.get(d.id) ?? d));
    } else {
      deliveries.push(...external);
    }
  }
  return { notification, duplicate: false, deliveries };
}

/**
 * Exécute `fn` après l'envoi de la réponse HTTP (after() de Next.js). Hors
 * requête (worker, tests), after() est indisponible : `fn` est alors exécutée
 * sur place et attendue. Renvoie true dans ce second cas.
 * Les erreurs sont journalisées, jamais propagées à l'appelant.
 */
export async function runAfter(fn: () => Promise<void>): Promise<boolean> {
  const safe = async () => {
    try {
      await fn();
    } catch (e) {
      log("error", "after_task_failed", { error: (e as Error).message });
    }
  };
  try {
    const { after } = await import("next/server");
    after(safe);
    return false;
  } catch {
    await safe();
    return true;
  }
}

/** Durée pendant laquelle une livraison prise par un envoi est réservée (reprise automatique au-delà). */
const CLAIM_LEASE_MS = 10 * 60000;

/**
 * Prise atomique d'une livraison avant envoi : seule l'exécution qui modifie la
 * ligne (statut « pending » et échéance inchangée) l'envoie. L'échéance est
 * repoussée le temps de l'envoi : si le processus s'arrête en cours de route,
 * la livraison redevient éligible à l'expiration du bail.
 */
async function claim(store: Store, d: NotificationDelivery, now: Date): Promise<NotificationDelivery | null> {
  const where: Filter<NotificationDelivery>[] = [
    ["id", "eq", d.id],
    ["status", "eq", "pending"],
    d.next_attempt_at === null ? ["next_attempt_at", "is", null] : ["next_attempt_at", "eq", d.next_attempt_at],
  ];
  const [claimed] = await store.updateWhere("notification_deliveries", where, { next_attempt_at: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString() });
  return claimed ?? null;
}

async function sendDelivery(store: Store, d: NotificationDelivery, sender: ChannelSender | PushSender, now: Date): Promise<NotificationDelivery | null> {
  const claimed = await claim(store, d, now);
  if (!claimed) return null;
  if (claimed.channel === "push") return attemptPush(store, claimed, sender as PushSender, now);
  const mail = sender as ChannelSender;
  if (!mail.available) return store.update("notification_deliveries", claimed.id, { status: "skipped", last_error: "Canal e-mail non configuré (SMTP)", next_attempt_at: null });
  return attemptDelivery(store, claimed, mail, now);
}

function notificationUrl(n: NotificationRow) {
  const d = n.data as { eventId?: string; conflictId?: string };
  return d.conflictId ? "/conflits" : d.eventId ? `/evenements/${d.eventId}` : "/notifications";
}

async function attemptPush(store: Store, d: NotificationDelivery, sender: PushSender, now: Date): Promise<NotificationDelivery> {
  const n = await store.get("notifications", d.notification_id);
  const subs = await store.select("push_subscriptions", { where: [["user_id", "eq", d.user_id], ["disabled_at", "is", null]] });
  if (!n || subs.length === 0) return store.update("notification_deliveries", d.id, { status: "skipped", last_error: "Aucun appareil abonné", next_attempt_at: null });
  const attempts = d.attempts + 1;
  let delivered = 0;
  const errors: string[] = [];
  for (const sub of subs) {
    try {
      const r = await sender.send(sub, { title: n.title, body: n.body.slice(0, 300), url: notificationUrl(n), tag: n.dedupe_key.slice(0, 60) });
      if (r === "gone") await store.update("push_subscriptions", sub.id, { disabled_at: now.toISOString(), last_error: "Abonnement expiré" });
      else delivered++;
    } catch (e) {
      errors.push((e as Error).message);
      await store.update("push_subscriptions", sub.id, { last_error: (e as Error).message.slice(0, 300) });
    }
  }
  if (delivered > 0) return store.update("notification_deliveries", d.id, { status: "sent", attempts, sent_at: now.toISOString(), last_error: errors[0] ?? null, next_attempt_at: null });
  if (errors.length === 0) return store.update("notification_deliveries", d.id, { status: "skipped", attempts, last_error: "Tous les abonnements ont expiré", next_attempt_at: null });
  const failed = attempts >= MAX_DELIVERY_ATTEMPTS;
  return store.update("notification_deliveries", d.id, {
    status: failed ? "failed" : "pending",
    attempts,
    last_error: errors[0].slice(0, 500),
    next_attempt_at: failed ? null : new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60000).toISOString(),
  });
}

async function attemptDelivery(store: Store, d: NotificationDelivery, sender: ChannelSender, now: Date): Promise<NotificationDelivery> {
  const n = await store.get("notifications", d.notification_id);
  const profile = await store.get("profiles", d.user_id);
  if (!n || !profile) return store.update("notification_deliveries", d.id, { status: "failed", last_error: "Destinataire introuvable" });
  const attempts = d.attempts + 1;
  try {
    await sender.send({
      to: profile.email,
      subject: `[CellConnect] ${n.title}`,
      text: `${n.body}\n\n— CellConnect AI\nVous recevez cet e-mail car les notifications par e-mail sont activées dans vos paramètres.`,
    });
    return store.update("notification_deliveries", d.id, {
      status: "sent",
      attempts,
      sent_at: now.toISOString(),
      last_error: null,
      next_attempt_at: null,
    });
  } catch (e) {
    const failed = attempts >= MAX_DELIVERY_ATTEMPTS;
    const backoffMs = Math.min(60, 2 ** attempts) * 60000; // 2, 4, 8, 16, 32 min
    const error = maskEmails((e as Error).message);
    log("warn", "email_delivery_failed", { deliveryId: d.id, attempts, error });
    return store.update("notification_deliveries", d.id, {
      status: failed ? "failed" : "pending",
      attempts,
      last_error: error.slice(0, 500),
      next_attempt_at: failed ? null : new Date(now.getTime() + backoffMs).toISOString(),
    });
  }
}

/** Nombre maximal d'envois simultanés (SMTP / push) par passage du worker. */
const DELIVERY_CONCURRENCY = 5;

/** Exécute `fn` sur chaque élément avec au plus `limit` exécutions simultanées. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Traite les livraisons en attente (appelé par le worker / le cron).
 * Chaque ligne est prise atomiquement : deux passages simultanés n'envoient
 * jamais deux fois le même message.
 */
export async function processPendingDeliveries(store: Store, sender: ChannelSender, now = new Date()) {
  const due = await store.select("notification_deliveries", {
    where: [
      ["status", "eq", "pending"],
      ["channel", "in", ["email", "push"]],
      ["next_attempt_at", "lte", now.toISOString()],
    ],
    order: [{ column: "next_attempt_at", ascending: true }],
    limit: 100,
  });
  const push = getPushSender();
  const results = await mapLimit(due, DELIVERY_CONCURRENCY, async (d) => {
    try {
      return await sendDelivery(store, d, d.channel === "push" ? push : sender, now);
    } catch (e) {
      log("warn", "delivery_failed", { deliveryId: d.id, error: (e as Error).message });
      return null;
    }
  });
  return results.filter((r): r is NotificationDelivery => r !== null);
}
