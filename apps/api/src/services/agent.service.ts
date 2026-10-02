import { Types } from 'mongoose';
import { AgentModel, AgentCommissionModel, OrganizationModel, PaymentModel } from '../models/index.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Agents, the shops they bring in, and what they are owed — see `models/Agent.ts`.
 */

export const AGENT_CODE_RX = /^[A-Z0-9-]{3,24}$/;
export const normaliseAgentCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

/** What an agent earns on a payment, to the whole taka. Pure, for the tests. */
export function commissionOn(paymentAmount: number, percent: number) {
  if (!(paymentAmount > 0) || !(percent > 0)) return 0;
  return Math.round((paymentAmount * Math.min(50, percent)) / 100);
}

/**
 * Records an agent's commission on an accepted payment, if the shop came
 * through an active agent. Called from `acceptPayment`; never throws there — a
 * commission that fails to record must not undo a renewal, so it is logged.
 */
export async function accrueCommission(payment: { _id: unknown; amount: number; organization: unknown }) {
  try {
    const org = await OrganizationModel.findById(payment.organization).select('acquisition.agentCode').lean();
    const code = normaliseAgentCode(org?.acquisition?.agentCode ?? '');
    if (!code) return null;
    const agent = await AgentModel.findOne({ code, active: true }).lean();
    if (!agent) return null;
    const amount = commissionOn(payment.amount, agent.commissionPercent);
    if (amount <= 0) return null;
    // Upsert on the payment: a retried acceptance finds the line already there.
    return await AgentCommissionModel.findOneAndUpdate(
      { payment: payment._id },
      {
        $setOnInsert: {
          agent: agent._id,
          organization: payment.organization,
          payment: payment._id,
          paymentAmount: payment.amount,
          percent: agent.commissionPercent,
          amount,
        },
      },
      { upsert: true, new: true },
    ).lean();
  } catch (err) {
    logger.error({ err, payment: String(payment._id) }, 'Could not record an agent commission');
    return null;
  }
}

export interface AgentInput {
  name: string;
  code: string;
  phone?: string;
  email?: string;
  area?: string;
  commissionPercent: number;
  payoutNote?: string;
  active?: boolean;
}

/** Every agent with their shops, paying shops, and what is owed and paid. */
export async function listAgents() {
  const agents = await AgentModel.find({}).sort({ active: -1, name: 1 }).lean();
  const codes = agents.map((a) => a.code);
  const [shops, totals] = await Promise.all([
    OrganizationModel.aggregate<{ _id: string; shops: number; ids: Types.ObjectId[] }>([
      { $match: { 'acquisition.agentCode': { $in: codes } } },
      { $group: { _id: '$acquisition.agentCode', shops: { $sum: 1 }, ids: { $push: '$_id' } } },
    ]),
    AgentCommissionModel.aggregate<{ _id: { agent: unknown; status: string }; total: number }>([
      { $group: { _id: { agent: '$agent', status: '$status' }, total: { $sum: '$amount' } } },
    ]),
  ]);
  const paying = new Set(
    (await PaymentModel.distinct('organization', { status: 'verified', organization: { $in: shops.flatMap((s) => s.ids) } })).map(String),
  );
  const shopsOf = new Map(shops.map((s) => [s._id, s]));
  const sum = (agentId: unknown, status: string) =>
    totals.find((t) => String(t._id.agent) === String(agentId) && t._id.status === status)?.total ?? 0;
  return agents.map((a) => {
    const s = shopsOf.get(a.code);
    return {
      ...a,
      shops: s?.shops ?? 0,
      payingShops: s ? s.ids.filter((id) => paying.has(String(id))).length : 0,
      owed: sum(a._id, 'owed'),
      paid: sum(a._id, 'paid'),
    };
  });
}

export async function createAgent(input: AgentInput, authorId: string) {
  const code = normaliseAgentCode(input.code);
  if (!AGENT_CODE_RX.test(code)) throw badRequest('A code is 3 to 24 letters, digits or dashes');
  if (await AgentModel.exists({ code })) throw conflict('Another agent already has that code');
  return (await AgentModel.create({ ...input, code, createdBy: authorId })).toObject();
}

/** Everything but the code, which shops' sign-ups refer to. */
export async function updateAgent(id: string, input: Partial<Omit<AgentInput, 'code'>>) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Agent');
  const a = await AgentModel.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
  if (!a) throw notFound('Agent');
  return a;
}

/** One agent: their shops and every commission line, newest first. */
export async function agentDetail(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Agent');
  const agent = await AgentModel.findById(id).lean();
  if (!agent) throw notFound('Agent');
  const [shops, commissions] = await Promise.all([
    OrganizationModel.find({ 'acquisition.agentCode': agent.code })
      .select('name status plan createdAt trialEndsAt')
      .sort({ createdAt: -1 })
      .lean(),
    AgentCommissionModel.find({ agent: agent._id })
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);
  return { agent, shops, commissions };
}

/** Marks owed lines paid, with the payout's reference. Lines already paid are left alone. */
export async function markPaid(agentId: string, ids: string[], operatorId: string, payoutRef: string) {
  if (!Types.ObjectId.isValid(agentId)) throw notFound('Agent');
  const valid = ids.filter((x) => Types.ObjectId.isValid(x));
  if (!valid.length) throw badRequest('Pick what was paid');
  const res = await AgentCommissionModel.updateMany(
    { _id: { $in: valid }, agent: agentId, status: 'owed' },
    { $set: { status: 'paid', paidAt: new Date(), paidBy: operatorId, payoutRef: payoutRef.trim() } },
  );
  const lines = await AgentCommissionModel.find({ _id: { $in: valid }, agent: agentId }).select('amount status').lean();
  return { marked: res.modifiedCount, total: lines.filter((l) => l.status === 'paid').reduce((a, l) => a + l.amount, 0) };
}

/** Puts a shop under an agent by hand (it signed up over the phone), or takes it out. */
export async function assignShop(orgId: string, code: string | null) {
  if (!Types.ObjectId.isValid(orgId)) throw notFound('Shop');
  const normal = code ? normaliseAgentCode(code) : '';
  if (normal && !(await AgentModel.exists({ code: normal }))) throw badRequest('No agent has that code');
  const org = await OrganizationModel.findByIdAndUpdate(orgId, { $set: { 'acquisition.agentCode': normal } }, { new: true })
    .select('name acquisition.agentCode')
    .lean();
  if (!org) throw notFound('Shop');
  return org;
}
