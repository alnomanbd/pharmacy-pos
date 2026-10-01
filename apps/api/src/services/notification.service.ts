import { sendEmail } from '../integrations/email.js';
import { smsProvider } from '../integrations/sms.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { OrganizationModel } from '../models/index.js';

/**
 * What the product says to people, and when.
 *
 * One module rather than templates scattered through the services, because the
 * decisions here are about tone and timing rather than about the operations that
 * trigger them — and because every one of these is a message a shop owner reads
 * while deciding whether this software is trustworthy.
 *
 * Two rules throughout:
 *
 * - **Never throw.** A shop being approved must not fail because a mail server
 *   was down. Every send is fire-and-forget and logged.
 * - **Say the next thing to do.** A notification that reports a state without an
 *   action is a support call waiting to happen.
 */


/** Who every message here speaks as, and where its links go. */
interface MailBrand {
  name: string;
  tagline: string;
  /** The shop app; `/login` and the paths below hang off it. */
  url: string;
  profilePath: string;
  billingPath: string;
  color: string;
}

const BRAND: MailBrand = {
  name: 'Dawai',
  tagline: 'billing and stock for the medicine shop',
  get url() {
    return env.clientUrl.replace(/\/$/, '');
  },
  profilePath: '/profile',
  billingPath: '/subscription',
  color: '#0d9488',
};

/** A plain, readable HTML wrapper — no images, nothing to load, no tracking. */
function wrap(title: string, body: string, action?: { label: string; url: string }, b: MailBrand = BRAND) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111827;line-height:1.6">
  <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
  ${body}
  ${
    action
      ? `<p style="margin:20px 0"><a href="${action.url}" style="display:inline-block;background:${b.color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${action.label}</a></p>`
      : ''
  }
  <p style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
    ${b.name} — ${b.tagline}
  </p>
</div>`;
}

const taka = (n: number) => `BDT ${n.toLocaleString('en-BD')}`;
const on = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' });

/* ------------------------------------------------------------------ */
/* Account security                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tells somebody their account was signed in from a browser it has not seen.
 *
 * The one message in this file that exists to be *unwelcome*: if the person
 * reading it did not do this, it is the only warning they will get, and it has
 * to say what to do rather than just what happened. Sent on a new user agent,
 * not a new address — an owner moves between the shop's connection and mobile
 * data all evening, and an alert on every hop is an alert nobody reads.
 */
export async function newDeviceSignIn(to: {
  email: string;
  name: string;
  at: Date;
  ip: string;
  userAgent: string;
}) {
  const b = BRAND;
  const when = new Date(to.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const where = [to.ip && `IP ${to.ip}`, to.userAgent].filter(Boolean).join(' · ') || 'unknown device';
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `New sign-in to your ${b.name} account`,
    text: `Dear ${to.name},

Your account was signed in from a device we have not seen before.

When: ${when}
Device: ${where}

If this was you, nothing to do. If it was not, change your password now at ${b.url} and sign out the other devices from your profile.

— ${b.name}`,
    html: wrap(
      'New sign-in to your account',
      `<p>Dear ${to.name},</p>
       <p>Your account was signed in from a device we have not seen before.</p>
       <p style="margin:12px 0;padding:10px 12px;background:#f3f4f6;border-radius:8px;font-size:14px">
         <strong>When:</strong> ${when}<br>
         <strong>Device:</strong> ${where}
       </p>
       <p><strong>If this was you</strong>, there is nothing to do.</p>
       <p><strong>If it was not</strong>, change your password now — and sign the other devices out from your profile.</p>`,
      { label: 'Change my password', url: `${b.url}${b.profilePath}` }, b,
    ),
  });
}

/**
 * Tells a shop user that support set their password.
 *
 * The message that makes the capability survivable. An operator being able to
 * set a password is defensible; an operator being able to set one *quietly* is
 * not, so this is sent on every use and says who did it and what to do if the
 * person did not ask for it.
 */
export async function passwordChangedBySupport(to: {
  email: string;
  name: string;
  shop: string;
  operator: string;
}) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `Your ${b.name} password was changed by support`,
    text: `Dear ${to.name},

At your request, ${to.operator} from ${b.name} support set a new password on your account for ${to.shop}. You will have been given it directly.

Sign in at ${b.url}/login and change it to something only you know: your profile, then Change password.

If you did not ask for this, reply to this email immediately — your account has been signed out everywhere and nobody can use it until the new password is used.

— ${b.name}`,
    html: wrap(
      'Your password was changed by support',
      `<p>Dear ${to.name},</p>
       <p>At your request, <strong>${to.operator}</strong> from ${b.name} support set a new password on your account for <strong>${to.shop}</strong>. You will have been given it directly.</p>
       <p>Please sign in and change it to something only you know — your profile, then <em>Change password</em>.</p>
       <p><strong>If you did not ask for this</strong>, reply to this email immediately. Your account has been signed out on every device.</p>`,
      { label: 'Sign in', url: `${b.url}/login` }, b,
    ),
  });
}

/**
 * Tells somebody an account was opened for them over the phone.
 *
 * They did not fill a form in, so they have nothing to show that this exists —
 * and the password was read out to them, which is a thing people mishear and
 * forget. The email is the record, and it says to change it.
 */
export async function accountOpenedByOperator(to: {
  email: string;
  name: string;
  shop: string;
}) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `${to.shop} is ready on ${b.name}`,
    text: `Dear ${to.name},\n\nWe have opened ${to.shop} on ${b.name} at your request. Sign in at ${b.url}/login with this email address and the password we gave you.\n\nPlease change that password once you are in — your profile, then Change password — so that only you know it.\n\nIf you did not ask for this account, reply to this email and we will close it.\n\n— ${b.name}`,
    html: wrap(
      `${to.shop} is ready`,
      `<p>Dear ${to.name},</p>
       <p>We have opened <strong>${to.shop}</strong> at your request. Sign in with this email address and the password we gave you.</p>
       <p>Please change that password once you are in — your profile, then <em>Change password</em> — so that only you know it.</p>
       <p>If you did not ask for this account, reply to this email and we will close it.</p>`,
      { label: 'Sign in', url: `${b.url}/login` }, b,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Signup and approval                                                 */
/* ------------------------------------------------------------------ */

export async function shopRegistered(to: {
  email: string;
  name: string;
  shop: string;
}) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `${to.shop} — your account is being reviewed`,
    text: `Dear ${to.name},\n\nWe have received your registration for ${to.shop}. We review new shops before opening them, and will email you as soon as yours is ready — usually within a day.\n\nYou will then sign in at ${b.url}/login with this address.\n\n— ${b.name}`,
    html: wrap(
      'Your account is being reviewed',
      `<p>Dear ${to.name},</p>
       <p>We have received your registration for <strong>${to.shop}</strong>. We review new shops before opening them, and will email you as soon as yours is ready — usually within a day.</p>
       <p>You will then sign in with this email address.</p>`, undefined, b,
    ),
  });
}

/** Tells the operator there is something waiting. Otherwise nobody looks. Always in the platform's own voice. */
export async function shopAwaitingApproval(shop: string) {
  const to = env.mail.user;
  if (!to) return;
  await sendEmail({
    to,
    subject: `New shop awaiting approval: ${shop}`,
    text: `${shop} has registered and is waiting for approval.\n\n${env.consoleUrl}/shops`,
    html: wrap(
      'A shop is waiting for approval',
      `<p><strong>${shop}</strong> has registered.</p>`,
      { label: 'Open the console', url: `${env.consoleUrl}/shops` },
    ),
  });
}

export async function shopApproved(to: {
  email: string;
  name: string;
  shop: string;
  trialEndsAt?: Date | null;
}) {
  const b = BRAND;
  const trial = to.trialEndsAt
    ? ` Your trial runs until ${on(to.trialEndsAt)} — everything is open until then.`
    : '';
  const firstHour = {
    text: 'A good first hour: set your shop name and printer width, add your opening stock, and add your salesman. Then ring up one bill — that is the whole loop.',
    html: 'set your shop name and printer width, add your opening stock, add your salesman. Then ring up one bill — that is the whole loop.',
  };
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `${to.shop} is ready — you can sign in`,
    text: `Dear ${to.name},\n\n${to.shop} has been approved and is ready to use.${trial}\n\nSign in: ${b.url}/login\n\n${firstHour.text}\n\n— ${b.name}`,
    html: wrap(
      `${to.shop} is ready`,
      `<p>Dear ${to.name},</p>
       <p>Your shop has been approved and is ready to use.${trial}</p>
       <p><strong>A good first hour:</strong> ${firstHour.html}</p>`,
      { label: 'Sign in', url: `${b.url}/login` }, b,
    ),
  });
}

export async function shopSuspended(to: { email: string; name: string; shop: string; reason: string }) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `${to.shop} — account suspended`,
    text: `Dear ${to.name},\n\nAccess to ${to.shop} has been suspended.\n\nReason: ${to.reason}\n\nYour records are safe and nothing has been deleted. Settle the matter above and access is restored immediately.\n\n— ${b.name}`,
    html: wrap(
      'Account suspended',
      `<p>Dear ${to.name},</p>
       <p>Access to <strong>${to.shop}</strong> has been suspended.</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>Reason:</strong> ${to.reason}</p>
       <p>Your records are safe and nothing has been deleted. Settle the matter above and access is restored immediately.</p>`, undefined, b,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export async function paymentReceived(to: {
  email: string;
  name: string;
  amount: number;
  method: string;
  trxId?: string;
}) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `We have your payment details — ${taka(to.amount)}`,
    text: `Dear ${to.name},\n\nWe have received your payment details: ${taka(to.amount)} by ${to.method}${to.trxId ? ` (${to.trxId})` : ''}.\n\nWe check each payment against the receiving account and confirm it — usually the same day. You will get another email when it is confirmed.\n\n— ${b.name}`,
    html: wrap(
      'Payment details received',
      `<p>Dear ${to.name},</p>
       <p>We have your payment details: <strong>${taka(to.amount)}</strong> by ${to.method}${to.trxId ? ` (<code>${to.trxId}</code>)` : ''}.</p>
       <p>We check each payment against the receiving account and confirm it — usually the same day.</p>`, undefined, b,
    ),
  });
}

/** Tells the operator money is waiting to be checked. */
export async function paymentAwaitingReview(shop: string, amount: number, method: string) {
  const to = env.mail.user;
  if (!to) return;
  await sendEmail({
    to,
    subject: `Payment to check: ${taka(amount)} from ${shop}`,
    text: `${shop} submitted ${taka(amount)} by ${method}.\n\n${env.consoleUrl}/payments`,
    html: wrap(
      'A payment is waiting to be checked',
      `<p><strong>${shop}</strong> submitted <strong>${taka(amount)}</strong> by ${method}.</p>`,
      { label: 'Open payments', url: `${env.consoleUrl}/payments` },
    ),
  });
}

export async function paymentVerified(to: {
  email: string;
  name: string;
  shop: string;
  amount: number;
  plan: string;
  coversUntil: Date;
  /** The receipt number, quoted so the shop can find the invoice later. */
  invoiceNo?: string;
}) {
  const b = BRAND;
  const line = to.invoiceNo ? `Invoice: ${to.invoiceNo}\n` : '';
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `Payment confirmed — ${to.shop} is paid to ${on(to.coversUntil)}`,
    text: `Dear ${to.name},\n\nYour payment of ${taka(to.amount)} is confirmed.\n\nPlan: ${to.plan}\nPaid until: ${on(to.coversUntil)}\n${line}\nDownload the invoice from Subscription in the app.\n\nThank you.\n\n— ${b.name}`,
    html: wrap(
      'Payment confirmed',
      `<p>Dear ${to.name},</p>
       <p>Your payment of <strong>${taka(to.amount)}</strong> is confirmed.</p>
       <p>Plan: <strong>${to.plan}</strong><br/>Paid until: <strong>${on(to.coversUntil)}</strong>${
         to.invoiceNo ? `<br/>Invoice: <strong>${to.invoiceNo}</strong>` : ''
       }</p>
       <p>Download the invoice from <em>Subscription</em> in the app.</p>
       <p>Thank you.</p>`, undefined, b,
    ),
  });
}

export async function paymentRejected(to: {
  email: string;
  name: string;
  amount: number;
  reason: string;
}) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `We could not confirm your payment of ${taka(to.amount)}`,
    text: `Dear ${to.name},\n\nWe could not confirm your payment of ${taka(to.amount)}.\n\nReason: ${to.reason}\n\nIf you believe this is a mistake, reply to this email with the transaction id and a screenshot and we will look again.\n\n— ${b.name}`,
    html: wrap(
      'We could not confirm your payment',
      `<p>Dear ${to.name},</p>
       <p>We could not confirm your payment of <strong>${taka(to.amount)}</strong>.</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>Reason:</strong> ${to.reason}</p>
       <p>If you believe this is a mistake, reply to this email with the transaction id and a screenshot and we will look again.</p>`, undefined, b,
    ),
  });
}

/** Sent while there is still time to act, not on the day it stops. */
export async function subscriptionEnding(to: {
  email: string;
  name: string;
  shop: string;
  daysLeft: number;
  endsAt: Date;
}) {
  const b = BRAND;
  const when = to.daysLeft === 1 ? 'tomorrow' : `in ${to.daysLeft} days`;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `${to.shop} — subscription ends ${when}`,
    text: `Dear ${to.name},\n\nYour subscription ends ${when}, on ${on(to.endsAt)}.\n\nAfter that your records stay exactly where they are and you can still read everything — but new bills, purchases and stock changes pause until a payment is confirmed.\n\nRenew: ${b.url}${b.billingPath}\n\n— ${b.name}`,
    html: wrap(
      `Your subscription ends ${when}`,
      `<p>Dear ${to.name},</p>
       <p>Your subscription for <strong>${to.shop}</strong> ends on <strong>${on(to.endsAt)}</strong>.</p>
       <p>After that your records stay exactly where they are and you can still read everything — but new bills, purchases and stock changes pause until a payment is confirmed.</p>`,
      { label: 'Renew', url: `${b.url}${b.billingPath}` }, b,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/**
 * The reset link, by email as well as SMS.
 *
 * It went only by SMS, which fails whenever a gateway is unconfigured or a
 * number has changed — and locks the owner out of the account that pays.
 */
export async function passwordReset(to: { email: string; phone?: string; name: string; url: string }) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `Reset your ${b.name} password`,
    text: `Dear ${to.name},\n\nUse this link to set a new password. It expires shortly and can be used once.\n\n${to.url}\n\nIf you did not ask for this, ignore this email — nothing has changed.\n\n— ${b.name}`,
    html: wrap(
      'Reset your password',
      `<p>Dear ${to.name},</p>
       <p>Use the button below to set a new password. The link expires shortly and can be used once.</p>
       <p style="font-size:12px;color:#6b7280">If you did not ask for this, ignore this email — nothing has changed.</p>`,
      { label: 'Set a new password', url: to.url }, b,
    ),
  });

  if (to.phone) {
    try {
      await smsProvider.send(to.phone, `${b.name}: reset your password — ${to.url}`);
    } catch (err) {
      logger.warn({ err }, 'Password reset SMS failed; the email was still sent');
    }
  }
}

/**
 * Confirming an address is real.
 *
 * Sent at signup and on request. The shop is not blocked on it — an unverified
 * owner can still work, because blocking a paying customer over an undelivered
 * email is worse than the problem it solves — but the address that everything
 * else depends on (approval, receipts, password resets) is worth proving once.
 */
export async function verifyEmail(to: { email: string; name: string; url: string }) {
  const b = BRAND;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: `Confirm your email address`,
    text: `Dear ${to.name},\n\nConfirm this address so we can reach you about your account — approvals, payment receipts and password resets all go here.\n\n${to.url}\n\nThe link is valid for 24 hours.\n\n— ${b.name}`,
    html: wrap(
      'Confirm your email address',
      `<p>Dear ${to.name},</p>
       <p>Confirm this address so we can reach you about your account — approvals, payment receipts and password resets all go here.</p>
       <p style="font-size:12px;color:#6b7280">The link is valid for 24 hours.</p>`,
      { label: 'Confirm my email', url: to.url }, b,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Tells a shop its medicine request was answered.
 *
 * Without it the request disappears into a queue and the pharmacist asks again
 * next week, or stops asking. The brand and the reason were typed by people, so
 * both are escaped before they go into the HTML.
 */
export async function medicineRequestDecided(to: {
  email: string;
  name: string;
  brandName: string;
  added: boolean;
  reason?: string;
}) {
  const b = BRAND;
  const what = to.added
    ? `${to.brandName} is now in the ${b.name} catalogue. Search for it on the Products page to add it to your shop.`
    : `We could not add ${to.brandName} to the catalogue.${to.reason ? ` Reason: ${to.reason}` : ''}`;
  await sendEmail({
    fromName: b.name,
    to: to.email,
    subject: to.added ? `${to.brandName} has been added to ${b.name}` : `Your request for ${to.brandName}`,
    text: `Dear ${to.name},\n\n${what}\n\n— ${b.name}`,
    html: wrap(
      to.added ? 'Your medicine was added' : 'About your medicine request',
      `<p>Dear ${escapeHtml(to.name)},</p><p>${escapeHtml(what)}</p>`,
      undefined,
      b,
    ),
  });
}
