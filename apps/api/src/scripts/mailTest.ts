import { emailProvider, sendEmail } from '../integrations/email.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Proves the mail credentials actually work.
 *
 * Worth its own command because every mail failure in this app is deliberately
 * swallowed — approving a shop must not fail because a mail server was down —
 * so without this, "no email arrived" and "email is misconfigured" look exactly
 * the same from the outside.
 *
 *   npm run mail:test                    verify the connection only
 *   npm run mail:test you@example.com    verify, then actually send there
 */
async function run() {
  const to = process.argv[2];

  logger.info(
    {
      host: env.mail.host || '(unset)',
      port: env.mail.port,
      user: env.mail.user || '(unset)',
      from: env.mail.from,
      provider: emailProvider.provider,
    },
    'Mail configuration',
  );

  const check = await emailProvider.verify();
  if (!check.ok) {
    logger.error({ detail: check.detail }, 'Mail check FAILED');
    process.exitCode = 1;
    return;
  }
  logger.info({ detail: check.detail }, 'Mail check passed');

  if (!to) {
    logger.info('Pass an address to send a real message: npm run mail:test you@example.com');
    return;
  }

  const result = await sendEmail({
    to,
    subject: 'Dawai — test message',
    text: 'If you are reading this, outgoing email works.',
    html: '<p>If you are reading this, outgoing email works.</p>',
  });

  if (result.success) {
    logger.info({ to, id: result.messageId }, 'Test email sent');
  } else {
    logger.error({ to }, 'Test email failed — see the error above');
    process.exitCode = 1;
  }
}

void run();
