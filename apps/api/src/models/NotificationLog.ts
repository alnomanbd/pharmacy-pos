import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_CHANNEL, MESSAGE_STATUS, type NotificationChannel, type MessageStatus } from '../types/enums.js';

const schema = new Schema(
  {
    channel: { type: String, enum: NOTIFICATION_CHANNEL, required: true },
    to: { type: String, required: true },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    status: { type: String, enum: MESSAGE_STATUS, default: 'pending' },
    provider: { type: String, default: '' },
    raw: { type: Schema.Types.Mixed },
    related: {
      model: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId },
    },
  },
  { timestamps: true },
);

export type NotificationLog = InferSchemaType<typeof schema>;
export type NotificationLogDoc = HydratedDocument<NotificationLog>;
export type { NotificationChannel, MessageStatus };

export const NotificationLogModel = model('NotificationLog', schema);
