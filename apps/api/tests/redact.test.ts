import { describe, it, expect } from 'vitest';
import { maskMongoUri, maskPhone, maskSmsBody, REDACT_PATHS } from '../src/utils/redact.js';

/**
 * What a log line is allowed to say.
 *
 * Both of the leaks this closes were one line of code each and neither looked
 * like a mistake: printing the connection string on boot, and printing the SMS
 * body from the provider that exists so you can read it. Tested here because a
 * masking rule that is only exercised by accident stops being true the first
 * time somebody reformats the string it depends on.
 */
describe('the database URI', () => {
  it('keeps the host and drops the password', () => {
    expect(maskMongoUri('mongodb://app:hunter2@db.internal:27017/pm')).toBe(
      'mongodb://app:***@db.internal:27017/pm',
    );
    expect(maskMongoUri('mongodb+srv://svc:p%40ss@cluster0.example.net/pm?retryWrites=true')).toBe(
      'mongodb+srv://svc:***@cluster0.example.net/pm?retryWrites=true',
    );
  });

  it('leaves a URI that has no credentials alone', () => {
    const local = 'mongodb://localhost:27017/dawai';
    expect(maskMongoUri(local)).toBe(local);
  });
});

describe('a phone number in a log', () => {
  it('stays recognisable to the person who owns it, and to nobody else', () => {
    expect(maskPhone('+8801711000001')).toBe('+88017****0001');
  });

  it('does not half-reveal a short or empty value', () => {
    expect(maskPhone('12345')).toBe('*****');
    expect(maskPhone('')).toBe('');
  });
});

describe('an SMS body', () => {
  const OTP = 'Your Dawai code is 483920. It expires in 5 minutes.';
  const LINK = 'Reset your password: https://shop.dawai.com.bd/reset/9f3c1b2a4d';

  it('is left whole in development, which is what the log provider is for', () => {
    expect(maskSmsBody(OTP, false)).toBe(OTP);
  });

  it('loses the code in production, where `log` is still the default provider', () => {
    const masked = maskSmsBody(OTP, true);
    expect(masked).not.toContain('483920');
    expect(masked).toContain('******');
    // Still says what kind of message it was — that is the support question.
    expect(masked).toContain('code is');
  });

  it('keeps the origin of a link and drops the token in its path', () => {
    const masked = maskSmsBody(LINK, true);
    expect(masked).not.toContain('9f3c1b2a4d');
    expect(masked).toContain('https://shop.dawai.com.bd/…');
  });

  it('does not fall over on something that only looks like a link', () => {
    // Matches the pattern, fails to parse. The masker has to survive both.
    expect(maskSmsBody('see http://[bad', true)).toContain('[link]');
    expect(maskSmsBody('see http://', true)).toBe('see http://');
  });
});

describe('the redaction list', () => {
  it('covers the header a bearer token arrives in and the session cookie', () => {
    expect(REDACT_PATHS).toContain('req.headers.authorization');
    expect(REDACT_PATHS).toContain('req.headers.cookie');
  });

  /*
   * Every secret this codebase names should be on the list at the top level and
   * one level down, since both shapes are logged: `logger.info({ token })` and
   * `logger.info({ body: { token } })`.
   */
  it('covers each secret at both depths', () => {
    for (const key of ['password', 'token', 'accessToken', 'refreshToken', 'otp', 'secret']) {
      expect(REDACT_PATHS).toContain(key);
      expect(REDACT_PATHS).toContain(`*.${key}`);
    }
  });
});
