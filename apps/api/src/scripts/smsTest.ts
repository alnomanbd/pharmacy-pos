import { smsProvider } from '../integrations/sms.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Proves the SMS gateway actually works.
 *
 * The companion to `mail:test`, and for the same reason: every send in this app
 * swallows its failure so that a baki reminder or a password reset is never lost to
 * a gateway outage. Without a command that reports the failure out loud, a
 * misconfigured gateway is indistinguishable from a quiet one.
 *
 *   npm run sms:test 01XXXXXXXXX
 */
async function run() {
  const to = process.argv[2];

  logger.info(
    {
      provider: env.sms.provider,
      configured:
        env.sms.provider === 'twilio'
          ? Boolean(env.sms.twilio.accountSid && env.sms.twilio.authToken && env.sms.twilio.from)
          : Boolean(env.sms.bulkSms.url && env.sms.bulkSms.apiKey),
    },
    'SMS configuration',
  );

  if (env.sms.provider === 'log') {
    logger.warn(
      'SMS_PROVIDER is "log" — messages are only written to this log. Set it to bulksms, http or twilio to send for real.',
    );
  }

  if (!to) {
    logger.info('Pass a number to send to: npm run sms:test 01XXXXXXXXX');
    return;
  }

  const result = await smsProvider.send(to, 'Dawai: test message. Outgoing SMS works.');

  if (result.success) {
    logger.info({ to, provider: result.provider, raw: result.raw }, 'Test SMS accepted by gateway');
  } else {
    // "Accepted" is as far as this can go — delivery is the gateway's business,
    // and most of them report it separately or not at all.
    logger.error({ to, provider: result.provider, raw: result.raw }, 'Test SMS FAILED');
    process.exitCode = 1;
  }
}

void run();
