import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A conversation between a shop and the people who run Dawai.
 *
 * One thread per issue rather than one per shop: a payment question in March
 * and a printer problem in April should not be one endless transcript, and
 * closing a thread is how anything gets off the support queue.
 *
 * The unread counts are stored rather than derived. Deriving them means
 * counting messages against a per-side watermark on every list request, and
 * this list is polled — by the badge in the nav, on every page.
 */
export const SUPPORT_SIDES = ['shop', 'platform'] as const;
export type SupportSide = (typeof SUPPORT_SIDES)[number];

const threadSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Who at the shop opened it. */
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },

    /** Denormalised for the list: a thread row shows its last line. */
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '' },
    lastMessageFrom: { type: String, enum: SUPPORT_SIDES, default: 'shop' },

    /** Waiting to be read by the other side. Reset when that side opens it. */
    unreadForPlatform: { type: Number, default: 0 },
    unreadForShop: { type: Number, default: 0 },

    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

threadSchema.index({ status: 1, lastMessageAt: -1 });
threadSchema.index({ organization: 1, lastMessageAt: -1 });

export type SupportThread = InferSchemaType<typeof threadSchema>;
export type SupportThreadDoc = HydratedDocument<SupportThread>;
export const SupportThreadModel = model('SupportThread', threadSchema);

/**
 * One message.
 *
 * `side` rather than a role lookup: what matters when reading a transcript is
 * whether this line came from the shop or from support, and that must stay
 * true even after the person who wrote it has left either organisation.
 */
const messageSchema = new Schema(
  {
    thread: { type: Schema.Types.ObjectId, ref: 'SupportThread', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    side: { type: String, enum: SUPPORT_SIDES, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Kept as written at the time — an account can be renamed or removed. */
    authorName: { type: String, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true },
);

messageSchema.index({ thread: 1, createdAt: 1 });

export type SupportMessage = InferSchemaType<typeof messageSchema>;
export type SupportMessageDoc = HydratedDocument<SupportMessage>;
export const SupportMessageModel = model('SupportMessage', messageSchema);
