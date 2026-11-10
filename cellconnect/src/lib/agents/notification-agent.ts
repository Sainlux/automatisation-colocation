import type { Store } from "@/lib/db/store";
import { UniqueViolationError } from "@/lib/db/store";
import type { ChannelSender } from "@/lib/channels/email";
import type { NotificationDelivery, NotificationRow, NotificationType } from "@/lib/types";
import { log } from "@/lib/audit";

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
    const profile = await store.get("profiles", input.userId);
    let status: NotificationDelivery["status"] = "pending";
    let lastError: string | null = null;
    if (!profile?.notify_email) {
      status = "skipped";
      lastError = "E-mails désactivés par le destinataire";
    } else if (!emailSender.available) {
      status = "skipped";
      lastError = "Canal e-mail non configuré (SMTP)";
    }
    const d = await store.insert("notification_deliveries", {
      notification_id: notification.id,
      user_id: input.userId,
      channel: "email",
      status,
      attempts: 0,
      last_error: lastError,
      next_attempt_at: status === "pending" ? nowIso : null,
      sent_at: null,
    });
    deliveries.push(status === "pending" ? await attemptDelivery(store, d, emailSender, now) : d);
  }
  return { notification, duplicate: false, deliveries };
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
    log("warn", "email_delivery_failed", { deliveryId: d.id, attempts, error: (e as Error).message });
    return store.update("notification_deliveries", d.id, {
      status: failed ? "failed" : "pending",
      attempts,
      last_error: (e as Error).message.slice(0, 500),
      next_attempt_at: failed ? null : new Date(now.getTime() + backoffMs).toISOString(),
    });
  }
}

/** Traite les livraisons en attente (appelé par le worker / le cron). */
export async function processPendingDeliveries(store: Store, sender: ChannelSender, now = new Date()) {
  const due = await store.select("notification_deliveries", {
    where: [
      ["status", "eq", "pending"],
      ["channel", "eq", "email"],
      ["next_attempt_at", "lte", now.toISOString()],
    ],
    limit: 100,
  });
  const results = [];
  for (const d of due) {
    if (!sender.available) {
      results.push(await store.update("notification_deliveries", d.id, { status: "skipped", last_error: "Canal e-mail non configuré (SMTP)", next_attempt_at: null }));
      continue;
    }
    results.push(await attemptDelivery(store, d, sender, now));
  }
  return results;
}
