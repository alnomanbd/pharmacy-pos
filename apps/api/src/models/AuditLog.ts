import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const AUDIT_ACTIONS = [
  // Session lifecycle — the spine of the no-repudiation trail: every login and
  // logout is a named, timestamped event tied to the account that did it.
  'auth.login',
  'auth.logout',
  'auth.session.revoke',
  'auth.session.revoke_others',
  'auth.refresh',
  'auth.failed_login',
  'password.reset',
  'password.change',
  'twoFactor.setup',
  'twoFactor.disable',

  // User/account management.
  'user.create',
  'user.update',
  'user.delete',
  'user.restore',

  // The shop's money-touching acts. A bill that was changed or cancelled after
  // it was rung up is exactly what an owner comes looking for, and "which
  // salesman, and what did they say the reason was" is the whole question.
  'sale.edit',
  'sale.void',
  'sale.revert',
  'sale.hold',
  'sale.return',
  /* The shop's bin: what was thrown away, by whom, and what they said. */
  'shop.delete',
  'shop.restore',

  /*
   * Everything else the shop does that changes anything — written from one
   * place, the shop's activity middleware, so a new route cannot be added
   * that the owner's Activity page never hears about.
   */
  'shop.sale.create',
  'shop.sale.return',
  'shop.shift.open',
  'shop.shift.close',
  'shop.customer.create',
  'shop.customer.update',
  'shop.customer.payment',
  'shop.customer.remind',
  'shop.supplier.create',
  'shop.supplier.update',
  'shop.supplier.payment',
  'shop.supplier.return',
  'shop.settings.update',
  'shop.rack.create',
  'shop.rack.update',
  'shop.product.create',
  'shop.product.update',
  'shop.purchase.create',
  'shop.stock.adjust',
  'shop.count.start',
  'shop.count.update',
  'shop.count.apply',
  'shop.count.abandon',
  'shop.order.create',
  'shop.order.status',
  'shop.staff.create',
  'shop.staff.update',
  'shop.staff.password',
  'shop.counter.create',
  'shop.counter.update',
  'shop.expense.create',
  'shop.expense.update',
  'shop.income.create',
  'shop.income.update',
  'shop.cash.create',
  'shop.cash.update',
  'shop.month.close',
  'shop.month.reopen',

  // Shop settings, files, billing.
  'organization.update',
  'file.upload',
  'medicine.request',
  'support.create',
  /** An operator closed or reopened a shop's support conversation. */
  'support.status',
  'billing.payment.submit',
  /** An operator recorded a payment by hand (cash, or reported by phone) — accepted at once. */
  'billing.payment.platform_record',

  // Operating the deployment: approving, suspending or re-planning a customer
  // is exactly the kind of act that has to be answerable for later.
  'organization.platform_update',
  /** An operator opened a shop's account on the owner's behalf. */
  'organization.platform_create',
  /** An operator corrected a shop's own details, on the owner's behalf. */
  'organization.platform_profile',
  /** An operator set or cleared a shop's own counter / staff-login ceilings. */
  'organization.platform_limits',
  'organization.platform_features',
  /** An operator sent a shop a renewal or come-back reminder by hand. */
  'organization.platform_remind',
  /** An operator published, changed or deleted an announcement shown to shops. */
  'announcement.change',
  /** An operator created or changed a discount code. */
  'coupon.change',
  /** An operator marked a referring shop's reward as given. */
  'referral.reward',
  /** An operator added or changed a field agent. */
  'agent.change',
  /** An operator marked an agent's commission paid. */
  'agent.payout',
  /** An operator put a shop under an agent, or took it out. */
  'organization.platform_agent',
  /** An operator wrote, changed or deleted a help article. */
  'help.change',
  /** An operator reported or updated an incident on the public status page. */
  'incident.change',
  /** An operator corrected a shop user's details. */
  'user.platform_update',
  /**
   * An operator set a shop user's password.
   *
   * The entry every other guard rail points at: it carries the operator, the
   * shop, the user and the reason they had to type. Never the password.
   */
  'user.platform_password',
  /** An operator opened a shop's app read-only, as one of its users. */
  'impersonate.start',

  /*
   * The shared catalogue. One edit here reaches every shop on the deployment,
   * so each one carries the operator who made it.
   */
  'catalogue.medicine_create',
  'catalogue.medicine_update',
  'catalogue.medicine_delete',
  'catalogue.ref_create',
  'catalogue.ref_update',
  'catalogue.ref_delete',
  /** A shop's medicine request, answered. */
  'catalogue.request_approve',
  'catalogue.request_reject',

  /** A colleague's details or access changed, or their password set for them. */
  'team.member_update',
  'team.member_password',
  'team.member_2fa_reset',
  'user.platform_2fa_reset',
  'platform.site_settings',
  'platform.client_errors_cleared',
  /** A backup asked for from the console, and one downloaded — every shop's books in one file. */
  'platform.backup_requested',
  'platform.backup_downloaded',
  /** One shop put back from a backup, or put back as it was before that. */
  'platform.shop_restored',
  'platform.shop_restore_undone',
  /** Selling the Data API: a client, a key or a plan changed from the console. */
  'dataapi.client_create',
  'dataapi.client_update',
  'dataapi.key_create',
  'dataapi.key_revoke',
  'dataapi.plan_save',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Trail for destructive and money-touching operations.
 *
 * A voided bill, a stock adjustment or a revoked staff account must not leave
 * the owner guessing who did it. Stock and cash both need an answer to "who
 * changed this, and when".
 *
 * Deliberately append-only — nothing in the app updates or deletes an entry —
 * and it stores a short `before` snapshot of just the fields that changed rather
 * than the whole document, so the log does not become a second copy of the
 * shop's database.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    /** Model name and id of the thing that changed. */
    target: {
      model: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId },
      label: { type: String, default: '' },
    },
    /** Changed fields only, before the change. Never a full document. */
    before: { type: Schema.Types.Mixed },
    /** Changed fields only, after the change. */
    after: { type: Schema.Types.Mixed },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ organization: 1, createdAt: -1 });
schema.index({ 'target.model': 1, 'target.id': 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof schema>;
export type AuditLogDoc = HydratedDocument<AuditLog>;

export const AuditLogModel = model('AuditLog', schema);
