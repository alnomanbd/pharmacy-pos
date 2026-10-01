import { OrganizationModel, UserModel } from '../models/index.js';
import * as notify from './notification.service.js';
import { logger } from '../utils/logger.js';

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
      .select('name owner trialEndsAt modules')
      .lean();

    for (const org of due) {
      const owner = org.owner
        ? await UserModel.findById(org.owner).select('name email').lean()
        : await UserModel.findOne({ organization: org._id })
            .select('name email')
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

      await OrganizationModel.updateOne({ _id: org._id }, { $set: { lastReminderDays: days } });
    }
  }

  if (sent > 0) logger.info({ sent }, 'Subscription reminders sent');
  return sent;
}
