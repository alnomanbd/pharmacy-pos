import type { Role } from './enums.js';

/**
 * Named role sets, so a route says *what kind of act* it guards rather than
 * listing roles inline — the inline list is where a role gets quietly missed.
 */

/** Working in the shop: the till, and taking a return against a bill. */
export const SHOP_ROLES: Role[] = ['admin', 'pharmacist', 'salesman'];

/**
 * Running the shop: stock, deliveries, prices, suppliers, write-offs, reports.
 *
 * The salesman is missing on purpose, and that is the whole distinction: what a
 * strip cost is the owner's business, and a till operator who can see the
 * trade price can price a favour.
 */
export const SHOP_ADMIN_ROLES: Role[] = ['admin', 'pharmacist'];

/**
 * The owner's own decisions: who works here, the shop's name and plan, its
 * subscription, deleting its data.
 */
export const OWNER_ROLES: Role[] = ['admin'];

/** Operating the deployment. Disjoint from every set above. */
export const PLATFORM_ROLES: Role[] = ['platformAdmin', 'platformStaff'];

/** The deployment's owner: every permission implicitly, and the team. */
export const PLATFORM_OWNER_ROLES: Role[] = ['platformAdmin'];
