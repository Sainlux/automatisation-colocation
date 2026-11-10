import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/**
 * Canal e-mail (SMTP via nodemailer). Architecture d'adaptateurs : chaque
 * canal implémente `ChannelSender`. Sans configuration SMTP, le canal est
 * déclaré indisponible et les envois sont marqués « skipped » (jamais
 * prétendument envoyés).
 */

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
}

export interface ChannelSender {
  readonly available: boolean;
  send(msg: OutgoingMessage): Promise<void>;
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export const smtpSender: ChannelSender = {
  get available() {
    return env.smtp.configured;
  },
  async send(msg) {
    if (!env.smtp.configured) throw new Error("SMTP non configuré");
    transport ??= nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
    await transport.sendMail({ from: env.smtp.from, to: msg.to, subject: msg.subject, text: msg.text });
  },
};
