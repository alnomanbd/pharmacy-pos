import { Schema, model, Types } from 'mongoose';
import webpush from 'web-push';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { seal, open } from '../utils/secretBox.js';
import { badRequest } from '../utils/AppError.js';
import { todayKey, formatDayKey } from '../utils/date.js';
import { SaleModel, ShopSettingsModel, UserModel, OrganizationModel } from '../models/index.js';
import { bnDigits, num, type Lang } from '../i18n/numerals.js';
import { stockAlerts } from './till.service.js';
import type { Actor } from './shop.service.js';

/**
 * Alerts on the owner's phone.
 *
 * The shop app installs on a phone's home screen, and a phone that has said
 * yes gets three kinds of message without the app being open:
 *
 * - **takings** — at closing time, what the day came to, against yesterday;
 * - **stock** — in the morning, what has expired, what is about to, and what
 *   has run out or is running low;
 * - **orders** — the moment a customer places an order through the shop's link.
 *
 * Standard Web Push: the browser hands over a subscription, and messages are
 * signed with this server's VAPID keys — from the environment when set, or
 * made once and kept (sealed) in the database so a fresh install works with
 * nothing configured.
 *
 * Each phone is written to in the language of the person who signed it up
 * (their `User.lang`, kept from the shop app's screen), so one shop can have
 * the owner's phone in Bangla and the manager's in English. A phone whose
 * person cannot be found falls back to the shop owner's language.
 */

export type PushKind = 'takings' | 'stock' | 'orders';
export const PUSH_KINDS: PushKind[] = ['takings', 'stock', 'orders'];

/* When the two digests go out, in the shop's own timezone. */
const TAKINGS_HOUR = 21;
const STOCK_HOUR = 9;

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

const subscriptionSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    kinds: { type: [String], enum: PUSH_KINDS, default: PUSH_KINDS },
    device: { type: String, default: '', maxlength: 160 },
    /** The day each digest last went to this phone, so it goes once. */
    sent: { takings: { type: String, default: '' }, stock: { type: String, default: '' } },
    failures: { type: Number, default: 0 },
    lastOkAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const PushSubscriptionModel = model('PushSubscription', subscriptionSchema);

/** Server-made secrets that must outlive a restart — today only the VAPID pair. */
const AppSecretModel = model(
  'AppSecret',
  new Schema({ name: { type: String, required: true, unique: true }, value: { type: String, required: true } }, { timestamps: true }),
);

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

type Vapid = { publicKey: string; privateKey: string };
let vapid: Vapid | null = null;

async function keys() {
  if (vapid) return vapid;
  const fromEnv = { publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? '', privateKey: process.env.VAPID_PRIVATE_KEY?.trim() ?? '' };
  if (fromEnv.publicKey && fromEnv.privateKey) {
    vapid = fromEnv;
  } else {
    const kept = await AppSecretModel.findOne({ name: 'vapid' }).lean();
    const parsed = kept ? (JSON.parse(open(kept.value) || 'null') as Vapid | null) : null;
    if (parsed?.publicKey && parsed.privateKey) vapid = parsed;
    else {
      vapid = webpush.generateVAPIDKeys();
      await AppSecretModel.updateOne({ name: 'vapid' }, { $set: { value: seal(JSON.stringify(vapid)) } }, { upsert: true });
      logger.info('Made a VAPID key pair for push alerts');
    }
  }
  const subject = process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.SUPPORT_EMAIL?.trim() || 'support@dawai.com.bd'}`;
  webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

export async function publicKey() {
  return { publicKey: (await keys()).publicKey };
}

/* ------------------------------------------------------------------ */
/* This phone                                                          */
/* ------------------------------------------------------------------ */

export interface SubscribeInput {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  kinds?: PushKind[];
  device?: string;
}

export async function subscribe(actor: Actor, input: SubscribeInput) {
  const { endpoint, keys: k } = input.subscription;
  if (!/^https:\/\//.test(endpoint)) throw badRequest('That is not a push address');
  await PushSubscriptionModel.updateOne(
    { endpoint },
    {
      $set: {
        organization: actor.org,
        user: actor.id,
        keys: k,
        kinds: (input.kinds ?? PUSH_KINDS).filter((x) => PUSH_KINDS.includes(x)),
        device: (input.device ?? '').slice(0, 160),
        failures: 0,
      },
    },
    { upsert: true },
  );
  return mine(actor, endpoint);
}

export async function mine(actor: Actor, endpoint: string) {
  const s = await PushSubscriptionModel.findOne({ endpoint, organization: actor.org }).select('kinds device').lean();
  const count = await PushSubscriptionModel.countDocuments({ organization: actor.org });
  return { subscribed: !!s, kinds: (s?.kinds ?? []) as PushKind[], phones: count };
}

export async function setKinds(actor: Actor, endpoint: string, kinds: PushKind[]) {
  await PushSubscriptionModel.updateOne({ endpoint, organization: actor.org }, { $set: { kinds: kinds.filter((x) => PUSH_KINDS.includes(x)) } });
  return mine(actor, endpoint);
}

export async function unsubscribe(actor: Actor, endpoint: string) {
  await PushSubscriptionModel.deleteOne({ endpoint, organization: actor.org });
  return { subscribed: false };
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap opens, inside the shop app. */
  url?: string;
  /** A message with the same tag replaces the last one rather than stacking. */
  tag?: string;
}

/** A message, or how to write it in a language — `null` when there is nothing to say. */
export type PushContent = PushMessage | ((lang: Lang) => PushMessage | null);

type SubDoc = {
  _id: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user?: Types.ObjectId | null;
  organization?: Types.ObjectId | null;
};

const SUB_FIELDS = 'endpoint keys user organization';

const asLang = (v: unknown): Lang => (v === 'bn' ? 'bn' : 'en');

/**
 * The language for each phone: its person's, else the shop owner's, else
 * English. Only shop people sign phones up, so no operator check is needed.
 */
async function langsOf(subs: SubDoc[]): Promise<Map<string, Lang>> {
  const userIds = [...new Set(subs.map((s) => (s.user ? String(s.user) : '')).filter(Boolean))];
  const users = userIds.length ? await UserModel.find({ _id: { $in: userIds } }).select('lang').lean() : [];
  const byUser = new Map(users.map((u) => [String(u._id), asLang(u.lang)]));

  const byOrg = new Map<string, Lang>();
  const orphans = subs.filter((s) => !s.user || !byUser.has(String(s.user)));
  const orgIds = [...new Set(orphans.map((s) => (s.organization ? String(s.organization) : '')).filter(Boolean))];
  if (orgIds.length) {
    const orgs = (await OrganizationModel.find({ _id: { $in: orgIds } }).select('owner').lean()) as {
      _id: Types.ObjectId;
      owner?: Types.ObjectId | null;
    }[];
    const ownerIds = orgs.map((o) => o.owner).filter(Boolean);
    const owners = ownerIds.length ? await UserModel.find({ _id: { $in: ownerIds } }).select('lang').lean() : [];
    const ownerLang = new Map(owners.map((u) => [String(u._id), asLang(u.lang)]));
    for (const o of orgs) byOrg.set(String(o._id), (o.owner && ownerLang.get(String(o.owner))) || 'en');
  }

  const out = new Map<string, Lang>();
  for (const s of subs) {
    out.set(
      String(s._id),
      (s.user && byUser.get(String(s.user))) || (s.organization && byOrg.get(String(s.organization))) || 'en',
    );
  }
  return out;
}

/** Each phone gets the message in its own person's language. */
async function deliver(subs: SubDoc[], content: PushContent) {
  if (subs.length === 0) return 0;
  if (typeof content !== 'function') return send(subs, content);
  let langs: Map<string, Lang>;
  try {
    langs = await langsOf(subs);
  } catch (err) {
    logger.warn({ err }, 'Could not look up push languages; sending in English');
    langs = new Map();
  }
  let ok = 0;
  for (const lang of ['en', 'bn'] as const) {
    const group = subs.filter((s) => (langs.get(String(s._id)) ?? 'en') === lang);
    const msg = group.length ? content(lang) : null;
    if (msg) ok += await send(group, msg);
  }
  return ok;
}

async function send(subs: SubDoc[], msg: PushMessage) {
  if (subs.length === 0) return 0;
  await keys();
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 60 * 60 * 12 });
        ok++;
        await PushSubscriptionModel.updateOne({ _id: s._id }, { $set: { failures: 0, lastOkAt: new Date() } });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        /* Gone means the phone unsubscribed or the app was removed: forget it. */
        if (code === 404 || code === 410) await PushSubscriptionModel.deleteOne({ _id: s._id });
        else {
          await PushSubscriptionModel.updateOne({ _id: s._id }, { $inc: { failures: 1 } });
          logger.warn({ code, err: (err as Error).message }, 'Push not delivered');
        }
      }
    }),
  );
  /* A phone that has failed twenty times running is not coming back. */
  await PushSubscriptionModel.deleteMany({ failures: { $gte: 20 } });
  return ok;
}

/** To every phone in the shop that wants this kind. Never throws — an alert is not worth failing a request over. */
export async function pushToShop(org: string | Types.ObjectId, kind: PushKind, msg: PushContent) {
  try {
    const subs = await PushSubscriptionModel.find({ organization: org, kinds: kind }).select(SUB_FIELDS).lean();
    return await deliver(subs as SubDoc[], msg);
  } catch (err) {
    logger.warn({ err }, 'Push to shop failed');
    return 0;
  }
}

export async function sendTest(actor: Actor, endpoint: string) {
  const s = await PushSubscriptionModel.findOne({ endpoint, organization: actor.org }).select(SUB_FIELDS).lean();
  if (!s) throw badRequest('This phone is not signed up for alerts');
  const n = await deliver([s as SubDoc], testMessage);
  if (!n) throw badRequest('The phone did not take it — try turning alerts off and on again.');
  return { sent: n };
}

/* ------------------------------------------------------------------ */
/* The two digests                                                     */
/* ------------------------------------------------------------------ */

const taka = (n: number, lang: Lang = 'en') => `৳${num(Math.round(n), lang, 'en-IN')}`;

export function testMessage(lang: Lang = 'en'): PushMessage {
  return {
    title: 'Dawai',
    body: lang === 'bn' ? 'অ্যালার্ট চালু আছে। এভাবেই দেখাবে।' : 'Alerts are on. This is how they will look.',
    url: '/dashboard',
    tag: 'test',
  };
}

/** A new order through the shop's link. The order number is an identifier and stays as it is. */
export function orderMessage(
  o: { number: string; customerName: string; mode: string; lines: { name: string; qty: number }[]; items?: string },
  lang: Lang = 'en',
): PushMessage {
  const bn = lang === 'bn';
  const mode = o.mode === 'delivery' ? (bn ? 'ডেলিভারি' : 'delivery') : bn ? 'দোকানে এসে নেবেন' : 'pickup';
  const what = o.lines.length
    ? ` — ${o.lines.map((l) => `${l.name} ×${bn ? bnDigits(l.qty) : l.qty}`).join(', ').slice(0, 90)}`
    : o.items
      ? ` — ${o.items.split(/\r?\n/)[0].slice(0, 80)}`
      : '';
  return {
    title: bn ? `নতুন অর্ডার ${o.number}` : `New order ${o.number}`,
    body: `${o.customerName} · ${mode}${what}`,
    url: '/online-orders',
    tag: `order-${o.number}`,
  };
}

function hourInAppTz(now: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: env.appTz, hour: '2-digit', hour12: false }).format(now)) % 24;
}

export async function takingsFor(org: Types.ObjectId, day: string) {
  const [r] = await SaleModel.aggregate<{ total: number; bills: number }>([
    { $match: { organization: org, dayKey: day, status: { $ne: 'void' }, deletedAt: null } },
    { $group: { _id: null, total: { $sum: '$total' }, bills: { $sum: 1 } } },
  ]);
  return { total: r?.total ?? 0, bills: r?.bills ?? 0 };
}

export function takingsMessage(
  today: { total: number; bills: number },
  yesterday: { total: number },
  lang: Lang = 'en',
): PushMessage {
  const diff = yesterday.total > 0 ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100) : null;
  if (lang === 'bn') {
    const vs =
      diff === null
        ? ''
        : diff >= 0
          ? ` · গতকালের চেয়ে ${bnDigits(diff)}% বেশি`
          : ` · গতকালের চেয়ে ${bnDigits(Math.abs(diff))}% কম`;
    return {
      title: `আজ: ${taka(today.total, lang)}`,
      body: `${bnDigits(today.bills)}টি বিল${vs}। দিনের রিপোর্ট দেখতে ট্যাপ করুন।`,
      url: '/reports',
      tag: 'takings',
    };
  }
  const vs = diff === null ? '' : diff >= 0 ? ` · ${diff}% up on yesterday` : ` · ${Math.abs(diff)}% down on yesterday`;
  return {
    title: `Today: ${taka(today.total)}`,
    body: `${today.bills} ${today.bills === 1 ? 'bill' : 'bills'}${vs}. Tap for the day's report.`,
    url: '/reports',
    tag: 'takings',
  };
}

export function stockMessage(
  a: { expired: number; expiring: number; out: number; low: number },
  lang: Lang = 'en',
): PushMessage | null {
  const url = a.expired || a.expiring ? '/expiry' : '/stock?status=low';
  if (lang === 'bn') {
    const bnParts = [
      a.expired && `তাকে ${bnDigits(a.expired)}টি লটের মেয়াদ শেষ`,
      a.expiring && `${bnDigits(a.expiring)}টির শীঘ্রই মেয়াদ শেষ`,
      a.out && `${bnDigits(a.out)}টির স্টক শেষ`,
      a.low && `${bnDigits(a.low)}টি কমে আসছে`,
    ].filter(Boolean);
    if (!bnParts.length) return null;
    return { title: 'আজ সকালের স্টক', body: `${bnParts.join(' · ')}।`, url, tag: 'stock' };
  }
  const parts = [
    a.expired && `${a.expired} expired ${a.expired === 1 ? 'lot' : 'lots'} on the shelf`,
    a.expiring && `${a.expiring} expiring soon`,
    a.out && `${a.out} out of stock`,
    a.low && `${a.low} running low`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return { title: 'Stock this morning', body: `${parts.join(' · ')}.`, url, tag: 'stock' };
}

/**
 * Called by the scheduler every few minutes. Each phone gets each digest once
 * a day, on the first tick after its hour — so a server that was down at nine
 * still sends the morning's when it comes back, and never twice.
 */
export async function sendDigests(now = new Date()) {
  const hour = hourInAppTz(now);
  const day = formatDayKey(todayKey(now));
  const due: ('takings' | 'stock')[] = [];
  if (hour >= TAKINGS_HOUR) due.push('takings');
  if (hour >= STOCK_HOUR && hour < TAKINGS_HOUR + 2) due.push('stock');
  let sent = 0;

  for (const kind of due) {
    const subs = await PushSubscriptionModel.find({ kinds: kind, [`sent.${kind}`]: { $ne: day } }).select(SUB_FIELDS).lean();
    const byOrg = new Map<string, typeof subs>();
    for (const s of subs) byOrg.set(String(s.organization), [...(byOrg.get(String(s.organization)) ?? []), s]);

    for (const [org, list] of byOrg) {
      let msg: PushContent | null = null;
      try {
        if (kind === 'takings') {
          const oid = new Types.ObjectId(org);
          const yesterday = formatDayKey(todayKey(new Date(now.getTime() - 86_400_000)));
          const t = await takingsFor(oid, day);
          /* A shop that sold nothing today is closed, not worth waking. */
          if (t.bills > 0) {
            const y = await takingsFor(oid, yesterday);
            msg = (lang) => takingsMessage(t, y, lang);
          }
        } else {
          const settings = await ShopSettingsModel.findOne({ organization: org }).select('_id').lean();
          if (settings) {
            const a = await stockAlerts({ org, id: org, name: 'Dawai' });
            if (stockMessage(a.counts)) msg = (lang) => stockMessage(a.counts, lang);
          }
        }
      } catch (err) {
        logger.warn({ err, org, kind }, 'Could not work out a digest');
        continue;
      }
      await PushSubscriptionModel.updateMany({ _id: { $in: list.map((s) => s._id) } }, { $set: { [`sent.${kind}`]: day } });
      if (msg) sent += await deliver(list as SubDoc[], msg);
    }
  }
  return sent;
}
