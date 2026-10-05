import { sendEmail } from '../integrations/email.js';
import { sendSms } from '../integrations/sms.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { UserModel } from '../models/index.js';
import { bnDigits, num, type Lang } from '../i18n/numerals.js';

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
 *
 * And one about language: a message to somebody who uses the shop app in Bangla
 * is written in Bangla. Each template is a pure function of what it says and the
 * language (`mails` below, exported for the tests); the send functions choose
 * the language — the caller's `lang` when it knows it (a request made before
 * sign-in), otherwise the recipient's remembered `User.lang`. Messages to the
 * platform team are always English: the console is.
 */

export type { Lang };

/** Who every message here speaks as, and where its links go. */
interface MailBrand {
  name: string;
  tagline: string;
  taglineBn: string;
  /** The shop app; `/login` and the paths below hang off it. */
  url: string;
  profilePath: string;
  billingPath: string;
  color: string;
}

const BRAND: MailBrand = {
  name: 'Dawai',
  tagline: 'billing and stock for the medicine shop',
  taglineBn: 'ওষুধের দোকানের বিল আর স্টক',
  get url() {
    return env.clientUrl.replace(/\/$/, '');
  },
  profilePath: '/profile',
  billingPath: '/subscription',
  color: '#0d9488',
};

/** A plain, readable HTML wrapper — no images, nothing to load, no tracking. */
function wrap(
  title: string,
  body: string,
  action?: { label: string; url: string },
  b: MailBrand = BRAND,
  lang: Lang = 'en',
) {
  // `lang` tells the mail app which script it is, so it picks a Bangla font.
  const font =
    lang === 'bn'
      ? 'system-ui,-apple-system,Segoe UI,Roboto,Noto Sans Bengali,sans-serif'
      : 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  return `<div lang="${lang}" style="font-family:${font};max-width:520px;margin:0 auto;color:#111827;line-height:1.6">
  <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
  ${body}
  ${
    action
      ? `<p style="margin:20px 0"><a href="${action.url}" style="display:inline-block;background:${b.color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${action.label}</a></p>`
      : ''
  }
  <p style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
    ${b.name} — ${lang === 'bn' ? b.taglineBn : b.tagline}
  </p>
</div>`;
}

/** Money: `BDT 1,250` in English, `৳১,২৫০` in Bangla. */
export const taka = (n: number, lang: Lang = 'en') => (lang === 'bn' ? `৳${num(n, 'bn')}` : `BDT ${num(n, 'en')}`);

/** A date: `5 Oct 2026`, or `৫ অক্টোবর, ২০২৬`. */
export const on = (d: Date | string, lang: Lang = 'en') =>
  lang === 'bn'
    ? bnDigits(new Date(d).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }))
    : new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' });

/** Date and time, for the sign-in alert. Bangla gets a 24-hour clock rather than a Latin AM/PM. */
const at = (d: Date, lang: Lang) =>
  lang === 'bn'
    ? bnDigits(
        new Date(d).toLocaleString('bn-BD', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      )
    : new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Escapes text typed by a person before it goes into an email's HTML. */
const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* ------------------------------------------------------------------ */
/* Choosing the language                                               */
/* ------------------------------------------------------------------ */

/** Anything addressed to a person: their email, and the language when the caller knows it. */
interface Addressed {
  email: string;
  lang?: Lang;
}

/**
 * The language to write to this person in.
 *
 * The caller's word wins (`lang` — the screen a sign-up or a forgotten password
 * was asked from). Otherwise the account's remembered language, and only for a
 * shop's own people: the platform team reads an English console, so it is
 * written to in English whatever its browser once said. Never throws — a lookup
 * that fails is an English email, not a missing one.
 */
export async function langFor(to: Addressed): Promise<Lang> {
  if (to.lang === 'bn' || to.lang === 'en') return to.lang;
  try {
    const u = await UserModel.findOne({ email: to.email.toLowerCase() }).select('lang organization').lean();
    return u?.organization && u.lang === 'bn' ? 'bn' : 'en';
  } catch (err) {
    logger.warn({ err }, 'Could not look up the language for an email; writing in English');
    return 'en';
  }
}

interface Mail {
  subject: string;
  text: string;
  html: string;
}

/** Sends one rendered template to a person, in their language. */
async function send(kind: string, to: Addressed, render: (lang: Lang) => Mail) {
  const lang = await langFor(to);
  const m = render(lang);
  await sendEmail({ kind, fromName: BRAND.name, to: to.email, ...m });
}

/* ------------------------------------------------------------------ */
/* The templates                                                       */
/* ------------------------------------------------------------------ */

type NewDeviceSignIn = Addressed & { name: string; at: Date; ip: string; userAgent: string };
type PasswordChangedBySupport = Addressed & { name: string; shop: string; operator: string };
type ShopPerson = Addressed & { name: string; shop: string };
type ShopApproved = ShopPerson & { trialEndsAt?: Date | null };
type ShopSuspended = ShopPerson & { reason: string };
type PaymentReceived = Addressed & { name: string; amount: number; method: string; trxId?: string };
type PaymentVerified = Addressed & {
  name: string;
  shop: string;
  amount: number;
  plan: string;
  coversUntil: Date;
  /** The receipt number, quoted so the shop can find the invoice later. */
  invoiceNo?: string;
};
type PaymentRejected = Addressed & { name: string; amount: number; reason: string };
type SubscriptionEnding = ShopPerson & { daysLeft: number; endsAt: Date };
type SubscriptionLapsed = ShopPerson & { endedAt: Date };
type PasswordReset = Addressed & { phone?: string; name: string; url: string };
type VerifyEmail = Addressed & { name: string; url: string };
type MedicineRequestDecided = Addressed & { name: string; brandName: string; added: boolean; reason?: string };

/**
 * Every shop-facing email, as `(details, lang) => { subject, text, html }`.
 * Pure: no lookups, no sending — which is what lets the tests read them.
 */
export const mails = {
  newDeviceSignIn(to: NewDeviceSignIn, lang: Lang): Mail {
    const b = BRAND;
    const when = at(to.at, lang);
    const unknown = lang === 'bn' ? 'অজানা ডিভাইস' : 'unknown device';
    const where = [to.ip && `IP ${to.ip}`, to.userAgent].filter(Boolean).join(' · ') || unknown;
    if (lang === 'bn') {
      return {
        subject: `আপনার ${b.name} অ্যাকাউন্টে নতুন লগইন`,
        text: `প্রিয় ${to.name},

এমন একটি ডিভাইস থেকে আপনার অ্যাকাউন্টে লগইন হয়েছে, যেটি আমরা আগে দেখিনি।

কখন: ${when}
ডিভাইস: ${where}

এটি আপনি হলে কিছু করার দরকার নেই। আপনি না হলে এখনই ${b.url} এ গিয়ে পাসওয়ার্ড বদলান, আর প্রোফাইল থেকে অন্য ডিভাইসগুলো লগআউট করুন।

— ${b.name}`,
        html: wrap(
          'আপনার অ্যাকাউন্টে নতুন লগইন',
          `<p>প্রিয় ${to.name},</p>
       <p>এমন একটি ডিভাইস থেকে আপনার অ্যাকাউন্টে লগইন হয়েছে, যেটি আমরা আগে দেখিনি।</p>
       <p style="margin:12px 0;padding:10px 12px;background:#f3f4f6;border-radius:8px;font-size:14px">
         <strong>কখন:</strong> ${when}<br>
         <strong>ডিভাইস:</strong> ${where}
       </p>
       <p><strong>এটি আপনি হলে</strong> কিছু করার দরকার নেই।</p>
       <p><strong>আপনি না হলে</strong> এখনই পাসওয়ার্ড বদলান — আর প্রোফাইল থেকে অন্য ডিভাইসগুলো লগআউট করুন।</p>`,
          { label: 'পাসওয়ার্ড বদলান', url: `${b.url}${b.profilePath}` }, b, lang,
        ),
      };
    }
    return {
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
    };
  },

  passwordChangedBySupport(to: PasswordChangedBySupport, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `সাপোর্ট আপনার ${b.name} পাসওয়ার্ড বদলে দিয়েছে`,
        text: `প্রিয় ${to.name},

আপনার অনুরোধে ${b.name} সাপোর্টের ${to.operator} ${to.shop}-এর জন্য আপনার অ্যাকাউন্টে একটি নতুন পাসওয়ার্ড সেট করেছেন। পাসওয়ার্ডটি আপনাকে সরাসরি জানানো হয়েছে।

${b.url}/login এ লগইন করে এমন একটি পাসওয়ার্ড দিন যা শুধু আপনিই জানেন: প্রোফাইল, তারপর পাসওয়ার্ড বদলান।

আপনি এটি না চেয়ে থাকলে এখনই এই ইমেইলের উত্তর দিন — আপনার অ্যাকাউন্ট সব জায়গা থেকে লগআউট করা হয়েছে, আর নতুন পাসওয়ার্ড ছাড়া কেউ এটি ব্যবহার করতে পারবে না।

— ${b.name}`,
        html: wrap(
          'সাপোর্ট আপনার পাসওয়ার্ড বদলে দিয়েছে',
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার অনুরোধে ${b.name} সাপোর্টের <strong>${to.operator}</strong> <strong>${to.shop}</strong>-এর জন্য আপনার অ্যাকাউন্টে একটি নতুন পাসওয়ার্ড সেট করেছেন। পাসওয়ার্ডটি আপনাকে সরাসরি জানানো হয়েছে।</p>
       <p>লগইন করে এমন একটি পাসওয়ার্ড দিন যা শুধু আপনিই জানেন — প্রোফাইল, তারপর <em>পাসওয়ার্ড বদলান</em>।</p>
       <p><strong>আপনি এটি না চেয়ে থাকলে</strong> এখনই এই ইমেইলের উত্তর দিন। আপনার অ্যাকাউন্ট সব ডিভাইস থেকে লগআউট করা হয়েছে।</p>`,
          { label: 'লগইন', url: `${b.url}/login` }, b, lang,
        ),
      };
    }
    return {
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
    };
  },

  accountOpenedByOperator(to: ShopPerson, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `${to.shop} এখন ${b.name}-তে চালু`,
        text: `প্রিয় ${to.name},\n\nআপনার অনুরোধে আমরা ${b.name}-তে ${to.shop} চালু করেছি। এই ইমেইল ঠিকানা আর আমাদের দেওয়া পাসওয়ার্ড দিয়ে ${b.url}/login এ লগইন করুন।\n\nলগইন করার পর পাসওয়ার্ডটি বদলে নিন — প্রোফাইল, তারপর পাসওয়ার্ড বদলান — যাতে শুধু আপনিই এটি জানেন।\n\nআপনি এই অ্যাকাউন্ট না চেয়ে থাকলে এই ইমেইলের উত্তর দিন, আমরা এটি বন্ধ করে দেব।\n\n— ${b.name}`,
        html: wrap(
          `${to.shop} চালু হয়েছে`,
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার অনুরোধে আমরা <strong>${to.shop}</strong> চালু করেছি। এই ইমেইল ঠিকানা আর আমাদের দেওয়া পাসওয়ার্ড দিয়ে লগইন করুন।</p>
       <p>লগইন করার পর পাসওয়ার্ডটি বদলে নিন — প্রোফাইল, তারপর <em>পাসওয়ার্ড বদলান</em> — যাতে শুধু আপনিই এটি জানেন।</p>
       <p>আপনি এই অ্যাকাউন্ট না চেয়ে থাকলে এই ইমেইলের উত্তর দিন, আমরা এটি বন্ধ করে দেব।</p>`,
          { label: 'লগইন', url: `${b.url}/login` }, b, lang,
        ),
      };
    }
    return {
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
    };
  },

  shopRegistered(to: ShopPerson, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `${to.shop} — আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে`,
        text: `প্রিয় ${to.name},\n\n${to.shop}-এর রেজিস্ট্রেশন আমরা পেয়েছি। নতুন দোকান চালু করার আগে আমরা যাচাই করে দেখি, আর আপনারটি তৈরি হলেই ইমেইল করে জানাব — সাধারণত এক দিনের মধ্যে।\n\nতারপর এই ঠিকানা দিয়ে ${b.url}/login এ লগইন করবেন।\n\n— ${b.name}`,
        html: wrap(
          'আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে',
          `<p>প্রিয় ${to.name},</p>
       <p><strong>${to.shop}</strong>-এর রেজিস্ট্রেশন আমরা পেয়েছি। নতুন দোকান চালু করার আগে আমরা যাচাই করে দেখি, আর আপনারটি তৈরি হলেই ইমেইল করে জানাব — সাধারণত এক দিনের মধ্যে।</p>
       <p>তারপর এই ইমেইল ঠিকানা দিয়ে লগইন করবেন।</p>`, undefined, b, lang,
        ),
      };
    }
    return {
      subject: `${to.shop} — your account is being reviewed`,
      text: `Dear ${to.name},\n\nWe have received your registration for ${to.shop}. We review new shops before opening them, and will email you as soon as yours is ready — usually within a day.\n\nYou will then sign in at ${b.url}/login with this address.\n\n— ${b.name}`,
      html: wrap(
        'Your account is being reviewed',
        `<p>Dear ${to.name},</p>
       <p>We have received your registration for <strong>${to.shop}</strong>. We review new shops before opening them, and will email you as soon as yours is ready — usually within a day.</p>
       <p>You will then sign in with this email address.</p>`, undefined, b,
      ),
    };
  },

  shopApproved(to: ShopApproved, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      const trial = to.trialEndsAt ? ` আপনার ট্রায়াল ${on(to.trialEndsAt, lang)} পর্যন্ত চলবে — ততদিন সবকিছু খোলা।` : '';
      const firstHour =
        'দোকানের নাম আর প্রিন্টারের মাপ ঠিক করুন, শুরুর স্টক যোগ করুন, আপনার সেলসম্যান যোগ করুন। তারপর একটি বিল করে দেখুন — পুরো কাজটা এটুকুই।';
      return {
        subject: `${to.shop} তৈরি — এখন লগইন করতে পারেন`,
        text: `প্রিয় ${to.name},\n\n${to.shop} অনুমোদিত হয়েছে এবং ব্যবহারের জন্য তৈরি।${trial}\n\nলগইন: ${b.url}/login\n\nপ্রথম এক ঘণ্টায় যা করবেন: ${firstHour}\n\n— ${b.name}`,
        html: wrap(
          `${to.shop} তৈরি`,
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার দোকান অনুমোদিত হয়েছে এবং ব্যবহারের জন্য তৈরি।${trial}</p>
       <p><strong>প্রথম এক ঘণ্টায় যা করবেন:</strong> ${firstHour}</p>`,
          { label: 'লগইন', url: `${b.url}/login` }, b, lang,
        ),
      };
    }
    const trial = to.trialEndsAt ? ` Your trial runs until ${on(to.trialEndsAt)} — everything is open until then.` : '';
    const firstHour = {
      text: 'A good first hour: set your shop name and printer width, add your opening stock, and add your salesman. Then ring up one bill — that is the whole loop.',
      html: 'set your shop name and printer width, add your opening stock, add your salesman. Then ring up one bill — that is the whole loop.',
    };
    return {
      subject: `${to.shop} is ready — you can sign in`,
      text: `Dear ${to.name},\n\n${to.shop} has been approved and is ready to use.${trial}\n\nSign in: ${b.url}/login\n\n${firstHour.text}\n\n— ${b.name}`,
      html: wrap(
        `${to.shop} is ready`,
        `<p>Dear ${to.name},</p>
       <p>Your shop has been approved and is ready to use.${trial}</p>
       <p><strong>A good first hour:</strong> ${firstHour.html}</p>`,
        { label: 'Sign in', url: `${b.url}/login` }, b,
      ),
    };
  },

  shopSuspended(to: ShopSuspended, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `${to.shop} — অ্যাকাউন্ট স্থগিত`,
        text: `প্রিয় ${to.name},\n\n${to.shop} ব্যবহার করা স্থগিত করা হয়েছে।\n\nকারণ: ${to.reason}\n\nআপনার সব হিসাব নিরাপদ আছে, কিছুই মুছে ফেলা হয়নি। ওপরের বিষয়টি মিটিয়ে নিলেই সঙ্গে সঙ্গে আবার চালু হয়ে যাবে।\n\n— ${b.name}`,
        html: wrap(
          'অ্যাকাউন্ট স্থগিত',
          `<p>প্রিয় ${to.name},</p>
       <p><strong>${to.shop}</strong> ব্যবহার করা স্থগিত করা হয়েছে।</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>কারণ:</strong> ${to.reason}</p>
       <p>আপনার সব হিসাব নিরাপদ আছে, কিছুই মুছে ফেলা হয়নি। ওপরের বিষয়টি মিটিয়ে নিলেই সঙ্গে সঙ্গে আবার চালু হয়ে যাবে।</p>`, undefined, b, lang,
        ),
      };
    }
    return {
      subject: `${to.shop} — account suspended`,
      text: `Dear ${to.name},\n\nAccess to ${to.shop} has been suspended.\n\nReason: ${to.reason}\n\nYour records are safe and nothing has been deleted. Settle the matter above and access is restored immediately.\n\n— ${b.name}`,
      html: wrap(
        'Account suspended',
        `<p>Dear ${to.name},</p>
       <p>Access to <strong>${to.shop}</strong> has been suspended.</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>Reason:</strong> ${to.reason}</p>
       <p>Your records are safe and nothing has been deleted. Settle the matter above and access is restored immediately.</p>`, undefined, b,
      ),
    };
  },

  paymentReceived(to: PaymentReceived, lang: Lang): Mail {
    const b = BRAND;
    const amount = taka(to.amount, lang);
    if (lang === 'bn') {
      return {
        subject: `আপনার পেমেন্টের তথ্য পেয়েছি — ${amount}`,
        text: `প্রিয় ${to.name},\n\nআপনার পেমেন্টের তথ্য আমরা পেয়েছি: ${amount}, ${to.method} দিয়ে${to.trxId ? ` (${to.trxId})` : ''}।\n\nপ্রতিটি পেমেন্ট আমরা যে অ্যাকাউন্টে টাকা এসেছে তার সাথে মিলিয়ে নিশ্চিত করি — সাধারণত একই দিনে। নিশ্চিত হলে আরেকটি ইমেইল পাবেন।\n\n— ${b.name}`,
        html: wrap(
          'পেমেন্টের তথ্য পেয়েছি',
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার পেমেন্টের তথ্য আমরা পেয়েছি: <strong>${amount}</strong>, ${to.method} দিয়ে${to.trxId ? ` (<code>${to.trxId}</code>)` : ''}।</p>
       <p>প্রতিটি পেমেন্ট আমরা যে অ্যাকাউন্টে টাকা এসেছে তার সাথে মিলিয়ে নিশ্চিত করি — সাধারণত একই দিনে।</p>`, undefined, b, lang,
        ),
      };
    }
    return {
      subject: `We have your payment details — ${amount}`,
      text: `Dear ${to.name},\n\nWe have received your payment details: ${amount} by ${to.method}${to.trxId ? ` (${to.trxId})` : ''}.\n\nWe check each payment against the receiving account and confirm it — usually the same day. You will get another email when it is confirmed.\n\n— ${b.name}`,
      html: wrap(
        'Payment details received',
        `<p>Dear ${to.name},</p>
       <p>We have your payment details: <strong>${amount}</strong> by ${to.method}${to.trxId ? ` (<code>${to.trxId}</code>)` : ''}.</p>
       <p>We check each payment against the receiving account and confirm it — usually the same day.</p>`, undefined, b,
      ),
    };
  },

  paymentVerified(to: PaymentVerified, lang: Lang): Mail {
    const b = BRAND;
    const amount = taka(to.amount, lang);
    const until = on(to.coversUntil, lang);
    if (lang === 'bn') {
      const line = to.invoiceNo ? `ইনভয়েস: ${to.invoiceNo}\n` : '';
      return {
        subject: `পেমেন্ট নিশ্চিত — ${to.shop}-এর মেয়াদ ${until} পর্যন্ত`,
        text: `প্রিয় ${to.name},\n\nআপনার ${amount} পেমেন্ট নিশ্চিত হয়েছে।\n\nপ্ল্যান: ${to.plan}\nপরিশোধিত মেয়াদ: ${until}\n${line}\nঅ্যাপের সাবস্ক্রিপশন থেকে ইনভয়েস ডাউনলোড করুন।\n\nধন্যবাদ।\n\n— ${b.name}`,
        html: wrap(
          'পেমেন্ট নিশ্চিত',
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার <strong>${amount}</strong> পেমেন্ট নিশ্চিত হয়েছে।</p>
       <p>প্ল্যান: <strong>${to.plan}</strong><br/>পরিশোধিত মেয়াদ: <strong>${until}</strong>${
         to.invoiceNo ? `<br/>ইনভয়েস: <strong>${to.invoiceNo}</strong>` : ''
       }</p>
       <p>অ্যাপের <em>সাবস্ক্রিপশন</em> থেকে ইনভয়েস ডাউনলোড করুন।</p>
       <p>ধন্যবাদ।</p>`, undefined, b, lang,
        ),
      };
    }
    const line = to.invoiceNo ? `Invoice: ${to.invoiceNo}\n` : '';
    return {
      subject: `Payment confirmed — ${to.shop} is paid to ${until}`,
      text: `Dear ${to.name},\n\nYour payment of ${amount} is confirmed.\n\nPlan: ${to.plan}\nPaid until: ${until}\n${line}\nDownload the invoice from Subscription in the app.\n\nThank you.\n\n— ${b.name}`,
      html: wrap(
        'Payment confirmed',
        `<p>Dear ${to.name},</p>
       <p>Your payment of <strong>${amount}</strong> is confirmed.</p>
       <p>Plan: <strong>${to.plan}</strong><br/>Paid until: <strong>${until}</strong>${
         to.invoiceNo ? `<br/>Invoice: <strong>${to.invoiceNo}</strong>` : ''
       }</p>
       <p>Download the invoice from <em>Subscription</em> in the app.</p>
       <p>Thank you.</p>`, undefined, b,
      ),
    };
  },

  paymentRejected(to: PaymentRejected, lang: Lang): Mail {
    const b = BRAND;
    const amount = taka(to.amount, lang);
    if (lang === 'bn') {
      return {
        subject: `আপনার ${amount} পেমেন্ট আমরা নিশ্চিত করতে পারিনি`,
        text: `প্রিয় ${to.name},\n\nআপনার ${amount} পেমেন্ট আমরা নিশ্চিত করতে পারিনি।\n\nকারণ: ${to.reason}\n\nআপনার মনে হলে এটি ভুল হয়েছে, ট্রানজেকশন আইডি আর একটি স্ক্রিনশট দিয়ে এই ইমেইলের উত্তর দিন — আমরা আবার দেখব।\n\n— ${b.name}`,
        html: wrap(
          'আপনার পেমেন্ট আমরা নিশ্চিত করতে পারিনি',
          `<p>প্রিয় ${to.name},</p>
       <p>আপনার <strong>${amount}</strong> পেমেন্ট আমরা নিশ্চিত করতে পারিনি।</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>কারণ:</strong> ${to.reason}</p>
       <p>আপনার মনে হলে এটি ভুল হয়েছে, ট্রানজেকশন আইডি আর একটি স্ক্রিনশট দিয়ে এই ইমেইলের উত্তর দিন — আমরা আবার দেখব।</p>`, undefined, b, lang,
        ),
      };
    }
    return {
      subject: `We could not confirm your payment of ${amount}`,
      text: `Dear ${to.name},\n\nWe could not confirm your payment of ${amount}.\n\nReason: ${to.reason}\n\nIf you believe this is a mistake, reply to this email with the transaction id and a screenshot and we will look again.\n\n— ${b.name}`,
      html: wrap(
        'We could not confirm your payment',
        `<p>Dear ${to.name},</p>
       <p>We could not confirm your payment of <strong>${amount}</strong>.</p>
       <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>Reason:</strong> ${to.reason}</p>
       <p>If you believe this is a mistake, reply to this email with the transaction id and a screenshot and we will look again.</p>`, undefined, b,
      ),
    };
  },

  subscriptionEnding(to: SubscriptionEnding, lang: Lang): Mail {
    const b = BRAND;
    const ends = on(to.endsAt, lang);
    if (lang === 'bn') {
      const when = to.daysLeft <= 0 ? 'আজ' : to.daysLeft === 1 ? 'আগামীকাল' : `${bnDigits(to.daysLeft)} দিন পরে`;
      return {
        subject: `${to.shop} — সাবস্ক্রিপশন ${when} শেষ হবে`,
        text: `প্রিয় ${to.name},\n\nআপনার সাবস্ক্রিপশন ${when}, ${ends} তারিখে শেষ হবে।\n\nএরপরও আপনার সব হিসাব যেমন আছে তেমনই থাকবে, সবকিছু দেখতেও পারবেন — কিন্তু পেমেন্ট নিশ্চিত না হওয়া পর্যন্ত নতুন বিল, মাল কেনা আর স্টকের পরিবর্তন বন্ধ থাকবে।\n\nনবায়ন করুন: ${b.url}${b.billingPath}\n\n— ${b.name}`,
        html: wrap(
          `আপনার সাবস্ক্রিপশন ${when} শেষ হবে`,
          `<p>প্রিয় ${to.name},</p>
       <p><strong>${to.shop}</strong>-এর সাবস্ক্রিপশন <strong>${ends}</strong> তারিখে শেষ হবে।</p>
       <p>এরপরও আপনার সব হিসাব যেমন আছে তেমনই থাকবে, সবকিছু দেখতেও পারবেন — কিন্তু পেমেন্ট নিশ্চিত না হওয়া পর্যন্ত নতুন বিল, মাল কেনা আর স্টকের পরিবর্তন বন্ধ থাকবে।</p>`,
          { label: 'নবায়ন করুন', url: `${b.url}${b.billingPath}` }, b, lang,
        ),
      };
    }
    const when = to.daysLeft <= 0 ? 'today' : to.daysLeft === 1 ? 'tomorrow' : `in ${to.daysLeft} days`;
    return {
      subject: `${to.shop} — subscription ends ${when}`,
      text: `Dear ${to.name},\n\nYour subscription ends ${when}, on ${ends}.\n\nAfter that your records stay exactly where they are and you can still read everything — but new bills, purchases and stock changes pause until a payment is confirmed.\n\nRenew: ${b.url}${b.billingPath}\n\n— ${b.name}`,
      html: wrap(
        `Your subscription ends ${when}`,
        `<p>Dear ${to.name},</p>
       <p>Your subscription for <strong>${to.shop}</strong> ends on <strong>${ends}</strong>.</p>
       <p>After that your records stay exactly where they are and you can still read everything — but new bills, purchases and stock changes pause until a payment is confirmed.</p>`,
        { label: 'Renew', url: `${b.url}${b.billingPath}` }, b,
      ),
    };
  },

  subscriptionLapsed(to: SubscriptionLapsed, lang: Lang): Mail {
    const b = BRAND;
    const ended = on(to.endedAt, lang);
    if (lang === 'bn') {
      return {
        subject: `${to.shop} — আপনার সাবস্ক্রিপশন শেষ হয়েছে`,
        text: `প্রিয় ${to.name},

${to.shop}-এর সাবস্ক্রিপশন ${ended} তারিখে শেষ হয়েছে। আপনার সব হিসাব আছে এবং দেখতে পারবেন, কিন্তু নতুন বিল, মাল কেনা আর স্টকের পরিবর্তন বন্ধ আছে।

নবায়ন করে যেখানে ছিলেন সেখান থেকে আবার শুরু করুন: ${b.url}${b.billingPath}

কোনো কারণে নবায়ন করতে না পারলে শুধু উত্তর দিন — আমরা সাহায্য করব।

— ${b.name}`,
        html: wrap(
          'আপনার সাবস্ক্রিপশন শেষ হয়েছে',
          `<p>প্রিয় ${esc(to.name)},</p>
       <p><strong>${esc(to.shop)}</strong>-এর সাবস্ক্রিপশন <strong>${ended}</strong> তারিখে শেষ হয়েছে। আপনার সব হিসাব আছে এবং দেখতে পারবেন, কিন্তু নতুন বিল, মাল কেনা আর স্টকের পরিবর্তন বন্ধ আছে।</p>
       <p>কোনো কারণে নবায়ন করতে না পারলে শুধু উত্তর দিন — আমরা সাহায্য করব।</p>`,
          { label: 'নবায়ন করুন', url: `${b.url}${b.billingPath}` }, b, lang,
        ),
      };
    }
    return {
      subject: `${to.shop} — your subscription has ended`,
      text: `Dear ${to.name},

Your subscription for ${to.shop} ended on ${ended}. Your records are all still there and you can read them, but new bills, purchases and stock changes are paused.

Renew and carry on where you left off: ${b.url}${b.billingPath}

If something stopped you from renewing, just reply — we will help.

— ${b.name}`,
      html: wrap(
        'Your subscription has ended',
        `<p>Dear ${esc(to.name)},</p>
       <p>Your subscription for <strong>${esc(to.shop)}</strong> ended on <strong>${ended}</strong>. Your records are all still there and you can read them, but new bills, purchases and stock changes are paused.</p>
       <p>If something stopped you from renewing, just reply — we will help.</p>`,
        { label: 'Renew', url: `${b.url}${b.billingPath}` }, b,
      ),
    };
  },

  setupHelp(to: ShopPerson, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `${to.shop} — সেটআপে আমরা কি সাহায্য করতে পারি?`,
        text: `প্রিয় ${to.name},\n\n${b.name}-তে ${to.shop} শুরু করার জন্য ধন্যবাদ। ওষুধ, স্টাফ আর সাপ্লায়ারের তথ্য তোলাটাই সময়ের কাজ — আর আমরা বিনা খরচে কাজটা আপনার সাথে করে দিতে পারি, ফোনে বা দোকানে এসে।\n\nএই ইমেইলের উত্তর দিন অথবা অ্যাপের সাপোর্ট থেকে আমাদের মেসেজ করুন, আর আপনার সুবিধামতো সময় জানান।\n\n${b.name} খুলুন: ${b.url}\n\n— ${b.name}`,
        html: wrap(
          'সেটআপে আমরা কি সাহায্য করতে পারি?',
          `<p>প্রিয় ${esc(to.name)},</p>
       <p>${b.name}-তে <strong>${esc(to.shop)}</strong> শুরু করার জন্য ধন্যবাদ। ওষুধ, স্টাফ আর সাপ্লায়ারের তথ্য তোলাটাই সময়ের কাজ — আর আমরা বিনা খরচে কাজটা আপনার সাথে করে দিতে পারি, ফোনে বা দোকানে এসে।</p>
       <p>এই ইমেইলের উত্তর দিন অথবা অ্যাপের <strong>সাপোর্ট</strong> থেকে আমাদের মেসেজ করুন, আর আপনার সুবিধামতো সময় জানান।</p>`,
          { label: `${b.name} খুলুন`, url: b.url }, b, lang,
        ),
      };
    }
    return {
      subject: `${to.shop} — can we help you get set up?`,
      text: `Dear ${to.name},\n\nThanks for starting ${to.shop} on ${b.name}. Getting your medicines, staff and suppliers in is the slow part — and we are happy to do it with you, free, over the phone or by visiting.\n\nReply to this email or message us from Support in the app, and tell us a good time.\n\nOpen ${b.name}: ${b.url}\n\n— ${b.name}`,
      html: wrap(
        'Can we help you get set up?',
        `<p>Dear ${esc(to.name)},</p>
       <p>Thanks for starting <strong>${esc(to.shop)}</strong> on ${b.name}. Getting your medicines, staff and suppliers in is the slow part — and we are happy to do it with you, free, over the phone or by visiting.</p>
       <p>Reply to this email or message us from <strong>Support</strong> in the app, and tell us a good time.</p>`,
        { label: `Open ${b.name}`, url: b.url }, b,
      ),
    };
  },

  shopInactive(to: ShopPerson, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `${to.shop} — ${b.name} নিয়ে সব ঠিক আছে তো?`,
        text: `প্রিয় ${to.name},

আমরা দেখলাম এই সপ্তাহে ${to.shop}-এ কেউ কোনো বিল করেননি বা ${b.name}-তে লগইন করেননি। কোনো কিছু বাধা হয়ে থাকলে — প্রিন্টার, কোনো ওষুধ খুঁজে না পাওয়া, স্টাফের সাহায্য দরকার — এই ইমেইলের উত্তর দিন অথবা অ্যাপের সাপোর্ট থেকে আমাদের মেসেজ করুন, আমরা আপনার সাথে মিলে সমাধান করব।

${b.name} খুলুন: ${b.url}

— ${b.name}`,
        html: wrap(
          'সব ঠিক আছে তো?',
          `<p>প্রিয় ${esc(to.name)},</p>
       <p>আমরা দেখলাম এই সপ্তাহে <strong>${esc(to.shop)}</strong>-এ কেউ কোনো বিল করেননি বা ${b.name}-তে লগইন করেননি।</p>
       <p>কোনো কিছু বাধা হয়ে থাকলে — প্রিন্টার, কোনো ওষুধ খুঁজে না পাওয়া, স্টাফের সাহায্য দরকার — এই ইমেইলের উত্তর দিন অথবা অ্যাপের <strong>সাপোর্ট</strong> থেকে আমাদের মেসেজ করুন, আমরা আপনার সাথে মিলে সমাধান করব।</p>`,
          { label: `${b.name} খুলুন`, url: b.url }, b, lang,
        ),
      };
    }
    return {
      subject: `${to.shop} — is everything all right with ${b.name}?`,
      text: `Dear ${to.name},

We noticed nobody at ${to.shop} has rung up a bill or signed in to ${b.name} this week. If something is getting in the way — a printer, a missing medicine, staff who need a hand — reply to this email or message us from Support in the app, and we will sort it out with you.

Open ${b.name}: ${b.url}

— ${b.name}`,
      html: wrap(
        'Is everything all right?',
        `<p>Dear ${esc(to.name)},</p>
       <p>We noticed nobody at <strong>${esc(to.shop)}</strong> has rung up a bill or signed in to ${b.name} this week.</p>
       <p>If something is getting in the way — a printer, a missing medicine, staff who need a hand — reply to this email or message us from <strong>Support</strong> in the app, and we will sort it out with you.</p>`,
        { label: `Open ${b.name}`, url: b.url }, b,
      ),
    };
  },

  passwordReset(to: PasswordReset, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: `আপনার ${b.name} পাসওয়ার্ড রিসেট করুন`,
        text: `প্রিয় ${to.name},\n\nনতুন পাসওয়ার্ড দিতে এই লিংকটি ব্যবহার করুন। লিংকটি কিছুক্ষণের মধ্যে মেয়াদোত্তীর্ণ হবে, আর একবারই ব্যবহার করা যাবে।\n\n${to.url}\n\nআপনি এটি না চেয়ে থাকলে এই ইমেইলটি উপেক্ষা করুন — কিছুই বদলায়নি।\n\n— ${b.name}`,
        html: wrap(
          'আপনার পাসওয়ার্ড রিসেট করুন',
          `<p>প্রিয় ${to.name},</p>
       <p>নতুন পাসওয়ার্ড দিতে নিচের বোতামটি চাপুন। লিংকটি কিছুক্ষণের মধ্যে মেয়াদোত্তীর্ণ হবে, আর একবারই ব্যবহার করা যাবে।</p>
       <p style="font-size:12px;color:#6b7280">আপনি এটি না চেয়ে থাকলে এই ইমেইলটি উপেক্ষা করুন — কিছুই বদলায়নি।</p>`,
          { label: 'নতুন পাসওয়ার্ড দিন', url: to.url }, b, lang,
        ),
      };
    }
    return {
      subject: `Reset your ${b.name} password`,
      text: `Dear ${to.name},\n\nUse this link to set a new password. It expires shortly and can be used once.\n\n${to.url}\n\nIf you did not ask for this, ignore this email — nothing has changed.\n\n— ${b.name}`,
      html: wrap(
        'Reset your password',
        `<p>Dear ${to.name},</p>
       <p>Use the button below to set a new password. The link expires shortly and can be used once.</p>
       <p style="font-size:12px;color:#6b7280">If you did not ask for this, ignore this email — nothing has changed.</p>`,
        { label: 'Set a new password', url: to.url }, b,
      ),
    };
  },

  verifyEmail(to: VerifyEmail, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      return {
        subject: 'আপনার ইমেইল ঠিকানা নিশ্চিত করুন',
        text: `প্রিয় ${to.name},\n\nএই ঠিকানাটি নিশ্চিত করুন, যাতে আপনার অ্যাকাউন্টের ব্যাপারে আমরা আপনার সাথে যোগাযোগ করতে পারি — অনুমোদন, পেমেন্টের রসিদ আর পাসওয়ার্ড রিসেট সব এখানেই আসে।\n\n${to.url}\n\nলিংকটি ২৪ ঘণ্টা কাজ করবে।\n\n— ${b.name}`,
        html: wrap(
          'আপনার ইমেইল ঠিকানা নিশ্চিত করুন',
          `<p>প্রিয় ${to.name},</p>
       <p>এই ঠিকানাটি নিশ্চিত করুন, যাতে আপনার অ্যাকাউন্টের ব্যাপারে আমরা আপনার সাথে যোগাযোগ করতে পারি — অনুমোদন, পেমেন্টের রসিদ আর পাসওয়ার্ড রিসেট সব এখানেই আসে।</p>
       <p style="font-size:12px;color:#6b7280">লিংকটি ২৪ ঘণ্টা কাজ করবে।</p>`,
          { label: 'ইমেইল নিশ্চিত করুন', url: to.url }, b, lang,
        ),
      };
    }
    return {
      subject: 'Confirm your email address',
      text: `Dear ${to.name},\n\nConfirm this address so we can reach you about your account — approvals, payment receipts and password resets all go here.\n\n${to.url}\n\nThe link is valid for 24 hours.\n\n— ${b.name}`,
      html: wrap(
        'Confirm your email address',
        `<p>Dear ${to.name},</p>
       <p>Confirm this address so we can reach you about your account — approvals, payment receipts and password resets all go here.</p>
       <p style="font-size:12px;color:#6b7280">The link is valid for 24 hours.</p>`,
        { label: 'Confirm my email', url: to.url }, b,
      ),
    };
  },

  /** The brand and the reason were typed by people, so both are escaped before they go into the HTML. */
  medicineRequestDecided(to: MedicineRequestDecided, lang: Lang): Mail {
    const b = BRAND;
    if (lang === 'bn') {
      const what = to.added
        ? `${to.brandName} এখন ${b.name} ক্যাটালগে আছে। আপনার দোকানে যোগ করতে স্টক পেজে এটি খুঁজুন।`
        : `${to.brandName} ক্যাটালগে যোগ করা যায়নি।${to.reason ? ` কারণ: ${to.reason}` : ''}`;
      return {
        subject: to.added ? `${to.brandName} ${b.name}-তে যোগ করা হয়েছে` : `${to.brandName}-এর জন্য আপনার অনুরোধ`,
        text: `প্রিয় ${to.name},\n\n${what}\n\n— ${b.name}`,
        html: wrap(
          to.added ? 'আপনার ওষুধটি যোগ করা হয়েছে' : 'আপনার ওষুধের অনুরোধ সম্পর্কে',
          `<p>প্রিয় ${esc(to.name)},</p><p>${esc(what)}</p>`,
          undefined,
          b,
          lang,
        ),
      };
    }
    const what = to.added
      ? `${to.brandName} is now in the ${b.name} catalogue. Search for it on the Stock page to add it to your shop.`
      : `We could not add ${to.brandName} to the catalogue.${to.reason ? ` Reason: ${to.reason}` : ''}`;
    return {
      subject: to.added ? `${to.brandName} has been added to ${b.name}` : `Your request for ${to.brandName}`,
      text: `Dear ${to.name},\n\n${what}\n\n— ${b.name}`,
      html: wrap(
        to.added ? 'Your medicine was added' : 'About your medicine request',
        `<p>Dear ${esc(to.name)},</p><p>${esc(what)}</p>`,
        undefined,
        b,
      ),
    };
  },
};

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
export async function newDeviceSignIn(to: NewDeviceSignIn) {
  await send('newDeviceSignIn', to, (lang) => mails.newDeviceSignIn(to, lang));
}

/**
 * Tells a shop user that support set their password.
 *
 * The message that makes the capability survivable. An operator being able to
 * set a password is defensible; an operator being able to set one *quietly* is
 * not, so this is sent on every use and says who did it and what to do if the
 * person did not ask for it.
 */
export async function passwordChangedBySupport(to: PasswordChangedBySupport) {
  await send('passwordChangedBySupport', to, (lang) => mails.passwordChangedBySupport(to, lang));
}

/**
 * Tells somebody an account was opened for them over the phone.
 *
 * They did not fill a form in, so they have nothing to show that this exists —
 * and the password was read out to them, which is a thing people mishear and
 * forget. The email is the record, and it says to change it.
 */
export async function accountOpenedByOperator(to: ShopPerson) {
  await send('accountOpenedByOperator', to, (lang) => mails.accountOpenedByOperator(to, lang));
}

/* ------------------------------------------------------------------ */
/* Signup and approval                                                 */
/* ------------------------------------------------------------------ */

export async function shopRegistered(to: ShopPerson) {
  await send('shopRegistered', to, (lang) => mails.shopRegistered(to, lang));
}

/** Tells the operator there is something waiting. Otherwise nobody looks. Always in the platform's own voice. */
export async function shopAwaitingApproval(shop: string) {
  const to = env.mail.user;
  if (!to) return;
  await sendEmail({
    kind: 'shopAwaitingApproval',
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

export async function shopApproved(to: ShopApproved) {
  await send('shopApproved', to, (lang) => mails.shopApproved(to, lang));
}

export async function shopSuspended(to: ShopSuspended) {
  await send('shopSuspended', to, (lang) => mails.shopSuspended(to, lang));
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export async function paymentReceived(to: PaymentReceived) {
  await send('paymentReceived', to, (lang) => mails.paymentReceived(to, lang));
}

/** Tells the operator money is waiting to be checked. */
export async function paymentAwaitingReview(shop: string, amount: number, method: string) {
  const to = env.mail.user;
  if (!to) return;
  await sendEmail({
    kind: 'paymentAwaitingReview',
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

export async function paymentVerified(to: PaymentVerified) {
  await send('paymentVerified', to, (lang) => mails.paymentVerified(to, lang));
}

export async function paymentRejected(to: PaymentRejected) {
  await send('paymentRejected', to, (lang) => mails.paymentRejected(to, lang));
}

/** Sent while there is still time to act, not on the day it stops. */
export async function subscriptionEnding(to: SubscriptionEnding) {
  await send('subscriptionEnding', to, (lang) => mails.subscriptionEnding(to, lang));
}

/** Sent by hand from the console's Renewals page, once the paid time has run out. */
export async function subscriptionLapsed(to: SubscriptionLapsed) {
  await send('subscriptionLapsed', to, (lang) => mails.subscriptionLapsed(to, lang));
}

/** Sent by hand from the Renewals page to a new shop that has not got going. */
export async function setupHelp(to: ShopPerson) {
  await send('setupHelp', to, (lang) => mails.setupHelp(to, lang));
}

/** Sent by hand from the Renewals page to a shop that has gone quiet. */
export async function shopInactive(to: ShopPerson) {
  await send('shopInactive', to, (lang) => mails.shopInactive(to, lang));
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/**
 * The reset link, by email as well as SMS.
 *
 * It went only by SMS, which fails whenever a gateway is unconfigured or a
 * number has changed — and locks the owner out of the account that pays.
 *
 * The SMS stays in English whatever the language: a Bangla SMS goes as UCS-2,
 * 70 characters to a part rather than 160, and this one is a link with a few
 * words around it.
 */
export async function passwordReset(to: PasswordReset) {
  const b = BRAND;
  await send('passwordReset', to, (lang) => mails.passwordReset(to, lang));

  if (to.phone) {
    try {
      await sendSms(to.phone, `${b.name}: reset your password — ${to.url}`, { kind: 'passwordReset' });
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
export async function verifyEmail(to: VerifyEmail) {
  await send('verifyEmail', to, (lang) => mails.verifyEmail(to, lang));
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tells a shop its medicine request was answered.
 *
 * Without it the request disappears into a queue and the pharmacist asks again
 * next week, or stops asking.
 */
export async function medicineRequestDecided(to: MedicineRequestDecided) {
  await send('medicineRequestDecided', to, (lang) => mails.medicineRequestDecided(to, lang));
}
