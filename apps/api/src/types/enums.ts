/**
 * Who someone is, in Dawai.
 *
 * `platformAdmin` / `platformStaff` run the deployment: no shop of their own,
 * the only roles that reach the operator console. Everyone else belongs to
 * exactly one shop:
 *
 * - `admin` — the shop's owner (or a co-owner they appointed). Everything.
 *   Shown on screen as "Owner"; the key is kept from the product this was split
 *   from so every role check reads unchanged.
 * - `pharmacist` — runs the shop: stock, deliveries, returns, counts, the till.
 * - `salesman` — sells and nothing else; never sees trade price or margin.
 */
export const ROLES = ['platformAdmin', 'platformStaff', 'admin', 'pharmacist', 'salesman'] as const;
export type Role = (typeof ROLES)[number];

/**
 * A shop's lifecycle. `pending` is where a sign-up lands: the account exists
 * and cannot be used until an operator approves it. `suspended` carries a
 * reason, because a shop locked out with no explanation is a support call.
 */
export const ORG_STATUS = ['pending', 'active', 'suspended'] as const;
export type OrgStatus = (typeof ORG_STATUS)[number];

/** Whether a message went out. */
export const MESSAGE_STATUS = ['pending', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUS)[number];

export const NOTIFICATION_CHANNEL = ['sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

/** The languages a printed document (bill, invoice, report) can be set in. */
export const DOC_LANGUAGE = ['en', 'bn'] as const;
export type DocLanguage = (typeof DOC_LANGUAGE)[number];
