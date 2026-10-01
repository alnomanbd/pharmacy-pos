/**
 * What must never reach a log line.
 *
 * Logs are read by more people than the database is, kept longer than anyone
 * intends, and shipped to whatever aggregator a deployment happens to use. Two
 * things were going into ours in plaintext: the database URI, credentials
 * included, on every boot — and the body of every SMS, which is how one-time
 * codes and password-reset links end up sitting in a file.
 *
 * The rule here is not "log less". It is that the useful part of each of these
 * is the shape, not the secret: knowing a code was sent to a number ending 4471
 * answers the support question, and the six digits never have to.
 */

/**
 * `mongodb+srv://app:hunter2@cluster0.example.net/pm` →
 * `mongodb+srv://app:***@cluster0.example.net/pm`
 *
 * The host and the database name are what anybody reading a boot line is
 * actually checking. The password is the part that turns a shared log into a
 * shared credential.
 */
export function maskMongoUri(uri: string): string {
  return uri.replace(/^(\w+(?:\+\w+)?:\/\/)([^:@/]+):([^@/]*)@/, (_m, scheme, user) => {
    return `${scheme}${user}:***@`;
  });
}

/**
 * `+8801711000001` → `+88017*****0001`
 *
 * Enough to recognise the number in a support conversation with the person who
 * owns it, not enough to be a contact list.
 */
export function maskPhone(phone: string): string {
  const digits = String(phone ?? '');
  if (digits.length <= 8) return digits ? '*'.repeat(digits.length) : '';
  return `${digits.slice(0, 6)}${'*'.repeat(digits.length - 10)}${digits.slice(-4)}`;
}

/**
 * An SMS body, with anything that looks like a credential taken out.
 *
 * Development keeps the whole message, because the point of the `log` SMS
 * provider is to read the code during a sign-in when no gateway is
 * configured. Production does not — and production is where this matters, since
 * `log` is the *default* provider: a deployment that has not bought a gateway
 * yet is exactly the one writing one-time codes to disk.
 *
 * Masked rather than dropped: "sent, and it contained a code" is the thing a
 * delivery complaint needs to establish.
 */
export function maskSmsBody(body: string, inProduction: boolean): string {
  if (!inProduction) return body;
  return String(body ?? '')
    // Any run of 4+ digits: OTPs, reset codes, serial numbers in a reminder.
    .replace(/\b\d{4,}\b/g, (m) => '*'.repeat(m.length))
    // A share or reset link carries its token in the path.
    .replace(/https?:\/\/\S+/g, (m) => {
      try {
        const url = new URL(m);
        return `${url.origin}/…`;
      } catch {
        return '[link]';
      }
    });
}

/**
 * Paths pino blanks before anything is written.
 *
 * Explicit paths rather than a key matcher, because that is what pino's redact
 * takes — and because an explicit list is a list somebody can read and argue
 * with. The wildcard forms cover the two shapes these arrive in: at the top of
 * a log object, and one level down inside `req`, `body` or `data`.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'code',
  'otp',
  'twoFactorCode',
  'twoFactorSecret',
  'secret',
  'apiKey',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.otp',
  '*.twoFactorCode',
  '*.secret',
  '*.apiKey',
];
