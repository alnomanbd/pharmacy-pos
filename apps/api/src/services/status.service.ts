import mongoose, { Schema, model, Types } from 'mongoose';
import { badRequest, notFound } from '../utils/AppError.js';

/**
 * The public status page: is Dawai working, and if not, what is being done.
 *
 * "Is it you or is it us?" is the first question of every outage, and without
 * a page that answers it, it is asked by phone, by every shop at once. The
 * operators write incidents in the console; the page shows each part of the
 * platform's state and the incidents of the last two weeks, in Bangla too.
 *
 * The database is checked live as well, so a dead database reads as an outage
 * on the page even before anybody has written an incident about it.
 */

export const STATUS_COMPONENTS = [
  { key: 'app', label: 'Shop app — billing, stock and accounts', labelBn: 'দোকানের অ্যাপ — বিল, স্টক আর হিসাব' },
  { key: 'payments', label: 'Online payments', labelBn: 'অনলাইন পেমেন্ট' },
  { key: 'messages', label: 'Email and SMS', labelBn: 'ইমেইল আর SMS' },
  { key: 'website', label: 'Website and sign-up', labelBn: 'ওয়েবসাইট আর সাইন আপ' },
] as const;
export type ComponentKey = (typeof STATUS_COMPONENTS)[number]['key'];

export const IMPACTS = ['degraded', 'outage', 'maintenance'] as const;
export type Impact = (typeof IMPACTS)[number];
export const INCIDENT_STATES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

const schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    titleBn: { type: String, default: '', trim: true, maxlength: 140 },
    /** The latest word on it — what is happening, what to do meanwhile. */
    body: { type: String, default: '', trim: true, maxlength: 1500 },
    bodyBn: { type: String, default: '', trim: true, maxlength: 1500 },
    components: { type: [String], default: ['app'] },
    impact: { type: String, enum: IMPACTS, default: 'degraded' },
    state: { type: String, enum: INCIDENT_STATES, default: 'investigating', index: true },
    startedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
schema.index({ startedAt: -1 });
export const IncidentModel = model('Incident', schema);

export type ComponentState = 'operational' | Impact;

/** Worst first: an outage outranks maintenance outranks slowness. */
const RANK: Record<ComponentState, number> = { operational: 0, degraded: 1, maintenance: 2, outage: 3 };

/** Each part's state from the open incidents, and the page's overall one. Pure, for the tests. */
export function componentStates(open: { components: string[]; impact: Impact }[], dbUp: boolean) {
  const states = Object.fromEntries(STATUS_COMPONENTS.map((c) => [c.key, 'operational'])) as Record<ComponentKey, ComponentState>;
  for (const i of open) {
    for (const k of i.components) {
      if (k in states && RANK[i.impact] > RANK[states[k as ComponentKey]]) states[k as ComponentKey] = i.impact;
    }
  }
  if (!dbUp) states.app = 'outage';
  const worst = Object.values(states).reduce<ComponentState>((w, s) => (RANK[s] > RANK[w] ? s : w), 'operational');
  return { states, overall: worst };
}

/** What the public page shows. No names, no internals — only what a shop needs. */
export async function publicStatus() {
  let dbUp = false;
  try {
    await mongoose.connection.db!.admin().ping();
    dbUp = true;
  } catch {
    dbUp = false;
  }
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const incidents = dbUp
    ? await IncidentModel.find({ $or: [{ state: { $ne: 'resolved' } }, { startedAt: { $gte: since } }] })
        .select('title titleBn body bodyBn components impact state startedAt resolvedAt updatedAt')
        .sort({ startedAt: -1 })
        .limit(30)
        .lean()
    : [];
  const open = incidents.filter((i) => i.state !== 'resolved');
  const { states, overall } = componentStates(open as { components: string[]; impact: Impact }[], dbUp);
  return {
    overall,
    components: STATUS_COMPONENTS.map((c) => ({ ...c, state: states[c.key] })),
    open,
    recent: incidents.filter((i) => i.state === 'resolved'),
    checkedAt: new Date(),
  };
}

/* ------------------------------------------------------------- console -- */

export interface IncidentInput {
  title: string;
  titleBn?: string;
  body?: string;
  bodyBn?: string;
  components?: string[];
  impact?: Impact;
  state?: IncidentState;
}

const cleanComponents = (c?: string[]) => {
  if (!c) return undefined;
  const ok = c.filter((k) => STATUS_COMPONENTS.some((x) => x.key === k));
  if (!ok.length) throw badRequest('Pick at least one part of the platform it affects');
  return [...new Set(ok)];
};

export async function listIncidents() {
  return IncidentModel.find({}).sort({ startedAt: -1 }).limit(100).lean();
}

export async function createIncident(input: IncidentInput, userId: string) {
  const state = input.state ?? 'investigating';
  return (
    await IncidentModel.create({
      ...input,
      components: cleanComponents(input.components) ?? ['app'],
      state,
      resolvedAt: state === 'resolved' ? new Date() : null,
      createdBy: userId,
    })
  ).toObject();
}

export async function updateIncident(id: string, input: Partial<IncidentInput>) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Incident');
  const i = await IncidentModel.findById(id);
  if (!i) throw notFound('Incident');
  const { components, ...rest } = input;
  i.set(rest);
  if (components) i.set('components', cleanComponents(components));
  if (input.state) i.set('resolvedAt', input.state === 'resolved' ? i.resolvedAt ?? new Date() : null);
  await i.save();
  return i.toObject();
}
