import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { maskPhone, maskSmsBody } from '../utils/redact.js';

export interface SmsResult {
  success: boolean;
  provider: string;
  raw?: unknown;
}

export interface SmsProvider {
  provider: string;
  send(to: string, body: string): Promise<SmsResult>;
}

class LogProvider implements SmsProvider {
  readonly provider = 'log';
  async send(to: string, body: string): Promise<SmsResult> {
    logger.info(
      { to: maskPhone(to), body: maskSmsBody(body, isProduction) },
      '[SMS][log] would send (configure a real gateway in production)',
    );
    return { success: true, provider: this.provider };
  }
}

class TwilioProvider implements SmsProvider {
  readonly provider = 'twilio';
  async send(to: string, body: string): Promise<SmsResult> {
    const { accountSid, authToken, from } = env.sms.twilio;
    if (!accountSid || !authToken || !from) {
      logger.warn('Twilio not configured');
      return { success: false, provider: this.provider };
    }
    // Twilio SDK would be used here. We keep a thin HTTP-based call to avoid
    // adding the SDK as a hard dependency; swap for twilio package in production.
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const raw = await res.json().catch(() => null);
    return { success: res.ok, provider: this.provider, raw };
  }
}

class BulkSmsProvider implements SmsProvider {
  readonly provider = 'bulksms';
  async send(to: string, body: string): Promise<SmsResult> {
    const { url, apiKey, sender } = env.sms.bulkSms;
    if (!url || !apiKey) {
      logger.warn('BulkSMS not configured');
      return { success: false, provider: this.provider };
    }
    const params = new URLSearchParams({ to, message: body, api_key: apiKey });
    if (sender) params.set('sender', sender);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const raw = await res.text().catch(() => null);
    return { success: res.ok, provider: this.provider, raw };
  }
}

class HttpProvider implements SmsProvider {
  readonly provider = 'http';
  async send(to: string, body: string): Promise<SmsResult> {
    const { url, apiKey } = env.sms.bulkSms;
    if (!url) {
      logger.warn('Generic HTTP SMS url not configured');
      return { success: false, provider: this.provider };
    }
    const params = new URLSearchParams({ to, body });
    if (apiKey) params.set('api_key', apiKey);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const raw = await res.text().catch(() => null);
    return { success: res.ok, provider: this.provider, raw };
  }
}

function createProvider(): SmsProvider {
  switch (env.sms.provider) {
    case 'twilio':
      return new TwilioProvider();
    case 'bulksms':
      return new BulkSmsProvider();
    case 'http':
      return new HttpProvider();
    default:
      return new LogProvider();
  }
}

export const smsProvider: SmsProvider = createProvider();
