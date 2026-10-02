import { OrganizationModel, UserModel } from '../models/index.js';
import * as notify from './notification.service.js';
import { logger } from '../utils/logger.js';
import { sendSms } from '../integrations/sms.js';
import { env } from '../config/env.js';

/**
 * The SMS beside each email. An email is easy to miss at a counter; a text on
 * the owner's phone is read. Off with REMINDER_SMS=off.
 */
const smsOn = () => (process.env.REMINDER_SMS ?? 'on').toLowerCase() !== 'off';

/** Short and in plain ASCII, so it is one SMS segment and costs one SMS. Pure, for the tests. */
export function reminderSms(shop: string, days: number, endsAt: Date, url: string) {
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const date = endsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const name = shop.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 30) || 'Your shop';
  return `Dawai: ${name} subscription ends ${when} (${date}). Renew: ${url}`;
}

/**
 * Warning shops before their subscription runs out.
 *
 * The message that matters is sent while there is still time to act. A shop
 * that discovers it has lapsed on the morning it lapses has customers at the
 * counter and a till that will not ring up a bill, and that is a support call
 * and a bad memory of the product — whereas the same shop warned a week
 * earlier just pays.
 *
 * Only these three points, and only once each. A reminder every day is how a
 * useful message becomes one people filter.
 */
const REMIND_AT_DAYS = [7, 3, 1];

/** Midnight-to-midnight window for "this is the day with N days left". */
function windowFor(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + days);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function sendSubscriptionReminders() {
  let sent = 0;

  for (const days of REMIND_AT_DAYS) {
    const { start, end } = windowFor(days);

    // Only shops that are actually working. A pending one has nothing to
    // renew, and a suspended one has already been told something more urgent.
    const due = await OrganizationModel.find({
      status: 'active',
      trialEndsAt: { $gte: start, $lt: end },
      // Once per threshold: the day it was last warned on is remembered, so a
      // restart of the process does not send the same warning twice.
      lastReminderDays: { $ne: days },
    })
      .select('name owner trialEndsAt modules contactPhone')
      .lean();

    for (const org of due) {
      const owner = org.owner
        ? await UserModel.findById(org.owner).select('name email phone').lean()
        : await UserModel.findOne({ organization: org._id })
            .select('name email phone')
            .sort({ createdAt: 1 })
            .lean();

      if (owner?.email && org.trialEndsAt) {
        await notify.subscriptionEnding({
          email: owner.email,
          name: owner.name,
          shop: org.name,
          daysLeft: days,
          endsAt: org.trialEndsAt,
        });
        sent++;
      }

      const phone = owner?.phone || org.contactPhone || '';
      if (smsOn() && phone && org.trialEndsAt) {
        await sendSms(
          phone,
          reminderSms(org.name, days, new Date(org.trialEndsAt), `${env.clientUrl.replace(/\/$/, '')}/subscription`),
          { kind: 'subscriptionEnding', organization: String(org._id) },
        );
      }

      await OrganizationModel.updateOne({ _id: org._id }, { $set: { lastReminderDays: days } });
    }
  }

  if (sent > 0) logger.info({ sent }, 'Subscription reminders sent');
  return sent;
}
