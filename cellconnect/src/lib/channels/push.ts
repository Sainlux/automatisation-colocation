import * as webpush from "web-push";
import { env } from "@/lib/env";

/**
 * Canal push web (protocole Web Push + VAPID, RFC 8030/8291/8292).
 * Le contenu est chiffré de bout en bout pour l'appareil : le service push
 * du navigateur (Google, Mozilla, Apple) ne peut pas le lire.
 */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSender {
  readonly available: boolean;
  /** Renvoie "gone" si l'abonnement n'existe plus (404/410 : à désactiver). */
  send(target: PushTarget, payload: PushPayload): Promise<"ok" | "gone">;
}

export const webPushSender: PushSender = {
  get available() {
    return env.push.configured;
  },
  async send(target, payload) {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 3600, urgency: "normal", vapidDetails: { subject: env.push.subject, publicKey: env.push.publicKey!, privateKey: env.push.privateKey! } },
      );
      return "ok";
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw new Error(`Push ${status ?? ""} ${(e as Error).message}`.trim().slice(0, 300));
    }
  },
};

let current: PushSender = webPushSender;
export const getPushSender = () => current;
/** Réservé aux tests. */
export function setPushSender(s: PushSender) {
  current = s;
}
