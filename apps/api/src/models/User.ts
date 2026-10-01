import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '../types/enums.js';

/**
 * Someone who signs in: a shop's owner, pharmacist or salesman, or a member of
 * the Dawai operator team (no shop of their own).
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    role: { type: String, enum: ROLES, default: 'salesman' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    /** Storage key, not a URL — served through /api/files. See storage.service.ts. */
    photo: { type: String, default: '' },

    /**
     * One entry per signed-in device. The hash is the credential; the rest is
     * what makes a session something a person can recognise and revoke. A
     * refresh rotates the hash in place — the same device continuing.
     */
    sessions: {
      type: [
        new Schema(
          {
            tokenHash: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            lastSeenAt: { type: Date, default: Date.now },
            ip: { type: String, default: '' },
            userAgent: { type: String, default: '' },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    /**
     * Consecutive failed sign-ins, and when this account stops refusing them.
     * Per account rather than per address, because credential stuffing comes
     * from a thousand addresses. Never selected outside the login path.
     */
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    /** Password reset: only the SHA-256 of the emailed token is stored. */
    passwordResetTokenHash: { type: String, default: '', select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    /** Email verification, stored the same way. */
    emailVerifyTokenHash: { type: String, default: '', select: false },
    emailVerifyExpiresAt: { type: Date, default: null, select: false },
    /**
     * What a platform staff member may do. Empty for everyone else —
     * `platformAdmin` holds everything implicitly.
     */
    permissions: { type: [String], default: [] },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: '', select: false },
    /** bcrypt hashes. Each is usable once and is deleted when it is used. */
    twoFactorRecoveryCodes: { type: [String], default: [], select: false },
    /** When the terms and privacy policy were accepted, and which version. */
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    /** Soft-delete tombstone; when set the account sits in the shop's trash. */
    deletedAt: { type: Date, default: null },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

schema.index({ organization: 1 });
schema.index({ phone: 1 }, { unique: true });

export type User = InferSchemaType<typeof schema>;
export type UserDoc = HydratedDocument<User>;

export const UserModel = model('User', schema);
export type { Role };
