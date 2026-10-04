import { Schema, model, Types } from 'mongoose';
import { ShopSettingsModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { seal, open } from '../utils/secretBox.js';
import { createPayment, executePayment, queryPayment, type BkashCreds } from '../integrations/bkash.js';
import { writeBranchOf } from './branchScope.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { Actor } from './shop.service.js';

/**
 * bKash and Nagad at the counter.
 *
 * Two ways, and a shop can use either:
 *
 * - **Its own number.** The till shows a QR and the number with the amount,
 *   the customer sends money from their phone, and the salesman types the
 *   transaction id from the SMS onto the bill. Works with any personal or
 *   agent number, today.
 * - **A bKash merchant account.** With the shop's merchant API keys saved
 *   here, the till starts the payment itself: the customer scans the QR,
 *   pays on bKash's own page with their PIN, and the till sees it arrive —
 *   amount and transaction id filled in, nothing typed. Nagad's merchant API
 *   is not wired yet; Nagad stays on the first way.
 */

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface WalletSettings {
  bkashNumber: string;
  nagadNumber: string;
  /** Shown with a QR at the counter, as bKash's and Nagad's are. */
  rocketNumber: string;
  upayNumber: string;
  bkashApi: { enabled: boolean; sandbox: boolean; appKey: string; username: string; hasSecret: boolean; hasPassword: boolean };
}

type Stored = {
  wallets?: {
    bkashNumber?: string;
    nagadNumber?: string;
    rocketNumber?: string;
    upayNumber?: string;
    bkashApi?: { enabled?: boolean; sandbox?: boolean; appKey?: string; username?: string; appSecret?: string; password?: string };
  };
};

async function stored(org: string) {
  /* The two secrets are `select: false` on the model; read straight from the collection, they come along. */
  const s = (await ShopSettingsModel.collection.findOne(
    { organization: new Types.ObjectId(org) },
    { projection: { wallets: 1 } },
  )) as Stored | null;
  return s?.wallets ?? {};
}

export async function walletSettings(org: string): Promise<WalletSettings> {
  const w = await stored(org);
  return {
    bkashNumber: w.bkashNumber ?? '',
    nagadNumber: w.nagadNumber ?? '',
    rocketNumber: w.rocketNumber ?? '',
    upayNumber: w.upayNumber ?? '',
    bkashApi: {
      enabled: !!w.bkashApi?.enabled,
      sandbox: w.bkashApi?.sandbox ?? false,
      appKey: w.bkashApi?.appKey ?? '',
      username: w.bkashApi?.username ?? '',
      hasSecret: !!w.bkashApi?.appSecret,
      hasPassword: !!w.bkashApi?.password,
    },
  };
}

export async function saveWalletSettings(
  org: string,
  input: {
    bkashNumber?: string;
    nagadNumber?: string;
    rocketNumber?: string;
    upayNumber?: string;
    bkashApi?: { enabled?: boolean; sandbox?: boolean; appKey?: string; username?: string; appSecret?: string; password?: string };
  },
) {
  const set: Record<string, unknown> = {};
  if (input.bkashNumber !== undefined) set['wallets.bkashNumber'] = input.bkashNumber.replace(/[^\d+]/g, '');
  if (input.nagadNumber !== undefined) set['wallets.nagadNumber'] = input.nagadNumber.replace(/[^\d+]/g, '');
  if (input.rocketNumber !== undefined) set['wallets.rocketNumber'] = input.rocketNumber.replace(/[^\d+]/g, '');
  if (input.upayNumber !== undefined) set['wallets.upayNumber'] = input.upayNumber.replace(/[^\d+]/g, '');
  const a = input.bkashApi;
  if (a) {
    if (a.enabled !== undefined) set['wallets.bkashApi.enabled'] = a.enabled;
    if (a.sandbox !== undefined) set['wallets.bkashApi.sandbox'] = a.sandbox;
    if (a.appKey !== undefined) set['wallets.bkashApi.appKey'] = a.appKey.trim();
    if (a.username !== undefined) set['wallets.bkashApi.username'] = a.username.trim();
    /* Secrets are written only when given, and never read back out. */
    if (a.appSecret) set['wallets.bkashApi.appSecret'] = seal(a.appSecret.trim());
    if (a.password) set['wallets.bkashApi.password'] = seal(a.password.trim());
  }
  await ShopSettingsModel.updateOne({ organization: org }, { $set: set }, { upsert: true });
  return walletSettings(org);
}

async function creds(org: string): Promise<BkashCreds | null> {
  const a = (await stored(org)).bkashApi;
  if (!a?.enabled || !a.appKey || !a.username || !a.appSecret || !a.password) return null;
  const appSecret = open(a.appSecret);
  const password = open(a.password);
  if (!appSecret || !password) return null;
  return { appKey: a.appKey, appSecret, username: a.username, password, sandbox: !!a.sandbox };
}

/** What the till needs to know: the numbers to show, and whether bKash can be confirmed automatically. */
export async function counterWallets(org: string) {
  const w = await walletSettings(org);
  return {
    bkashNumber: w.bkashNumber,
    nagadNumber: w.nagadNumber,
    rocketNumber: w.rocketNumber,
    upayNumber: w.upayNumber,
    bkashAuto: !!(await creds(org)),
  };
}

/* ------------------------------------------------------------------ */
/* A payment started at the till                                        */
/* ------------------------------------------------------------------ */

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    method: { type: String, enum: ['bkash'], default: 'bkash' },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending', index: true },
    paymentID: { type: String, index: true },
    payURL: { type: String, default: '' },
    trxID: { type: String, default: '' },
    payer: { type: String, default: '' },
    message: { type: String, default: '' },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export const WalletPaymentModel = model('WalletPayment', schema);

const callbackBase = () =>
  (process.env.BKASH_CALLBACK_BASE?.trim() || process.env.SSLCZ_CALLBACK_BASE?.trim() || `${env.clientUrl.replace(/\/$/, '')}/api`).replace(/\/$/, '');

export async function startBkash(actor: Actor, amount: number) {
  if (!(amount > 0)) throw badRequest('Enter the amount to take by bKash');
  const c = await creds(actor.org);
  if (!c) throw badRequest('Automatic bKash is not set up — add the merchant keys in Settings, or use your bKash number.');
  const doc = await WalletPaymentModel.create({
    organization: actor.org,
    branch: await writeBranchOf(actor).catch(() => null),
    amount: Math.round(amount * 100) / 100,
    startedBy: actor.id,
  });
  try {
    const p = await createPayment(c, {
      amount: doc.amount,
      invoice: `POS-${String(doc._id).slice(-10)}`,
      payer: '',
      callbackURL: `${callbackBase()}/public/bkash/callback`,
    });
    doc.set({ paymentID: p.paymentID, payURL: p.bkashURL });
    await doc.save();
    return { id: String(doc._id), payURL: p.bkashURL, amount: doc.amount };
  } catch (err) {
    doc.set({ status: 'failed', message: (err as Error).message });
    await doc.save();
    throw badRequest((err as Error).message);
  }
}

/** Where a payment stands, asking bKash when it is still open. */
export async function walletStatus(actor: Actor, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Payment');
  const doc = await WalletPaymentModel.findOne({ _id: id, organization: actor.org });
  if (!doc) throw notFound('Payment');
  if (doc.status === 'pending' && doc.paymentID && Date.now() - doc.createdAt.getTime() > 8_000) {
    const c = await creds(actor.org);
    if (c) {
      const q = await queryPayment(c, doc.paymentID).catch(() => null);
      if (q?.transactionStatus === 'Completed' && q.trxID) doc.set({ status: 'completed', trxID: q.trxID, payer: q.customerMsisdn ?? '' });
      await doc.save();
    }
  }
  return { status: doc.status, trxID: doc.trxID, amount: doc.amount, payer: doc.payer, message: doc.message };
}

export async function cancelWallet(actor: Actor, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Payment');
  await WalletPaymentModel.updateOne({ _id: id, organization: actor.org, status: 'pending' }, { $set: { status: 'cancelled' } });
  return { ok: true };
}

/**
 * Where bKash sends the customer back after they pay (or give up). The
 * payment is executed here — that is the step that takes the money — and the
 * till sees it on its next look.
 */
export async function bkashCallback(paymentID: string, status: string) {
  const doc = await WalletPaymentModel.findOne({ paymentID });
  if (!doc) return { ok: false, message: 'Payment not found' };
  if (doc.status !== 'pending') return { ok: doc.status === 'completed', message: doc.status };
  if (status !== 'success') {
    doc.set({ status: status === 'cancel' ? 'cancelled' : 'failed', message: status });
    await doc.save();
    return { ok: false, message: status };
  }
  const c = await creds(String(doc.organization));
  if (!c) return { ok: false, message: 'Not set up' };
  const r = await executePayment(c, paymentID).catch((err) => ({ statusMessage: (err as Error).message }) as never);
  if (r?.transactionStatus === 'Completed' && r.trxID) {
    doc.set({ status: 'completed', trxID: r.trxID, payer: r.customerMsisdn ?? '' });
  } else {
    doc.set({ status: 'failed', message: r?.statusMessage ?? 'Not completed' });
    logger.warn({ paymentID, message: r?.statusMessage }, 'bKash payment not completed');
  }
  await doc.save();
  const done = (doc.get('status') as string) === 'completed';
  return { ok: done, message: doc.message, amount: doc.amount, trxID: doc.trxID };
}
