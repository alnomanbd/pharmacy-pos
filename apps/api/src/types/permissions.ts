/**
 * What a member of the platform team is allowed to do.
 *
 * Roles alone are too blunt here. The team that runs this has different jobs —
 * somebody checks payments, somebody answers support, somebody curates the
 * medicine catalogue — and none of them should be able to suspend a customer or
 * delete a shop's records just because they needed to look at a payment.
 *
 * So the role says *who you are* and the permissions say *what you may do*. The
 * owner (`platformAdmin`) holds all of them implicitly; everyone else holds
 * exactly what they were given.
 */
export const PERMISSIONS = [
  /** See the shop list and one shop's detail. The baseline for any console access. */
  'shops.view',
  /** Let a pending shop in. */
  'shops.approve',
  /** Suspend or reactivate. Cuts off a paying customer, so it is its own permission. */
  'shops.suspend',
  /** Move a shop between plans, or extend a trial. Money. */
  'shops.plan',
  /** Download a shop's data. Every sale, customer and supplier it holds. */
  'shops.export',
  /** Permanent deletion. Nothing comes back. */
  'shops.delete',
  /**
   * Correct a shop's own details — its name, address and contact.
   *
   * Separate from `shops.plan`: fixing a misspelled shop name is clerical,
   * moving somebody between plans is money.
   */
  'shops.edit',
  /**
   * Change a shop user's details, and set their password.
   *
   * The sharpest permission in this file, and in **no preset** on purpose.
   * Whoever holds it can set an owner's password and then sign in as them for
   * real — the actual account, with everything it can do. It exists because an
   * owner who has forgotten their password at 6pm with a queue at the counter
   * will phone, and "use the reset link" is not always an answer: the address
   * on the account may be one they no longer read.
   *
   * Three things make it survivable, all enforced in the service: the shop
   * user is told by email that support changed their password, every use is in
   * the audit trail with the operator's name and a reason they had to type, and
   * every session that account had is ended.
   */
  'shops.credentials',
  /**
   * Open a shop's own app read-only, as one of its users — to see what they
   * see when they ring. Every write is refused for the whole session, which
   * lasts thirty minutes and goes in the audit trail with the operator's name.
   */
  'shops.impersonate',

  'payments.view',
  /** Accept or reject money, which extends a subscription. */
  'payments.verify',
  /**
   * The sales figures: what the platform earned, by day, plan and shop.
   *
   * Separate from `payments.view` on purpose. Checking one shop's bKash
   * transaction against the receiving account is a clerical job; knowing what
   * the company turns over is not the same thing, and a support agent needs the
   * first without the second.
   */
  'revenue.view',

  'plans.view',
  /** Change prices and limits — takes effect for every shop at once. */
  'plans.manage',

  'formulary.view',
  /** Edit the catalogue every shop stocks from. */
  'formulary.manage',

  /**
   * See the shared medicine catalogue and the queue of medicines shops have
   * asked for. Read-only: a support agent answering "why can't I find Napa
   * Extend?" needs to look, not to edit.
   */
  'catalogue.view',
  /**
   * Add, edit, deactivate or delete catalogue rows, and approve or reject a
   * shop's request. One wrong edit reaches every shop on the deployment.
   */
  'catalogue.manage',

  'requests.view',
  'requests.manage',

  'support.view',
  /** Answer a shop, and close a conversation. */
  'support.reply',

  /**
   * Enquiries from the public site — people who are not customers yet.
   *
   * Its own permission rather than part of `support.*`: a lead carries a name,
   * an email and whatever a stranger chose to tell us, and the team that
   * answers existing shops is not automatically the team that handles
   * incoming sales.
   */
  'leads.view',
  /** Mark an enquiry answered or closed, and note what happened. */
  'leads.manage',

  /**
   * Create and change discount codes, and mark referral rewards as given.
   * Every code is money off, so it sits with billing.
   */
  'coupons.manage',

  /**
   * Add and change field agents, assign shops to them, and mark their
   * commission paid. Money owed to people outside the company.
   */
  'agents.manage',

  /** Write and change the help articles shops read in their app. */
  'help.manage',

  /**
   * Publish a message across the top of every shop's app. Reaches every
   * counter at once, so it is its own permission.
   */
  'announcements.manage',

  /** Add and remove members of the platform team. */
  'team.manage',

  /**
   * Read the platform's own audit trail.
   *
   * Its own permission, and in no preset: the trail records who suspended a
   * customer, who moved one between plans, who set a shop user's password
   * and who was given console access — including the reader's own
   * actions. An operator who can quietly read that is an operator who can
   * check whether anybody noticed, so it sits with the owner by default.
   */
  'audit.view',

  /**
   * The Data API's book: who buys the catalogue and the medicine figures,
   * what they use, what there is to sell, and a look at exactly what a client
   * is sent.
   */
  'dataapi.view',
  /**
   * Add and change Data API clients and plans, and make or revoke their keys.
   * A key is access to everything a plan sells, so it is its own permission,
   * in no preset.
   */
  'dataapi.manage',

  /**
   * See the platform's own health: the database, the scheduled jobs, whether
   * email and SMS are configured, crash reporting and backups. In no preset —
   * it names the providers and the server's environment.
   */
  'system.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Ready-made sets, so adding a colleague is one choice rather than sixteen.
 *
 * Each is the smallest set that lets somebody actually do that job — a support
 * agent who cannot look at a shop is useless, and one who can delete it is a
 * liability.
 */
export const PERMISSION_PRESETS: Record<string, { label: string; description: string; permissions: Permission[] }> = {
  support: {
    label: 'Support',
    description: 'Answer shops: look at their account and their requests.',
    permissions: [
      'shops.view',
      'help.manage',
      'shops.impersonate',
      'payments.view',
      'requests.view',
      'catalogue.view',
      'support.view',
      'support.reply',
      'leads.view',
      'leads.manage',
    ],
  },
  billing: {
    label: 'Billing',
    description: 'Check payments, extend subscriptions, move shops between plans.',
    permissions: [
      'shops.view',
      'agents.manage',
      'coupons.manage',
      'shops.plan',
      'payments.view',
      'payments.verify',
      'revenue.view',
      'plans.view',
      'dataapi.view',
    ],
  },
  catalogue: {
    label: 'Catalogue',
    description: 'Curate the shared medicine list and answer shops’ requests.',
    permissions: [
      'formulary.view',
      'formulary.manage',
      'requests.view',
      'requests.manage',
      'catalogue.view',
      'catalogue.manage',
    ],
  },
  operations: {
    label: 'Operations',
    description: 'Approve and suspend shops, handle payments and requests.',
    permissions: [
      'shops.view',
      'help.manage',
      'announcements.manage',
      'shops.impersonate',
      'shops.approve',
      'shops.suspend',
      'shops.plan',
      'shops.export',
      'payments.view',
      'payments.verify',
      'revenue.view',
      'plans.view',
      'requests.view',
      'requests.manage',
      'catalogue.view',
      'catalogue.manage',
      'support.view',
      'support.reply',
      'leads.view',
      'leads.manage',
    ],
  },
};

/**
 * The owner's set.
 *
 * Held implicitly rather than stored, so a permission added in a later version
 * is not something the owner has to remember to grant themselves.
 */
export const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];
