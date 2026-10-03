import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ORG_STATUS } from '../types/enums.js';

/**
 * A shop — the tenant. Every shop record (stock, bills, khata, suppliers)
 * carries `organization` pointing here, and every query is scoped by it.
 *
 * Named `Organization` rather than `Shop` so the field every model already
 * carries keeps its name; on screen and in mail it is always "the shop".
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /**
     * The account that signed up and pays. Ownership, not role, is what lets
     * someone rename the shop or change who works in it — see authz.service.
     */
    owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    logo: { type: String, default: '' },
    address: {
      street: { type: String, default: '' },
      area: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      /** From the district; kept so lists can be read by division without the table. */
      division: { type: String, default: '' },
      upazila: { type: String, default: '' },
      postalCode: { type: String, default: '' },
    },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    settings: {
      /** Whether the shop sends customers SMS (baki reminders). Its gateway, its cost. */
      smsEnabled: { type: Boolean, default: true },
    },
    /**
     * What this customer cost, and who to credit. Written once at sign-up:
     * "which campaign produced this shop" has one answer, the first touch.
     */
    acquisition: {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
      channel: { type: String, default: '' },
      campaign: { type: String, default: '' },
      /** A referral or reseller code, for the channel that sells this here. */
      agentCode: { type: String, default: '' },
      fbclid: { type: String, default: '' },
      utm: {
        source: { type: String, default: '' },
        medium: { type: String, default: '' },
        campaign: { type: String, default: '' },
        content: { type: String, default: '' },
        term: { type: String, default: '' },
      },
      firstTouchAt: { type: Date, default: null },
    },

    /**
     * Where the shop is in its lifecycle. A sign-up starts `pending` and cannot
     * sign in until an operator approves it; middlewares/auth.ts is the single
     * place this is enforced.
     */
    status: { type: String, enum: ORG_STATUS, default: 'pending', index: true },
    /** The plan's `key` (models/Plan.ts) — stable across renames. */
    plan: { type: String, default: 'trial', index: true },
    /** What they said they were signing up for. Offered first on the billing page. */
    intendedPlan: { type: String, default: '' },
    /**
     * What the shop told us about itself on the sign-up form — written once, at
     * registration, and never rewritten. It is what the operator reads before
     * ringing them: "asked for 10 counters, 2 branches, licence DL-…".
     */
    signup: {
      /** Billing counters they said they run. `null`: not given. */
      counters: { type: Number, default: null },
      /** Branches (outlets) they said they run. `null`: not given. */
      outlets: { type: Number, default: null },
      /** Their drug licence number, as typed. Not verified here. */
      licence: { type: String, default: '' },
    },
    /**
     * This shop's own ceilings, where they differ from its plan's.
     *
     * `null` on an axis means "use the plan" — the default, and what nearly
     * every shop has. A number is this shop's own ceiling and replaces the
     * plan's on that axis: it is how a ten-counter shop trials all ten counters,
     * and how an operator sells a Plus shop its sixth till. Read through
     * `plan.service#effectiveLimits`, never directly.
     */
    /**
     * Whether this shop is counted in the anonymous medicine figures
     * (services/medicineDemand). Counted unless the owner switches it off;
     * switched off, it stops being counted from that night.
     */
    dataSharing: {
      optedOut: { type: Boolean, default: false },
      changedAt: { type: Date, default: null },
      changedByName: { type: String, default: '' },
    },
    /**
     * A plan feature given to or taken from this one shop, whatever its plan
     * says. `null` follows the plan. Read through plan.service#orgFeatures.
     */
    featureOverrides: {
      onlineOrders: { type: Boolean, default: null },
    },
    limitOverrides: {
      outlets: { type: Number, default: null },
      terminals: { type: Number, default: null },
      shopUsers: { type: Number, default: null },
    },
    /**
     * The date the shop is trialled or paid up to — one field for both, because
     * the question is the same: may it still write? Set at approval to the end of
     * the trial; each confirmed payment moves it forward. Past it, on any plan,
     * the shop can read everything and write nothing (`readOnly` in
     * middlewares/auth.ts) until it pays.
     *
     * Named for the trial because that is where every shop starts; `paidUntil`
     * below is the same value under a clearer name.
     */
    trialEndsAt: { type: Date, default: null },
    /** Shown at the sign-in screen, so a lockout is explicable. */
    suspendedReason: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Which "ends in N days" warning was last sent, so a restart never repeats one. */
    lastReminderDays: { type: Number, default: null },
    /**
     * The last reminder an operator sent by hand from the Renewals page, so the
     * next operator can see the shop was already chased — and a double click
     * cannot send it twice.
     */
    /**
     * This shop's own sign-up link code, for referring another pharmacy:
     * `dawai.com.bd/en/register?ref=K7M2QX`. Made the first time the owner
     * opens the referral card, so shops that never refer anybody have none.
     */
    referralCode: { type: String, default: undefined, uppercase: true, trim: true },
    /** The shop whose link this one signed up through. */
    referredBy: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    /**
     * The referring shop's reward for this sign-up, given by hand from the
     * console. Recorded on the *referred* shop, so each sign-up is rewarded at
     * most once and the console can show which are still owed.
     */
    referralReward: {
      at: { type: Date, default: null },
      by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      note: { type: String, default: '' },
    },
    /** The owner put the getting-started checklist away. */
    onboardingDismissedAt: { type: Date, default: null },
    lastManualReminder: {
      at: { type: Date, default: null },
      by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      kind: { type: String, default: '' },
    },
    /** Mirrors `status` for older reads; `status` is the authority. */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: 'string' } } });

schema.virtual('paidUntil').get(function paidUntil(this: { trialEndsAt?: Date | null }) {
  return this.trialEndsAt ?? null;
});

/** Past its trial or paid-up date. */
schema.methods.isTrialExpired = function isTrialExpired(this: { trialEndsAt?: Date | null }) {
  return Boolean(this.trialEndsAt) && this.trialEndsAt! < new Date();
};

export type Organization = InferSchemaType<typeof schema>;
export type OrganizationDoc = HydratedDocument<Organization>;

export const OrganizationModel = model('Organization', schema);
