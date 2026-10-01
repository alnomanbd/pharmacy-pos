import crypto from 'node:crypto';
import { generateSecret, verify as verifyTotp, generateURI } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/index.js';
import { badRequest, notFound, unauthorized } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Two-factor authentication, for the operator account.
 *
 * One password currently guards every shop on the deployment — the account
 * that can suspend a customer, export any shop's data, and edit the catalogue
 * everyone sells from. That is the one login worth a second
 * factor.
 *
 * TOTP rather than SMS: it needs no gateway, costs nothing, works when a number
 * changes, and is not defeated by a SIM swap. Recovery codes exist because the
 * realistic way this goes wrong is a lost phone, and an operator locked out of
 * their own console has no one to appeal to.
 *
 * Offered to any role — a shop owner may want it — but only *required* of
 * `platformAdmin`, and only once they have set it up.
 */

const ISSUER = 'Dawai';
const RECOVERY_CODE_COUNT = 8;

/**
 * One 30-second step either side, so a phone whose clock has drifted still
 * works. Wider than that starts giving a stolen code a useful lifetime.
 */
const EPOCH_TOLERANCE = 1;

/** otplib 13 returns a result object rather than a boolean. */
async function checkCode(secret: string, token: string) {
  const result = await verifyTotp({ secret, token, epochTolerance: EPOCH_TOLERANCE });
  return result.valid;
}

/** Recovery codes are stored hashed — they are passwords, and are used once. */
async function makeRecoveryCodes() {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-'),
  );
  const hashed = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
  return { plain, hashed };
}

/**
 * Begins setup: a secret and a QR code, not yet switched on.
 *
 * Enabling only happens once the operator has proved they can read a code from
 * it — turning it on at this point is how somebody locks themselves out with a
 * secret they never actually scanned.
 */
export async function beginTwoFactorSetup(userId: string) {
  const user = await UserModel.findById(userId).select('email twoFactorEnabled');
  if (!user) throw notFound('User');
  if (user.twoFactorEnabled) throw badRequest('Two-factor authentication is already on');

  const secret = generateSecret();
  user.set('twoFactorSecret', secret);
  await user.save();

  const uri = generateURI({ issuer: ISSUER, label: user.email, secret });
  return {
    secret,
    qrDataUrl: await QRCode.toDataURL(uri),
    /** Shown so an authenticator that cannot scan can still be set up by hand. */
    manualEntry: secret,
  };
}

export async function confirmTwoFactorSetup(userId: string, code: string) {
  const user = await UserModel.findById(userId).select('+twoFactorSecret twoFactorEnabled');
  if (!user) throw notFound('User');

  const secret = user.get('twoFactorSecret') as string;
  if (!secret) throw badRequest('Start setup first');
  if (!(await checkCode(secret, code.replace(/\s/g, '')))) {
    throw badRequest('That code is not right — check your authenticator and try again');
  }

  const { plain, hashed } = await makeRecoveryCodes();
  user.set('twoFactorEnabled', true);
  user.set('twoFactorRecoveryCodes', hashed);
  await user.save();

  logger.info({ userId }, 'Two-factor authentication enabled');

  // Shown once and never again — they are stored only as hashes.
  return { recoveryCodes: plain };
}

export async function disableTwoFactor(userId: string, code: string) {
  const user = await UserModel.findById(userId).select('+twoFactorSecret twoFactorEnabled');
  if (!user) throw notFound('User');
  if (!user.twoFactorEnabled) return;

  // Turning it off needs a code too. Otherwise a stolen session removes the
  // protection that session was supposed to be secondary to.
  if (!(await verifyCode(userId, code))) throw unauthorized('That code is not right');

  user.set('twoFactorEnabled', false);
  user.set('twoFactorSecret', '');
  user.set('twoFactorRecoveryCodes', []);
  await user.save();
  logger.warn({ userId }, 'Two-factor authentication disabled');
}

/**
 * Clears somebody's second factor for them: the phone is lost and so are the
 * recovery codes. Done by an operator, never by the person, because the person
 * cannot prove who they are without it. Their sessions end too, so whoever
 * holds the lost phone is not left signed in. An operator account is sent
 * straight to setup on the next sign-in; a shop account simply signs in with
 * the password again and can turn it back on.
 */
export async function resetTwoFactor(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound('User');
  user.set('twoFactorEnabled', false);
  user.set('twoFactorSecret', '');
  user.set('twoFactorRecoveryCodes', []);
  user.set('sessions', []);
  await user.save();
  logger.warn({ userId }, 'Two-factor authentication reset by an operator');
  return { id: String(user._id), email: user.email, name: user.name };
}

/**
 * Checks a code at sign-in — a TOTP, or one recovery code, used once.
 *
 * A spent recovery code is removed rather than marked, so there is no state to
 * get wrong: what is left in the list is exactly what still works.
 */
export async function verifyCode(userId: string, code: string): Promise<boolean> {
  const user = await UserModel.findById(userId).select(
    '+twoFactorSecret +twoFactorRecoveryCodes twoFactorEnabled',
  );
  if (!user) return false;

  const cleaned = code.replace(/\s/g, '');
  const secret = user.get('twoFactorSecret') as string;
  if (secret && (await checkCode(secret, cleaned))) return true;

  const codes = (user.get('twoFactorRecoveryCodes') as string[]) ?? [];
  for (let i = 0; i < codes.length; i++) {
    if (await bcrypt.compare(cleaned.toUpperCase(), codes[i])) {
      codes.splice(i, 1);
      user.set('twoFactorRecoveryCodes', codes);
      await user.save();
      logger.warn({ userId, remaining: codes.length }, 'Recovery code used');
      return true;
    }
  }
  return false;
}

export async function twoFactorStatus(userId: string) {
  const user = await UserModel.findById(userId)
    .select('+twoFactorRecoveryCodes twoFactorEnabled role')
    .lean();
  if (!user) throw notFound('User');

  return {
    enabled: Boolean(user.twoFactorEnabled),
    recoveryCodesLeft: ((user.twoFactorRecoveryCodes as string[]) ?? []).length,
    // Not enforced until it is set up: an operator who cannot sign in to switch
    // it on is an operator who cannot sign in.
    required: user.role === 'platformAdmin',
  };
}
