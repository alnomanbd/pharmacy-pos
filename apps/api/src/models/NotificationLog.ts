import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_CHANNEL, MESSAGE_STATUS, type NotificationChannel, type MessageStatus } from '../types/enums.js';

/**
 * Every email and SMS the platform tried to send, and whether it went.
 *
 * The question it answers is "I never got the reset email": was it sent, to
 * which address, and did the provider take it. Written by `sendEmail` and
 * `sendSms` themselves, so nothing that sends can forget to log.
 *
 * What is *not* kept matters as much: an email's body is never stored (reset
 * and verify links are live credentials), only its subject, and an SMS body is
 * stored with codes and links masked. Rows expire after 180 days.
 */
const schema = new Schema(
  {
    channel: { type: String, enum: NOTIFICATION_CHANNEL, required: true },
    to: { type: String, required: true, index: true },
    subject: { type: String, default: '' },
    /** SMS only, masked. Never an email body. */
    body: { type: String, default: '' },
    status: { type: String, enum: MESSAGE_STATUS, default: 'pending', index: true },
    /** `log` means nothing was configured, so the message was written to the log rather than sent. */
    provider: { type: String, default: '' },
    /** What it was: `passwordReset`, `paymentVerified`, `remind.renewal`… */
    kind: { type: String, default: '', index: true },
    /** The shop it was about, when the sender knew. */
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    /** The provider's id for the message, for chasing it with them. */
    providerId: { type: String, default: '' },
    raw: { type: Schema.Types.Mixed },
    related: {
      model: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId },
    },
  },
  { timestamps: true },
);

// Serves the newest-first list as well as the expiry.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export type NotificationLog = InferSchemaType<typeof schema>;
export type NotificationLogDoc = HydratedDocument<NotificationLog>;
export type { NotificationChannel, MessageStatus };

export const NotificationLogModel = model('NotificationLog', schema);
