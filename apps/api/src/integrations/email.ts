import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Sending email.
 *
 * Shaped like `sms.ts`: an interface, a real provider, and a logging provider
 * that is used when nothing is configured — so a development machine with no
 * SMTP credentials still exercises every code path that sends, and prints what
 * would have gone out instead of throwing.
 *
 * Nothing here ever throws at the caller. An approval that fails because a mail
 * server was briefly down must still be an approval; the failure is logged
 * loudly and the operation stands.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Always sent — some recipients and most filters prefer it. */
  text: string;
  html?: string;
  /** The display name to send as, e.g. the product the account bought. The address stays the configured one. */
  fromName?: string;
}

export interface EmailResult {
  success: boolean;
  provider: string;
  messageId?: string;
}

export interface EmailProvider {
  readonly provider: string;
  send(message: EmailMessage): Promise<EmailResult>;
  /** Proves the credentials work, for `npm run mail:test`. */
  verify(): Promise<{ ok: boolean; detail: string }>;
}

class LogProvider implements EmailProvider {
  readonly provider = 'log';

  async send(message: EmailMessage): Promise<EmailResult> {
    logger.info(
      { to: message.to, subject: message.subject },
      '[email][log] would send (set SMTP_HOST/SMTP_USER/SMTP_PASS to send for real)',
    );
    return { success: true, provider: this.provider };
  }

  async verify() {
    return { ok: false, detail: 'No SMTP credentials configured — email is only being logged.' };
  }
}

/**
 * Gmail rewrites or rejects a `From` that is not the authenticated account or
 * one of its verified aliases. A configured `MAIL_FROM` of, say,
 * `no-reply@example.local` therefore either silently becomes the Gmail address
 * or bounces the message — so on Gmail the authenticated user wins, and the
 * intended name is kept as the display name.
 */
function resolveFrom(): string {
  const configured = env.mail.from?.trim();
  const user = env.mail.user?.trim();
  const isGmail = /(^|\.)gmail\.com$/i.test(env.mail.host || '') ||
    /(^|\.)googlemail\.com$/i.test(env.mail.host || '');

  if (!user) return configured || 'no-reply@localhost';
  if (!isGmail) return configured || user;

  if (configured && !configured.toLowerCase().includes(user.toLowerCase())) {
    logger.warn(
      { configured, user },
      'MAIL_FROM is not the authenticated Gmail account; Gmail will not send as it. Using the account address with MAIL_FROM as the display name.',
    );
    // `Dawai <account@gmail.com>` — the name a recipient sees is
    // ours, the address is the one Gmail will actually accept.
    return `Dawai <${user}>`;
  }
  return configured || user;
}

/** `Name <addr>` from a configured sender, keeping its address and swapping the name. */
function withName(from: string, name: string): string {
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  return `${name.replace(/["<>]/g, '')} <${addr}>`;
}

class SmtpProvider implements EmailProvider {
  readonly provider = 'smtp';
  private transporter: Transporter;
  private readonly from: string;

  constructor() {
    this.from = resolveFrom();
    this.transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS, which is what Gmail
      // expects with an app password.
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: message.fromName ? withName(this.from, message.fromName) : this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info({ to: message.to, subject: message.subject, id: info.messageId }, 'Email sent');
      return { success: true, provider: this.provider, messageId: info.messageId };
    } catch (err) {
      logger.error({ err, to: message.to, subject: message.subject }, 'Email failed to send');
      return { success: false, provider: this.provider };
    }
  }

  async verify() {
    try {
      await this.transporter.verify();
      return { ok: true, detail: `Connected to ${env.mail.host} as ${env.mail.user}` };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        // The two failures worth naming, because they are what actually happens
        // with Gmail and both look like a generic auth error.
        detail: /invalid login|username and password/i.test(detail)
          ? `${detail} — with Gmail this means an App Password is required (2-Step Verification must be on), not the account password.`
          : detail,
      };
    }
  }
}

function createProvider(): EmailProvider {
  const { host, user, pass } = env.mail;
  if (!host || !user || !pass) {
    logger.warn('SMTP is not configured; email will be logged, not sent');
    return new LogProvider();
  }
  return new SmtpProvider();
}

export const emailProvider: EmailProvider = createProvider();

/** Fire-and-forget: a notification must never fail the thing it announces. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  try {
    return await emailProvider.send(message);
  } catch (err) {
    logger.error({ err, to: message.to }, 'Email provider threw');
    return { success: false, provider: emailProvider.provider };
  }
}
