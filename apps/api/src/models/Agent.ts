import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A field agent who signs pharmacies up — the way medicine-shop software
 * actually sells in Bangladesh: somebody who knows every shop on the street,
 * walks in, and sets it up on the spot.
 *
 * An agent has a code. A shop that signs up through the agent's link
 * (`/register?agent=RAHIM`), or that an operator assigns to the agent, earns the
 * agent `commissionPercent` of every payment that shop makes, for as long as it
 * pays. Each commission is a line in `AgentCommission`, owed until paid out.
 */
const agentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** What goes on the link and what sign-up records. Upper case, letters, digits and dashes. */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 200 },
    /** Where they work: "Mirpur 10", "Chattogram — Agrabad". */
    area: { type: String, default: '', trim: true, maxlength: 120 },
    commissionPercent: { type: Number, required: true, min: 0, max: 50 },
    /** Paid out how: "bKash 017…". For whoever pays them. */
    payoutNote: { type: String, default: '', trim: true, maxlength: 200 },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type Agent = InferSchemaType<typeof agentSchema>;
export type AgentDoc = HydratedDocument<Agent>;
export const AgentModel = model('Agent', agentSchema);

/**
 * One commission an agent earned on one accepted payment.
 *
 * The percentage is copied at the time, so changing an agent's rate later does
 * not rewrite what they were already owed. One line per payment, enforced, so a
 * payment accepted twice by a retry is never paid twice.
 */
const commissionSchema = new Schema(
  {
    agent: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    paymentAmount: { type: Number, required: true },
    percent: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['owed', 'paid'], default: 'owed', index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** The payout's own reference: "bKash TRX 8N7A…", "cash, receipt 41". */
    payoutRef: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { timestamps: true },
);

commissionSchema.index({ agent: 1, status: 1, createdAt: -1 });

export type AgentCommission = InferSchemaType<typeof commissionSchema>;
export const AgentCommissionModel = model('AgentCommission', commissionSchema);
