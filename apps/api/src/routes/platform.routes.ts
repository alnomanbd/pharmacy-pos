import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as platform from '../services/platform.service.js';
import * as payments from '../services/payment.service.js';
import * as revenue from '../services/revenue.service.js';
import { invoiceFor, buildInvoicePdf, invoiceFilename } from '../services/invoice.service.js';
import { exportOrganization, deleteOrganization } from '../services/tenantData.service.js';
import { usageForOrganization, platformUsage } from '../services/usage.service.js';
import * as plans from '../services/plan.service.js';
import * as leads from '../services/lead.service.js';
import * as support from '../services/support.service.js';
import { impersonate } from '../services/impersonation.service.js';
import * as retention from '../services/retention.service.js';
import * as notes from '../services/shopNote.service.js';
import { listMessages } from '../services/messageLog.service.js';
import { requireAuth, requireRole, requirePermission } from '../middlewares/auth.js';
import { PLATFORM_ROLES, PLATFORM_OWNER_ROLES } from '../types/roles.js';
import * as team from '../services/platformTeam.service.js';
import catalogueRoutes from './catalogue.routes.js';
import { PERMISSIONS } from '../types/permissions.js';
import { PAYMENT_METHODS } from '../models/Payment.js';
import { validate } from '../middlewares/validate.js';
import {
  createOrganizationSchema,
  setUserPasswordSchema,
  resetTwoFactorSchema,
  teamPasswordSchema,
  shopProfileSchema,
  shopUserSchema,
} from '../validators/auth.validator.js';
import { ok } from '../utils/response.js';
import { audit, listPlatformAuditLogs } from '../services/audit.service.js';
import { ORG_STATUS } from '../types/enums.js';
import { badRequest, forbidden } from '../utils/AppError.js';
import { permissionsForOrgUpdate } from '../services/orgUpdateAuthz.js';

/**
 * Operating the deployment: which shops exist, whether they may sign in, what
 * plan they are on, and the queue of medicines they have asked for.
 *
 * Every other router in this app answers questions inside one organization.
 * This is the only one that looks across them, which is why it is guarded by a
 * role that no customer can hold — `admin` is a *shop owner* and is
 * deliberately not in `PLATFORM_ROLES`.
 */
const router = Router();

// Reaching the console at all is the role; what you can do inside it is the
// permission on each route below.
router.use(requireAuth, requireRole(...PLATFORM_ROLES));


const handle =
  <T>(run: (req: Request) => Promise<T>, message?: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await run(req), message);
    } catch (err) {
      next(err);
    }
  };

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

/** What the signed-in member may do, so the console can hide what they cannot. */
router.get(
  '/me',
  handle(async (req) => ({
    role: req.user!.role,
    permissions: req.user!.permissions ?? [],
    isOwner: req.user!.role === 'platformAdmin',
  })),
);

/** Your own name and phone. Anything that is access goes through a colleague. */
router.patch(
  '/me',
  validate(
    z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        phone: z.string().trim().max(20).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
  ),
  handle((req) => team.updateSelf(req.user!.id, req.body), 'Saved'),
);

/* The shared catalogue and the shops' requests for it — see catalogue.routes.ts. */
router.use(catalogueRoutes);

/* ---------------------------------- shops ---------------------------------- */

router.get('/stats', requirePermission('shops.view'), handle(() => platform.platformStats()));
/* ---------------------------------- plans ---------------------------------- */

const limitsSchema = z.object({
  // `null` is unlimited and `0` is none — so both are meaningful, and neither is
  // a default. The console sends null for a blank field.
  outlets: z.number().int().min(0).nullable().optional(),
  terminals: z.number().int().min(0).nullable().optional(),
  shopUsers: z.number().int().min(0).nullable().optional(),
});

const planSchema = z.object({
  key: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  price: z.number().min(0).max(10_000_000).optional(),
  currency: z.string().trim().max(8).optional(),
  limits: limitsSchema.optional(),
  isTrial: z.boolean().optional(),
  trialDays: z.number().int().min(1).max(365).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});

// Readable by whoever records payments too: taking one by hand means picking its plan.
router.get(
  '/plans',
  requirePermission('plans.view', 'plans.manage', 'payments.verify'),
  handle(() => plans.listPlans()),
);
router.post(
  '/plans',
  requirePermission('plans.manage'),
  validate(planSchema),
  handle((req) => plans.createPlan(req.body), 'Plan created'),
);
router.patch(
  '/plans/:id',
  requirePermission('plans.manage'),
  validate(planSchema),
  handle((req) => plans.updatePlan(req.params.id, req.body), 'Plan updated'),
);
router.post(
  '/plans/:id/retire',
  requirePermission('plans.manage'),
  handle((req) => plans.retirePlan(req.params.id), 'Plan retired'),
);

router.get(
  '/organizations',
  requirePermission('shops.view'),
  handle((req) =>
    platform.listOrganizations({
      q: str(req.query.q),
      status: str(req.query.status) as never,
      plan: str(req.query.plan) as never,
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.get(
  '/organizations/:id',
  requirePermission('shops.view'),
  handle((req) => platform.getOrganization(req.params.id)),
);

/**
 * A shop's month-by-month activity.
 *
 * The empty months are kept: a shop that rang up four hundred bills in March
 * and forty in April is about to leave, and the gap is the whole signal.
 */
router.get(
  '/organizations/:id/usage',
  requirePermission('shops.view'),
  handle((req) => usageForOrganization(req.params.id, num(req.query.months) ?? 6)),
);

/** The whole deployment, and who is doing the most with it. */
router.get(
  '/usage',
  requirePermission('shops.view'),
  handle((req) => platformUsage(num(req.query.months) ?? 6)),
);

const updateOrgSchema = z
  .object({
    status: z.enum(ORG_STATUS).optional(),
    /*
     * A plan *key* from the catalogue, checked against it in the service.
     *
     * Not an enum: the catalogue is editable at runtime (an operator can add a
     * plan on the Plans page), so the set of valid keys is not known here.
     * A fixed enum here would go stale the first time an operator added a
     * plan, and the keys that did exist could not be sent.
     */
    plan: z.string().trim().min(2).max(60).optional(),
    suspendedReason: z.string().max(300).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

function requireOrgUpdatePermissions(req: Request, _res: Response, next: NextFunction) {
  const held = req.user?.permissions ?? [];
  const missing = permissionsForOrgUpdate(req.body).find((group) => !group.some((p) => held.includes(p)));
  if (missing) return next(forbidden(`You do not have permission to do this (${missing.join(' or ')})`));
  next();
}

router.patch(
  '/organizations/:id',
  validate(updateOrgSchema),
  requireOrgUpdatePermissions,
  handle(async (req) => {
    const org = await platform.updateOrganization(req.params.id, req.user!.id, req.body);
    /*
     * Suspending a customer is the kind of act that has to be answerable for
     * later, so it goes in the trail with who did it — under
     * `organization.platform_update`, not the `organization.update` a shop
     * uses on its own profile. They were the same action name, which left the
     * two indistinguishable without reading the payload.
     */
    await audit(
      req,
      'organization.platform_update',
      { model: 'Organization', id: req.params.id, label: org.name },
      { after: req.body },
    );
    return org;
  }, 'Shop updated'),
);

/**
 * A shop's own ceilings on counters and staff logins, where they differ from
 * its plan's. A number sets the shop's ceiling on that axis; `null` puts it
 * back on the plan's; an axis left out is left alone.
 *
 * Behind `shops.plan`, like a plan change: a sixth counter on a Plus shop is
 * something we sell, so it is money, not clerical.
 */
const limitOverridesSchema = z
  .object({
    limitOverrides: z
      .object({
        terminals: z.number().int().min(1).max(500).nullable().optional(),
        shopUsers: z.number().int().min(1).max(1000).nullable().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
  })
  .strict();

router.patch(
  '/organizations/:id/limits',
  requirePermission('shops.plan'),
  validate(limitOverridesSchema),
  handle(async (req) => {
    const result = await platform.updateLimitOverrides(req.params.id, req.body.limitOverrides);
    await audit(
      req,
      'organization.platform_limits',
      { model: 'Organization', id: req.params.id, label: result.organization.name },
      { before: { limitOverrides: result.before }, after: { limitOverrides: result.after } },
    );
    return { limitOverrides: result.after, usage: result.usage };
  }, 'Limits updated'),
);

/**
 * A shop's data, for support — and its deletion, for offboarding.
 *
 * The export is offered here as well as to the shop itself, because the moment
 * it is most often needed is when somebody cannot sign in to fetch it.
 */
router.get('/organizations/:id/export', requirePermission('shops.export'), async (req, res, next) => {
  try {
    const data = await exportOrganization(req.params.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="shop-${req.params.id}-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * Permanent deletion.
 *
 * Confirmed by typing the shop's name back, because there is no undo and what
 * is destroyed is a pharmacy's whole trading history. Audited before the record it
 * refers to stops existing.
 */
router.delete(
  '/organizations/:id',
  requirePermission('shops.delete'),
  validate(z.object({ confirm: z.string().min(1) })),
  handle(async (req) => {
    await audit(
      req,
      'organization.platform_update',
      { model: 'Organization', id: req.params.id, label: 'permanent deletion' },
      { before: { confirm: req.body.confirm } },
    );
    return deleteOrganization(req.params.id, req.body.confirm);
  }, 'Shop deleted permanently'),
);

/**
 * Opening an account for somebody who asked over the phone.
 *
 * Behind `shops.approve`: letting a shop onto the platform is the same
 * authority whether it applied through the form or rang the office. Created
 * active, because the operator typing it in is the review.
 */
router.post(
  '/organizations',
  requirePermission('shops.approve'),
  validate(createOrganizationSchema),
  handle(async (req) => {
    const created = await platform.createOrganizationForCustomer(req.body, req.user!.id);
    await audit(
      req,
      'organization.platform_create',
      { model: 'Organization', id: created.id, label: created.name },
      { after: { owner: created.owner.email } },
    );
    return created;
  }, 'Account opened'),
);

/**
 * A shop's own details, corrected on its behalf.
 *
 * The call this answers starts "you have spelled our name wrong on the
 * receipts". Status, plan and trial are not here — they live behind their
 * own permissions, and money does not belong in the same endpoint as a typo.
 */
router.patch(
  '/organizations/:id/profile',
  requirePermission('shops.edit'),
  validate(shopProfileSchema),
  handle(async (req) => {
    const before = await platform.getOrganization(req.params.id);
    const org = await platform.updateOrganizationProfile(req.params.id, req.body);
    await audit(
      req,
      'organization.platform_profile',
      { model: 'Organization', id: req.params.id, label: org.name },
      { before: { name: before.organization?.name }, after: { ...req.body } },
    );
    return org;
  }, 'Shop updated'),
);

router.patch(
  '/organizations/:id/users/:userId',
  requirePermission('shops.edit'),
  validate(shopUserSchema),
  handle(async (req) => {
    const user = await platform.updateShopUser(req.params.id, req.params.userId, req.body);
    await audit(
      req,
      'user.platform_update',
      { model: 'User', id: req.params.userId, label: user.email },
      { after: { ...req.body } },
    );
    return user;
  }, 'User updated'),
);

/**
 * Setting a shop user's password.
 *
 * Its own permission, in no preset, because whoever holds it can take over a
 * customer's account for real. It exists for the owner locked out at 6pm with a
 * queue at the counter, whose account email is an address nobody has opened in
 * two years.
 *
 * Three things keep it honest and all three are enforced rather than advised:
 * the user is emailed that support did it, the reason typed here is kept in the
 * audit trail with the operator's name, and every session on that account ends.
 */
router.post(
  '/organizations/:id/users/:userId/password',
  requirePermission('shops.credentials'),
  validate(setUserPasswordSchema),
  handle(async (req) => {
    const target = await platform.setShopUserPassword(
      req.params.id,
      req.params.userId,
      req.body.newPassword,
      { name: req.user!.name, email: req.user!.email },
    );
    await audit(
      req,
      'user.platform_password',
      { model: 'User', id: req.params.userId, label: target.email },
      // The reason, never the password. This entry is read by people.
      { after: { reason: req.body.reason, shop: req.params.id } },
    );
    return { id: target.id, email: target.email, name: target.name };
  }, 'Password set. The user has been emailed and signed out everywhere.'),
);

/**
 * A shop user's lost phone. Behind `shops.credentials`, like setting their
 * password: either one hands the account to whoever asked.
 */
router.post(
  '/organizations/:id/users/:userId/two-factor/reset',
  requirePermission('shops.credentials'),
  validate(resetTwoFactorSchema),
  handle(async (req) => {
    const target = await platform.resetShopUserTwoFactor(req.params.id, req.params.userId);
    await audit(
      req,
      'user.platform_2fa_reset',
      { model: 'User', id: target.id, label: target.email },
      { after: { reason: req.body.reason, shop: req.params.id } },
    );
    return { id: target.id, email: target.email, name: target.name };
  }, 'Two-factor reset. They can sign in with their password and turn it on again.'),
);

/* ---------------------------------- audit ---------------------------------- */

/**
 * The platform's own trail: who did what to which shop, and when.
 *
 * Read-only — nothing in this app edits or deletes an audit row, and this
 * endpoint offers no way to. A shop's own rows are not returned; its own
 * trail is read on its own Activity page. See `listPlatformAuditLogs`.
 */
router.get(
  '/audit',
  requirePermission('audit.view'),
  handle((req) =>
    listPlatformAuditLogs({
      action: str(req.query.action),
      actorId: str(req.query.actor),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/* ---------------------------------- leads ---------------------------------- */

/**
 * Enquiries from the public site.
 *
 * The inbox for people who are not customers yet — the contact form on the
 * marketing site posts to `/api/public/contact`, and this is where those
 * messages are read and answered. Spam is filtered out of the default list
 * rather than deleted; `status=all` shows everything, which is how you check
 * whether the honeypot is doing its job.
 */
router.get(
  '/leads',
  requirePermission('leads.view', 'leads.manage'),
  handle((req) =>
    leads.listLeads({
      status: str(req.query.status),
      q: str(req.query.q),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/*
 * An enquiry, as the console works it.
 *
 * Five live states and two endings — `contacted`, `demo`, `trial`, then `won`
 * or `lost`. A longer funnel is a longer form to fill in, and a stage nobody
 * updates is worse than no stage at all. The older three are kept because rows
 * already carry them.
 */
const leadSchema = z.object({
  status: z
    .enum(['new', 'contacted', 'demo', 'trial', 'won', 'lost', 'replied', 'closed', 'spam'])
    .optional(),
  note: z.string().max(2000).optional(),
  owner: z.string().max(40).nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  /** One dated call note, appended rather than replacing what is there. */
  addNote: z.string().max(2000).optional(),
  lostReason: z.string().max(200).optional(),
});

router.patch(
  '/leads/:id',
  requirePermission('leads.manage'),
  validate(leadSchema),
  handle((req) => leads.updateLead(req.params.id, req.body, req.user!.id), 'Enquiry updated'),
);

/* ------------------------------- the team ---------------------------------- */

const teamCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(10).max(128),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
  preset: z.string().trim().max(30).optional(),
});

const teamUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(20).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
  preset: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional(),
});

/** The permission catalogue and the ready-made sets, for the console's form. */
router.get(
  '/team/permissions',
  requirePermission('team.manage'),
  handle(async () => ({ permissions: team.allPermissions(), presets: team.presets() })),
);

router.get('/team', requirePermission('team.manage'), handle(() => team.listTeam()));

router.post(
  '/team',
  requirePermission('team.manage'),
  validate(teamCreateSchema),
  handle(async (req) => {
    const member = await team.inviteMember(req.body);
    // Granting somebody access to every shop on the deployment is worth a
    // line in the trail, under the name of whoever granted it.
    await audit(
      req,
      'user.update',
      { model: 'User', id: member.id, label: `platform team: ${member.email}` },
      { after: { permissions: member.permissions } },
    );
    return member;
  }, 'Team member added'),
);

router.patch(
  '/team/:id',
  requirePermission('team.manage'),
  validate(teamUpdateSchema),
  handle(async (req) => {
    const member = await team.updateMember(
      req.params.id,
      { id: req.user!.id, role: req.user!.role },
      req.body,
    );
    await audit(
      req,
      'team.member_update',
      { model: 'User', id: member.id, label: `platform team: ${member.email}` },
      { after: req.body },
    );
    return member;
  }, 'Saved'),
);

/**
 * Setting a colleague's password, for the one locked out of the console.
 *
 * Not for your own — that is Change password, which asks for the current one.
 * Every session the colleague had ends.
 */
router.post(
  '/team/:id/password',
  requirePermission('team.manage'),
  validate(teamPasswordSchema),
  handle(async (req) => {
    const target = await team.setMemberPassword(
      req.params.id,
      { id: req.user!.id, role: req.user!.role },
      req.body.newPassword,
    );
    // Who and when, never the password.
    await audit(req, 'team.member_password', {
      model: 'User',
      id: target.id,
      label: `platform team: ${target.email}`,
    });
    return { id: target.id };
  }, 'Password set. They have been signed out everywhere.'),
);

/** A colleague's lost phone. Same guard as their password. */
router.post(
  '/team/:id/two-factor/reset',
  requirePermission('team.manage'),
  handle(async (req) => {
    const target = await team.resetMemberTwoFactor(req.params.id, { id: req.user!.id, role: req.user!.role });
    await audit(req, 'team.member_2fa_reset', { model: 'User', id: target.id, label: `platform team: ${target.email}` });
    return { id: target.id };
  }, 'Two-factor reset. They set it up again on their next sign-in.'),
);

router.delete(
  '/team/:id',
  requirePermission('team.manage'),
  handle((req) => team.removeMember(req.params.id, req.user!.id), 'Team member removed'),
);

/* --------------------------------- payments -------------------------------- */

router.get(
  '/payments',
  requirePermission('payments.view', 'payments.verify'),
  handle((req) =>
    payments.listPayments({
      status: str(req.query.status),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/**
 * Accepting money is the act that extends a subscription, so it carries a name:
 * the audit entry is the answer to "who accepted this".
 */
/** The same receipt the shop gets — an operator is usually asked for it. */
router.get('/payments/:id/invoice', requirePermission('payments.view'), async (req, res, next) => {
  try {
    const data = await invoiceFor(req.params.id);
    const buffer = await buildInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoiceFilename(data)}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/payments/:id/verify',
  requirePermission('payments.verify'),
  handle(async (req) => {
    const result = await payments.verifyPayment(req.params.id, req.user!.id);
    await audit(
      req,
      'organization.update',
      {
        model: 'Payment',
        id: req.params.id,
        label: `${result.payment.amount} ${result.payment.currency} — ${result.payment.method}`,
      },
      { after: { plan: result.payment.plan, coversUntil: result.payment.coversUntil } },
    );
    return result;
  }, 'Payment verified, subscription extended'),
);

/**
 * A payment taken by hand — cash at the office, or bKash reported over the
 * phone. Recorded and accepted at once, so it is behind `payments.verify`, and
 * audited as its own action with the amount and the reference.
 */
router.post(
  '/organizations/:id/payments',
  requirePermission('payments.verify'),
  validate(
    z.object({
      plan: z.string().trim().min(1).max(40),
      months: z.number().int().min(1).max(36),
      amount: z.number().positive().max(10_000_000),
      method: z.enum(PAYMENT_METHODS),
      trxId: z.string().trim().max(80).optional(),
      senderNumber: z.string().trim().max(40).optional(),
      note: z.string().trim().max(500).optional(),
      paidAt: z.string().datetime().optional(),
    }),
  ),
  handle(async (req) => {
    const result = await payments.recordPayment(req.params.id, req.user!.id, req.body);
    await audit(
      req,
      'billing.payment.platform_record',
      {
        model: 'Payment',
        id: String(result.payment._id),
        label: `${result.payment.amount} ${result.payment.currency} — ${result.payment.method}`,
      },
      {
        after: {
          shop: req.params.id,
          plan: result.payment.plan,
          months: result.payment.months,
          trxId: result.payment.trxId,
          coversUntil: result.payment.coversUntil,
        },
      },
    );
    return result;
  }, 'Payment recorded, subscription extended'),
);

router.post(
  '/payments/:id/reject',
  requirePermission('payments.verify'),
  validate(z.object({ reason: z.string().max(300).optional() })),
  handle(
    (req) => payments.rejectPayment(req.params.id, req.user!.id, req.body.reason),
    'Payment rejected',
  ),
);

/* --------------------------------- revenue --------------------------------- */

/**
 * Our own sales, not a shop's takings.
 *
 * `from`/`to` are `YYYY-MM-DD` and default to the last thirty days;
 * `granularity` buckets the series by day, week or month. The standing
 * today/week/month/year figures come back regardless of the range.
 */
router.get(
  '/revenue',
  requirePermission('revenue.view'),
  handle((req) =>
    revenue.platformRevenue({
      from: str(req.query.from),
      to: str(req.query.to),
      granularity: str(req.query.granularity) as revenue.Granularity | undefined,
    }),
  ),
);

/* -------------------------------- messages -------------------------------- */

/**
 * Every email and SMS the platform tried to send — "I never got the reset
 * email" answered with the address, the time and what the provider said.
 * Email bodies are never stored, and SMS bodies only masked.
 */
router.get(
  '/messages',
  requirePermission('shops.view', 'support.view'),
  handle((req) =>
    listMessages({
      channel: str(req.query.channel),
      status: str(req.query.status),
      q: str(req.query.q),
      organization: str(req.query.organization),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/* ---------------------------------- notes ---------------------------------- */

/**
 * The team's own notes on a shop, and the follow-ups they carry. Anyone who
 * can see the shop may write one; see the service for who may rewrite one.
 */
const noteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  followUpAt: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
});
const actorOf = (req: Request) => ({ id: req.user!.id, isOwner: req.user!.role === 'platformAdmin' });

router.get('/organizations/:id/notes', requirePermission('shops.view'), handle((req) => notes.listNotes(req.params.id)));

router.post(
  '/organizations/:id/notes',
  requirePermission('shops.view'),
  validate(noteSchema),
  handle((req) => notes.addNote(req.params.id, req.user!.id, req.body), 'Note added'),
);

router.patch(
  '/organizations/:id/notes/:noteId',
  requirePermission('shops.view'),
  validate(noteSchema.partial().extend({ done: z.boolean().optional() })),
  handle((req) => notes.updateNote(req.params.id, req.params.noteId, actorOf(req), req.body)),
);

router.delete(
  '/organizations/:id/notes/:noteId',
  requirePermission('shops.view'),
  handle((req) => notes.deleteNote(req.params.id, req.params.noteId, actorOf(req)), 'Note deleted'),
);

/** Follow-ups due by the end of today, across every shop — for the bell. */
router.get(
  '/follow-ups',
  requirePermission('shops.view'),
  handle((req) => notes.dueFollowUps(num(req.query.limit))),
);

/* -------------------------------- renewals -------------------------------- */

/**
 * Who is about to leave: trials and paid time ending within `days`, shops that
 * lapsed in the last month, and shops gone quiet for a week. See the service.
 */
router.get(
  '/retention',
  requirePermission('shops.view'),
  handle((req) => retention.retentionBoard({ days: num(req.query.days) })),
);

/**
 * Chasing one shop by hand. Behind the permissions of the people who do it —
 * whoever may edit a shop or answer it — and in the trail, because it is an
 * email to a customer in our name.
 */
router.post(
  '/organizations/:id/remind',
  requirePermission('shops.edit', 'support.reply'),
  validate(z.object({ kind: z.enum(['renewal', 'inactive']), sms: z.boolean().optional() })),
  handle(async (req) => {
    const result = await retention.remindShop(req.params.id, req.user!.id, req.body);
    await audit(
      req,
      'organization.platform_remind',
      { model: 'Organization', id: req.params.id, label: result.shop },
      { after: { kind: req.body.kind, sent: result.sent } },
    );
    return result;
  }, 'Reminder sent'),
);

/* ------------------------------ support view ------------------------------ */

/**
 * A read-only look through a shop's own app, as one of its users.
 *
 * Audited before the code is handed back, so the record exists even if the
 * response never reaches the operator's browser. The user must belong to the
 * shop named in the path — see the service.
 */
router.post(
  '/organizations/:id/users/:userId/impersonate',
  requirePermission('shops.impersonate'),
  handle(async (req) => {
    const session = await impersonate(req.user!.id, req.params.userId, req.params.id);
    await audit(
      req,
      'impersonate.start',
      { model: 'User', id: req.params.userId, label: `support view of ${session.viewing.shop.name}` },
      { after: { viewedAs: session.viewing.user.email, shop: session.viewing.shop.id } },
    );
    return session;
  }, 'Support view ready'),
);

/* --------------------------------- support --------------------------------- */

/**
 * The support inbox: shops' conversations with the team.
 *
 * Reading needs `support.view` (or `.reply`); answering, closing and reopening
 * need `support.reply`. Open threads by default — see the service.
 */
router.get(
  '/support',
  requirePermission('support.view', 'support.reply'),
  handle((req) =>
    support.listPlatformThreads({
      status: str(req.query.status),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.get(
  '/support/:id',
  requirePermission('support.view', 'support.reply'),
  handle((req) => support.readThread(req.params.id, 'platform')),
);

router.post(
  '/support/:id/messages',
  requirePermission('support.reply'),
  validate(z.object({ body: z.string().trim().min(1).max(4000) })),
  handle((req) => support.postMessage(req.params.id, 'platform', req.user!.id, req.body.body), 'Sent'),
);

router.patch(
  '/support/:id/status',
  requirePermission('support.reply'),
  validate(z.object({ status: z.enum(['open', 'closed']) })),
  handle(async (req) => {
    const thread = await support.setThreadStatus(req.params.id, req.body.status, req.user!.id);
    await audit(
      req,
      'support.status',
      { model: 'SupportThread', id: req.params.id, label: thread.subject },
      { after: { status: req.body.status } },
    );
    return thread;
  }),
);

export default router;
