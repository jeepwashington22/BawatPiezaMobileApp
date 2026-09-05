import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Brevo SMTP relay configuration.
 * - host: smtp-relay.brevo.com
 * - port: 587 (STARTTLS) or 465 (SSL)
 * - user: the email address you use to log into Brevo
 * - pass: the SMTP key (starts with "xsmtpsib-")
 */

function missing(name: string): never {
  throw new Error(`[mailer] Missing required env var: ${name}`);
}

function createTransporter(): Transporter {
  const host = process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com';
  const port = Number(process.env.BREVO_SMTP_PORT ?? 587);
  const secure = process.env.BREVO_SMTP_SECURE === 'true';
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;

  if (!user) missing('BREVO_SMTP_USER');
  if (!pass) missing('BREVO_SMTP_KEY');

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const from = process.env.MAIL_FROM ?? process.env.BREVO_SMTP_USER;
  const fromName = process.env.MAIL_FROM_NAME ?? 'BawatPieza';

  if (!from) missing('MAIL_FROM or BREVO_SMTP_USER');

  await getTransporter().sendMail({
    from: `"${fromName}" <${from}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function verifyMailer(): Promise<boolean> {
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    console.warn('[mailer] SMTP verify failed:', (err as Error).message);
    return false;
  }
}