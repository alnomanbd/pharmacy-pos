import { Types } from 'mongoose';
import { ShopCustomerModel, ShopSettingsModel } from '../models/index.js';
import { sendSms } from '../integrations/sms.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import type { Actor } from './shop.service.js';

/**
 * Chasing the baki khata, without becoming the shop that nags.
 *
 * The khata was readable and there was no way to act on it, so chasing meant
 * ringing forty people or letting it slide — and it mostly slid. This sends the
 * one line that actually works here: your name, what is outstanding, and
 * nothing else.
 *
 * Four decisions, all of them about not costing the shop a customer:
 *
 * - **It is never automatic.** No scheduler touches this. A reminder is a
 *   favour a shopkeeper asks of somebody they want back next week, and the
 *   decision of when to ask is theirs, not a cron's.
 * - **Once every three days at most**, per customer, counted from the last one
 *   actually sent. The cooldown is enforced here rather than in the screen,
 *   because two counters and a phone are three screens.
 * - **Romanised, not Bengali script.** A Bangla SMS is sent as UCS-2, which
 *   halves the segment to 70 characters and doubles what the shop pays for a
 *   message most feature phones then render as boxes.
 * - **No threats and no interest.** "Please pay" is what a shopkeeper says
 *   across the counter, and the software should not say anything they would
 *   not.
 */

/** Three days, counted from the last message that actually went. */
export const REMIND_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

const money = (n: number) => Math.round((n || 0) * 100) / 100;

/**
 * The message, in one line.
 *
 * Under 160 characters with a long shop name and a five-figure balance, so it
 * is one segment and one charge. The shop's name comes first because that is
 * what tells the reader whether the text is for them.
 */
export function reminderText(shopName: string, balance: number, phone?: string, template?: string, customerName?: string) {
  if (template?.trim()) return fillReminder(template, { name: customerName, amount: balance, shop: shopName, phone });
  const who = shopName.trim() || 'Your pharmacy';
  const call = phone?.trim() ? ` Call ${phone.trim()}.` : '';
  return `${who}: apnar bakite ache Tk ${money(balance)}. Shubidha moto poriShodh korle krritajno thakbo.${call}`;
}

/**
 * The shop's own wording, with the blanks filled in.
 *
 * `{name}` the customer, `{amount}` what they owe (a number — the shop writes
 * "Tk" or "টাকা" itself), `{shop}` and `{phone}` the shop's. A blank with
 * nothing to put in it goes, and so does the space it leaves, so "Call {phone}"
 * for a shop with no number does not end in "Call ." Unknown braces are left as
 * typed — a shop that writes "{bill}" sees it in the preview and fixes it.
 */
export function fillReminder(
  template: string,
  v: { name?: string; amount: number; shop?: string; phone?: string },
): string {
  const values: Record<string, string> = {
    name: (v.name ?? '').trim(),
    amount: String(money(v.amount)),
    shop: (v.shop ?? '').trim(),
    phone: (v.phone ?? '').trim(),
  };
  return template
    .replace(/\{(name|amount|shop|phone)\}/gi, (_, key: string) => values[key.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?।])/g, '$1')
    .trim();
}

export interface RemindOutcome {
  sent: number;
  skipped: { name: string; why: string }[];
}

interface Chaseable {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  balance: number;
  lastRemindedAt?: Date | null;
}

async function shopIdentity(org: string) {
  const settings = await ShopSettingsModel.findOne({ organization: org })
    .select('shopName phone reminderTemplate')
    .lean();
  return { name: settings?.shopName ?? '', phone: settings?.phone ?? '', template: settings?.reminderTemplate ?? '', org };
}

/**
 * Sends to one account, and says why when it does not.
 *
 * Failures are reported rather than swallowed, unlike the fire-and-forget sends
 * elsewhere in this codebase: nothing else is happening in this request, the
 * person pressed a button and is watching, and "sent" when nothing was sent is
 * the one outcome that makes the feature worse than the phone.
 */
async function chase(
  customer: Chaseable,
  shop: { name: string; phone: string; template?: string; org?: string },
  now: Date,
): Promise<{ ok: boolean; why?: string }> {
  if (!(customer.balance > 0)) return { ok: false, why: 'nothing owing' };
  if (!customer.phone?.trim()) return { ok: false, why: 'no phone number' };

  const last = customer.lastRemindedAt ? new Date(customer.lastRemindedAt).getTime() : 0;
  if (now.getTime() - last < REMIND_COOLDOWN_MS) return { ok: false, why: 'reminded in the last three days' };

  try {
    const sent = await sendSms(customer.phone.trim(), reminderText(shop.name, customer.balance, shop.phone, shop.template, customer.name), {
      kind: 'shop.bakiReminder',
      organization: shop.org,
    });
    if (!sent.success) throw new Error('SMS provider did not accept the message');
  } catch (err) {
    logger.error({ err, customer: String(customer._id) }, 'Baki reminder failed');
    return { ok: false, why: 'the message did not go' };
  }

  await ShopCustomerModel.updateOne(
    { _id: customer._id },
    { $set: { lastRemindedAt: now }, $inc: { remindersSent: 1 } },
  );
  return { ok: true };
}

export async function remindCustomer(actor: Actor, id: string): Promise<RemindOutcome> {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');

  const customer = await ShopCustomerModel.findOne({
    _id: new Types.ObjectId(id),
    organization: actor.org,
    deletedAt: null,
  }).lean();
  if (!customer) throw notFound('Customer');

  const shop = await shopIdentity(actor.org);
  const result = await chase(customer as Chaseable, shop, new Date());

  /* One customer, one button: the reason it did not go is the answer, so it is
     said out loud rather than returned as a zero. */
  if (!result.ok) throw badRequest(`Not sent — ${result.why}`);
  return { sent: 1, skipped: [] };
}

/**
 * Everybody over a figure, in one pass.
 *
 * The threshold is required rather than defaulted to nothing: "text all forty"
 * should be a number somebody typed, not what happens when a button is pressed
 * without thinking.
 */
export async function remindEveryone(
  actor: Actor,
  opts: { minBalance: number },
): Promise<RemindOutcome> {
  if (!(opts.minBalance > 0)) throw badRequest('Who should be chased? Set an amount first');

  const customers = await ShopCustomerModel.find({
    organization: actor.org,
    deletedAt: null,
    balance: { $gte: opts.minBalance },
  })
    .sort({ balance: -1 })
    .limit(200)
    .lean();

  const shop = await shopIdentity(actor.org);
  const now = new Date();

  let sent = 0;
  const skipped: { name: string; why: string }[] = [];
  for (const c of customers) {
    const result = await chase(c as Chaseable, shop, now);
    if (result.ok) sent += 1;
    else skipped.push({ name: c.name, why: result.why! });
  }

  return { sent, skipped };
}
