import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

const SMTP_TIMEOUT_MS = 15_000;
let transport: Transporter | null = null;

export const emailDeliveryConfigured = () => Boolean(
  env.SMTP_USER && env.SMTP_APP_PASSWORD && env.SMTP_FROM && env.PASSWORD_RESET_URL_BASE,
);

function getTransport() {
  if (!emailDeliveryConfigured()) throw new Error("SMTP delivery is not configured");
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_APP_PASSWORD! },
    tls: { rejectUnauthorized: true, servername: env.SMTP_HOST },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

export async function sendExternalEmail(input: { to: string; subject: string; text: string; html: string }) {
  const subject = input.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  await getTransport().sendMail({ from: env.SMTP_FROM!, ...input, subject });
}

export async function verifyEmailTransport() {
  return getTransport().verify();
}

export function resetEmailTransportForTests() {
  transport = null;
}
