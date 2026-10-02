import { Types } from 'mongoose';
import {
  OrganizationModel,
  ShopSettingsModel,
  ShopProductModel,
  PurchaseModel,
  SaleModel,
  UserModel,
  ShopCustomerModel,
} from '../models/index.js';

/**
 * Getting a new shop going: the six things that make Dawai the shop's real
 * system rather than an app somebody signed up to.
 *
 * Trials are mostly lost in the first week, by a shop that signed up, looked
 * at an empty stock list and went back to the notebook. A checklist in the shop
 * app says what to do next; the same list in the console says which new shops
 * are stuck, so somebody can ring before the trial runs out.
 *
 * Every step is read from what the shop has actually done — nothing is ticked
 * by hand, so the list cannot say "done" about a shop that is not.
 */

export const SETUP_STEPS = [
  { key: 'details', label: 'Put your shop’s name and phone on the receipt', href: '/settings' },
  { key: 'medicines', label: 'Add the medicines you sell (at least 5)', href: '/stock' },
  { key: 'purchase', label: 'Record a delivery from a supplier', href: '/purchases' },
  { key: 'sale', label: 'Ring up your first bill', href: '/' },
  { key: 'staff', label: 'Add a pharmacist or salesman', href: '/staff' },
  { key: 'customer', label: 'Add a customer, for baki', href: '/customers' },
] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number]['key'];

/** At least this many products before "medicines" counts: one test item is not a stock list. */
export const MIN_PRODUCTS = 5;

export interface SetupFacts {
  details: boolean;
  products: number;
  purchases: number;
  sales: number;
  users: number;
  customers: number;
}

/** The checklist from what a shop has done. Pure, for the tests. */
export function stepsFrom(f: SetupFacts) {
  const done: Record<SetupStepKey, boolean> = {
    details: f.details,
    medicines: f.products >= MIN_PRODUCTS,
    purchase: f.purchases > 0,
    sale: f.sales > 0,
    staff: f.users >= 2,
    customer: f.customers > 0,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}

const countBy = (rows: { _id: unknown; n: number }[]) => new Map(rows.map((r) => [String(r._id), r.n]));

/** Setup for many shops at once, for the console's lists. */
export async function setupForMany(orgIds: (string | Types.ObjectId)[]) {
  const ids = orgIds.map((id) => new Types.ObjectId(String(id)));
  if (!ids.length) return new Map<string, ReturnType<typeof stepsFrom>>();
  const group = (match: Record<string, unknown>) => [
    { $match: { organization: { $in: ids }, ...match } },
    { $group: { _id: '$organization', n: { $sum: 1 } } },
  ];
  const [settings, products, purchases, sales, users, customers] = await Promise.all([
    ShopSettingsModel.find({ organization: { $in: ids } }).select('organization shopName phone').lean(),
    ShopProductModel.aggregate<{ _id: unknown; n: number }>(group({ deletedAt: null })),
    PurchaseModel.aggregate<{ _id: unknown; n: number }>(group({})),
    SaleModel.aggregate<{ _id: unknown; n: number }>(group({ status: { $ne: 'void' } })),
    UserModel.aggregate<{ _id: unknown; n: number }>(group({ isActive: { $ne: false } })),
    ShopCustomerModel.aggregate<{ _id: unknown; n: number }>(group({ deletedAt: null })),
  ]);
  const detailsOf = new Map(settings.map((s) => [String(s.organization), Boolean(s.shopName?.trim() && s.phone?.trim())]));
  const [p, pu, sa, u, c] = [products, purchases, sales, users, customers].map(countBy);
  const out = new Map<string, ReturnType<typeof stepsFrom>>();
  for (const id of ids) {
    const k = String(id);
    out.set(
      k,
      stepsFrom({
        details: detailsOf.get(k) ?? false,
        products: p.get(k) ?? 0,
        purchases: pu.get(k) ?? 0,
        sales: sa.get(k) ?? 0,
        users: u.get(k) ?? 0,
        customers: c.get(k) ?? 0,
      }),
    );
  }
  return out;
}

/** One shop's checklist, and whether the owner has put it away. */
export async function setupOf(orgId: string) {
  const [map, org] = await Promise.all([
    setupForMany([orgId]),
    OrganizationModel.findById(orgId).select('onboardingDismissedAt').lean(),
  ]);
  const s = map.get(String(orgId)) ?? stepsFrom({ details: false, products: 0, purchases: 0, sales: 0, users: 0, customers: 0 });
  return { ...s, dismissed: Boolean(org?.onboardingDismissedAt) };
}

/** Puts the checklist away for this shop. It comes back if asked for from Settings. */
export async function setDismissed(orgId: string, dismissed: boolean) {
  await OrganizationModel.updateOne({ _id: orgId }, { $set: { onboardingDismissedAt: dismissed ? new Date() : null } });
  return setupOf(orgId);
}
