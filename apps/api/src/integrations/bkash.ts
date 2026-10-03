import { logger } from '../utils/logger.js';

/**
 * bKash Tokenized Checkout — the merchant API, for a payment the customer
 * makes on their own phone and the till learns about without anybody typing a
 * transaction id.
 *
 * Four calls: a token (cached until it expires), create (returns the page the
 * customer pays on), execute (after bKash sends them back), and query (to ask
 * where a payment stands). Each shop uses its own merchant credentials.
 */

export interface BkashCreds {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  sandbox: boolean;
}

const base = (c: BkashCreds) =>
  c.sandbox ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout' : 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout';

const tokens = new Map<string, { token: string; until: number }>();

async function call<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    logger.warn({ status: r.status, url }, 'bKash answered with something that is not JSON');
    throw new Error('bKash did not answer properly — try again.');
  }
}

async function token(c: BkashCreds): Promise<string> {
  const k = `${c.sandbox}:${c.username}:${c.appKey}`;
  const hit = tokens.get(k);
  if (hit && hit.until > Date.now()) return hit.token;
  const j = await call<{ id_token?: string; expires_in?: number; statusMessage?: string; msg?: string }>(
    `${base(c)}/token/grant`,
    { username: c.username, password: c.password },
    { app_key: c.appKey, app_secret: c.appSecret },
  );
  if (!j.id_token) throw new Error(`bKash refused the merchant login: ${j.statusMessage || j.msg || 'unknown'}`);
  tokens.set(k, { token: j.id_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000 });
  return j.id_token;
}

const auth = async (c: BkashCreds) => ({ Authorization: await token(c), 'X-App-Key': c.appKey });

export async function createPayment(c: BkashCreds, p: { amount: number; invoice: string; payer: string; callbackURL: string }) {
  const j = await call<{ paymentID?: string; bkashURL?: string; statusCode?: string; statusMessage?: string }>(
    `${base(c)}/create`,
    await auth(c),
    {
      mode: '0011',
      payerReference: p.payer || ' ',
      callbackURL: p.callbackURL,
      amount: p.amount.toFixed(2),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: p.invoice,
    },
  );
  if (!j.paymentID || !j.bkashURL) throw new Error(`bKash could not start the payment: ${j.statusMessage || 'unknown'}`);
  return { paymentID: j.paymentID, bkashURL: j.bkashURL };
}

export interface BkashResult {
  transactionStatus?: string;
  trxID?: string;
  amount?: string;
  customerMsisdn?: string;
  statusCode?: string;
  statusMessage?: string;
}

export async function executePayment(c: BkashCreds, paymentID: string) {
  return call<BkashResult>(`${base(c)}/execute`, await auth(c), { paymentID });
}

export async function queryPayment(c: BkashCreds, paymentID: string) {
  return call<BkashResult>(`${base(c)}/payment/status`, await auth(c), { paymentID });
}
