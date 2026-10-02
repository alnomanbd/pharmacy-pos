import { z } from 'zod';

/**
 * What a password has to be.
 *
 * Eight characters, not six — this guards a shop's books, and six is inside
 * range for an offline attack on a stolen hash. The blocklist is short on
 * purpose: it catches the handful that people actually pick when told to invent
 * something, and a longer list is a dictionary, not a validator.
 */
const WORST = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui',
  'qwerty123', 'admin123', 'welcome1', 'iloveyou', 'abc12345', 'dawai123',
  'pharmacy1', 'passw0rd', '11111111', 'letmein1',
]);

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .refine((v) => !WORST.has(v.toLowerCase()), 'That password is too common — pick another')
  .refine((v) => !/^(.)\1+$/.test(v), 'That password is too simple — pick another');
/** The roles a shop owner can give their own staff. Never a platform role. */
const SHOP_STAFF_ROLES = ['admin', 'pharmacist', 'salesman'] as const;

const phone = z
  .string()
  .min(10)
  .max(15)
  .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number');

/**
 * The version accepted at signup.
 *
 * Stored per user rather than assumed, so that when the terms change it is
 * answerable which version each shop agreed to — that is the only thing an
 * acceptance record is actually for.
 *
 * It is the "last updated" date the site prints on its legal pages
 * (`apps/site/src/components/legal-doc.tsx`); a test holds the two together.
 */
export const TERMS_VERSION = '2026-09-26';

export const registerSchema = z.object({
  /*
   * Where they came from. Optional, capped, and never trusted as anything but a
   * label: it arrives from a public page, so it is attacker-controlled text.
   */
  attribution: z
    .object({
      channel: z.string().max(40).optional(),
      agentCode: z.string().max(40).optional(),
      referralCode: z.string().trim().max(12).optional(),
      fbclid: z.string().max(300).optional(),
      utm: z
        .object({
          source: z.string().max(80).optional(),
          medium: z.string().max(80).optional(),
          campaign: z.string().max(120).optional(),
          content: z.string().max(120).optional(),
          term: z.string().max(120).optional(),
        })
        .optional(),
    })
    .optional(),
  organizationName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone,
  password: password,
  /**
   * How many billing counters the shop runs. Suggests the plan, and a shop with
   * more than one is given that many counters for its trial (see
   * `plan.service#signupLimitOverrides`). 200 is a sanity cap, not a price list.
   */
  counters: z.number().int().min(1).max(200).optional(),
  /** How many branches (outlets) they run. Recorded for the operator; not a limit. */
  outlets: z.number().int().min(1).max(100).optional(),
  /** Their drug licence number, as typed. Recorded for the operator; not verified. */
  licence: z.string().trim().max(80).optional(),
  /**
   * The plan they say they are here for (a `Plan.key`). Not enforced during the
   * trial — the trial is full-featured — but it is what billing offers first.
   */
  intendedPlan: z.string().trim().max(40).optional(),
  /**
   * Refused rather than defaulted. An acceptance the user never made is worth
   * less than no record at all, and is worse — it looks like consent.
   */
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the terms and privacy policy to continue' }),
  }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Only sent on the second attempt, after the server has asked for it. */
  twoFactorCode: z.string().trim().max(20).optional(),
});

/**
 * Both of these now arrive in a cookie, so the body is optional - the token in
 * it is only read when there is no cookie, for an API client written against
 * the older contract.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

/**
 * An operator setting a shop user's password.
 *
 * The same strength rule as everywhere else — a support-set password is a real
 * password, and a weak one is worse here than anywhere, since it is typed out
 * over the phone. The reason is required and ends up in the audit trail; typing
 * it is the moment somebody thinks about whether they should be doing this.
 */
export const setUserPasswordSchema = z.object({
  newPassword: password,
  reason: z.string().trim().min(5, 'Say why this password is being set').max(300),
});

/** Why a shop user's second factor is being cleared. Read by people, in the audit trail. */
export const resetTwoFactorSchema = z.object({
  reason: z.string().trim().min(5, 'Say why two-factor is being reset').max(300),
});

/**
 * Setting a colleague's console password. The same rule as every other
 * password; no reason field, because the trail already names who did it and a
 * colleague is not a customer.
 */
export const teamPasswordSchema = z.object({ newPassword: password });

/**
 * An account opened by an operator for a customer who asked over the phone.
 *
 * The same password rule as everywhere else: it is read out over a phone line
 * and typed by somebody else, which is a reason for it to be strong rather than
 * an excuse for it not to be.
 */
export const createOrganizationSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  // The same phone rule as signup. An operator typing what they heard over a
  // phone line is *more* likely to mistype it, not less.
  phone,
  password,
  plan: z.string().trim().max(40).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
});

/** Correcting a shop's own details, on the shop's behalf. */
export const shopProfileSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  address: z
    .object({
      street: z.string().max(160).optional(),
      area: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      district: z.string().max(120).optional(),
      postalCode: z.string().max(20).optional(),
    })
    .optional(),
});

/** Correcting a shop user's details. Not their role, and not their password. */
export const shopUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  isActive: z.boolean().optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone,
  role: z.enum(SHOP_STAFF_ROLES),
  password: password,
});

/**
 * What somebody may change about *their own* account.
 *
 * The allow-list is the security of it: no `role`, no `isActive`, no `email`,
 * no `password`. A salesman editing their own profile must not be able to
 * promote themselves or move their login to an address they control, and
 * `.strict()` refuses the request rather than dropping the field silently. The
 * password has its own endpoint, which asks for the current one.
 */
export const updateMeSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: phone.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: phone.optional(),
  role: z.enum(SHOP_STAFF_ROLES).optional(),
  photo: z.string().optional(),
  password: password.optional(),
});
