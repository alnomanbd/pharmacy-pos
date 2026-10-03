/**
 * Points for coming back.
 *
 * A regular earns a point for every so many taka paid, and spends them on a
 * later bill as money off. The rules are the shop's own (Settings → Loyalty):
 * how much buys a point, what a point is worth, the fewest that can be used
 * at once, and how much of one bill points may pay for — so a shop giving 1%
 * back cannot find a whole month's medicine walking out against points.
 *
 * Points spent are a discount on the bill, not a payment: no money changed
 * hands for them, and the day's cash and bKash have to still add up.
 */

export interface LoyaltyRules {
  enabled: boolean;
  /** Taka paid for one point. */
  spendPerPoint: number;
  /** Taka off for one point spent. */
  pointValue: number;
  /** The fewest points that can be spent on one bill. */
  minRedeem: number;
  /** The most of one bill that points may pay for, in percent. */
  maxRedeemPercent: number;
}

export const LOYALTY_DEFAULTS: LoyaltyRules = {
  enabled: false,
  spendPerPoint: 100,
  pointValue: 1,
  minRedeem: 50,
  maxRedeemPercent: 50,
};

const money = (n: number) => Math.round(n * 100) / 100;

export function rulesOf(s?: Partial<LoyaltyRules> | null): LoyaltyRules {
  return { ...LOYALTY_DEFAULTS, ...Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v !== undefined && v !== null)) };
}

/** Points a bill earns, on what was actually paid. */
export function pointsEarned(r: LoyaltyRules, paid: number) {
  if (!r.enabled || !(r.spendPerPoint > 0) || !(paid > 0)) return 0;
  return Math.floor(paid / r.spendPerPoint + 1e-9);
}

/**
 * Points asked for, held to what one bill may take.
 *
 * Whether the customer has that many, and the minimum, are checked by the
 * caller — a bill posted from offline is not refused over them, because the
 * customer has already left with the discount.
 */
export function redeemFor(r: LoyaltyRules, asked: number, bill: number) {
  if (!r.enabled || !(asked > 0) || !(r.pointValue > 0) || !(bill > 0)) return { points: 0, value: 0 };
  const cap = Math.floor((bill * Math.min(100, Math.max(0, r.maxRedeemPercent))) / 100 / r.pointValue + 1e-9);
  const points = Math.max(0, Math.min(Math.floor(asked), cap));
  return { points, value: money(points * r.pointValue) };
}

/** Points a return takes back: the share of the bill that came back, of what it earned. */
export function pointsClawedBack(earned: number, alreadyBack: number, refund: number, total: number) {
  if (!(earned > 0) || !(refund > 0) || !(total > 0)) return 0;
  const owed = Math.round((earned * Math.min(refund, total)) / total);
  return Math.max(0, Math.min(owed, earned - alreadyBack));
}
