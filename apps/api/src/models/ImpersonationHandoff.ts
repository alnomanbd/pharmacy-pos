import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A one-time code that moves a support view from the operator console to the
 * shop app.
 *
 * The two are separate origins, so the console cannot put a token into the
 * shop app's memory. What it can do is open a URL there — and a URL is the
 * worst place to put a token, because it lands in browser history, in proxy
 * logs and in the `Referer` of the next request.
 *
 * So the URL carries this instead: a value that is worthless a minute later,
 * worthless a second time, and useless to anyone who cannot also reach the API.
 * Only its hash is stored, for the same reason a password reset token is hashed
 * — a leaked database should not be a pile of live credentials.
 */
const schema = new Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    operator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    expiresAt: { type: Date, required: true },
    /** Set by the claim, which is a compare-and-set: a second claim finds it taken. */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo removes the row once it expires, so neither used nor unused codes
// accumulate. A minute of life keeps this collection near empty.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ImpersonationHandoff = InferSchemaType<typeof schema>;
export type ImpersonationHandoffDoc = HydratedDocument<ImpersonationHandoff>;
export const ImpersonationHandoffModel = model('ImpersonationHandoff', schema);
