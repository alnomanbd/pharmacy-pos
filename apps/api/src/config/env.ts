import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * The Dawai API's configuration.
 *
 * Its own deployment and its own database. Three browser origins talk to it — the shop app, the operator
 * console and the marketing site — and each is configured separately so the
 * emails link to the right one and CORS admits exactly those.
 */
export const env = {
  nodeEnv: required('NODE_ENV', 'development'),
  port: Number(required('PORT', '5100')),
  /** The shop app — where owners and salesmen sign in. Links in emails start here. */
  clientUrl: required('CLIENT_URL', 'http://localhost:5175'),
  /** The Dawai operator console. The base for links in operator emails. */
  consoleUrl: required('CONSOLE_URL', 'http://localhost:5176'),
  /**
   * The marketing site, a different origin from the app, which posts sign-ups
   * and enquiries to `/api/public/*` from the browser. Comma-separated, so a
   * deployment can list the apex and the www host.
   */
  siteUrls: (process.env.SITE_URL || 'http://localhost:3100')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Whether an upstream proxy sets `X-Forwarded-For`. Off by default, because
   * trusting the header when nothing sets it lets a caller spoof their address —
   * and every rate limit here keys on `req.ip`. Behind nginx this must be `1`.
   */
  trustProxy: process.env.TRUST_PROXY || '',
  /** IANA zone the shop's business days are measured in (the day's takings, a month's close). */
  appTz: required('APP_TZ', 'Asia/Dhaka'),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/dawai'),
  /** TLS to the database. On wherever it is reached across a network. */
  mongoTls: (process.env.MONGODB_TLS || '').toLowerCase() === 'true',
  mongoTlsCaFile: process.env.MONGODB_TLS_CA_FILE || '',
  /** Which database the credentials live in — usually `admin` for an application user. */
  mongoAuthSource: process.env.MONGODB_AUTH_SOURCE || '',
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpires: required('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpires: required('JWT_REFRESH_EXPIRES', '7d'),
  },
  sms: {
    provider: required('SMS_PROVIDER', 'log'),
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    },
    bulkSms: {
      url: process.env.BULKSMS_URL || '',
      apiKey: process.env.BULKSMS_API_KEY || '',
      sender: process.env.BULKSMS_SENDER || '',
    },
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Dawai <no-reply@dawai.local>',
  },
  scheduler: {
    // Off on the extra instances of a multi-instance deployment. See jobs/scheduler.ts.
    enabled: (process.env.SCHEDULER || 'on') !== 'off',
    intervalMinutes: Number(process.env.SCHEDULER_MINUTES || '15'),
  },
  /**
   * Whose name is on the subscription invoice. A shop files it with its own
   * accounts, so it has to name a real seller; blank fields are left off.
   */
  invoice: {
    issuer: process.env.INVOICE_ISSUER || 'Dawai',
    address: process.env.INVOICE_ADDRESS || '',
    phone: process.env.INVOICE_PHONE || '',
    email: process.env.INVOICE_EMAIL || '',
    /** Bangladesh: BIN / VAT registration, printed only when set. */
    bin: process.env.INVOICE_BIN || '',
    /** Prefix of the invoice number, before the year and the sequence. */
    prefix: process.env.INVOICE_PREFIX || 'DW',
    footer: process.env.INVOICE_FOOTER || '',
  },
  redisUrl: process.env.REDIS_URL || '',
  seed: {
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
    shopPassword: process.env.SEED_SHOP_PASSWORD || 'Shop@1234',
  },
} as const;

export const isProduction = env.nodeEnv === 'production';
