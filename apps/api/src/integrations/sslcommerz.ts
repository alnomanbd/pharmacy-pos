import { logger } from '../utils/logger.js';

/**
 * SSLCommerz: one integration for bKash, Nagad, Rocket, Upay, cards and
 * internet banking.
 *
 * Two calls, both server to server:
 * - **Session** — "this shop wants to pay ৳3,000"; SSLCommerz answers with the
 *   page to send the shop's browser to.
 * - **Validation** — given the `val_id` SSLCommerz posted back, ask SSLCommerz
 *   itself whether the payment is real, for how much, and for which order.
 *   Nothing posted to us by a browser is believed until this says so.
 *
 * Configured by `SSLCZ_STORE_ID` and `SSLCZ_STORE_PASSWORD`. `SSLCZ_SANDBOX`
 * (on unless set to `false`) picks the test gateway. `SSLCZ_BASE_URL`
 * overrides both, which is how the tests point it at a local imitation.
 */

export interface SslczConfig {
  storeId: string;
  storePassword: string;
  baseUrl: string;
  sandbox: boolean;
}

export function sslczConfig(): SslczConfig | null {
  const storeId = process.env.SSLCZ_STORE_ID?.trim() || '';
  const storePassword = process.env.SSLCZ_STORE_PASSWORD?.trim() || '';
  if (!storeId || !storePassword) return null;
  const sandbox = (process.env.SSLCZ_SANDBOX ?? 'true').toLowerCase() !== 'false';
  const baseUrl = (
    process.env.SSLCZ_BASE_URL?.trim() || (sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com')
  ).replace(/\/$/, '');
  return { storeId, storePassword, baseUrl, sandbox };
}

export interface SessionRequest {
  tranId: string;
  amount: number;
  productName: string;
  customer: { name: string; email: string; phone: string; address?: string; city?: string };
  urls: { success: string; fail: string; cancel: string; ipn: string };
}

/** Starts a payment. Returns the gateway page to send the browser to. */
export async function createSession(cfg: SslczConfig, req: SessionRequest): Promise<{ url: string; sessionKey: string }> {
  const body = new URLSearchParams({
    store_id: cfg.storeId,
    store_passwd: cfg.storePassword,
    total_amount: req.amount.toFixed(2),
    currency: 'BDT',
    tran_id: req.tranId,
    success_url: req.urls.success,
    fail_url: req.urls.fail,
    cancel_url: req.urls.cancel,
    ipn_url: req.urls.ipn,
    cus_name: req.customer.name || 'Shop owner',
    cus_email: req.customer.email || 'no-email@dawai.com.bd',
    cus_phone: req.customer.phone || '01700000000',
    cus_add1: req.customer.address || 'Bangladesh',
    cus_city: req.customer.city || 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: req.productName,
    product_category: 'Software subscription',
    product_profile: 'non-physical-goods',
  });
  const res = await fetch(`${cfg.baseUrl}/gwprocess/v4/api.php`, { method: 'POST', body });
  const json = (await res.json().catch(() => null)) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string } | null;
  if (!json || json.status !== 'SUCCESS' || !json.GatewayPageURL) {
    logger.error({ status: json?.status, reason: json?.failedreason }, 'SSLCommerz would not start a session');
    throw new Error(json?.failedreason || 'The payment gateway did not start the payment');
  }
  return { url: json.GatewayPageURL, sessionKey: json.sessionkey ?? '' };
}

/** What SSLCommerz says about a payment. Only the fields we act on. */
export interface Validation {
  status: string;
  tran_id: string;
  val_id: string;
  amount: string;
  currency: string;
  bank_tran_id?: string;
  card_type?: string;
  risk_level?: string;
}

/** Asks SSLCommerz whether `valId` is a real, completed payment. */
export async function validatePayment(cfg: SslczConfig, valId: string): Promise<Validation | null> {
  const q = new URLSearchParams({ val_id: valId, store_id: cfg.storeId, store_passwd: cfg.storePassword, format: 'json' });
  try {
    const res = await fetch(`${cfg.baseUrl}/validator/api/validationserverAPI.php?${q}`);
    return ((await res.json()) as Validation) ?? null;
  } catch (err) {
    logger.error({ err }, 'SSLCommerz validation call failed');
    return null;
  }
}
