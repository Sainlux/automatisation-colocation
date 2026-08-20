import nodemailer from 'nodemailer';

let transporter = null;

function build() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = build();
  return transporter;
}

// Force la reconstruction du transporter — après modification de .env
export function resetTransporter() {
  transporter = null;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Teste la connexion SMTP sans envoyer de message
export async function verifyConnection() {
  resetTransporter();
  const t = getTransporter();
  if (!t) throw new Error('SMTP_HOST manquant');
  return new Promise((resolve, reject) => {
    t.verify((err, ok) => err ? reject(err) : resolve(ok));
  });
}

export async function sendDocument({ to, subject, text, attachmentName, attachmentBuffer }) {
  return sendMail({
    to, subject, text,
    attachments: [{ filename: attachmentName, content: attachmentBuffer, contentType: 'application/pdf' }]
  });
}

// Envoi générique : 1 mail, N pièces jointes
export async function sendMail({ to, subject, text, attachments }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP non configuré.');
  return t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text, attachments
  });
}
