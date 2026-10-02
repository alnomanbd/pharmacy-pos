import { Types } from 'mongoose';
import { AnnouncementModel, OrganizationModel, UserModel } from '../models/index.js';
import type { AnnouncementTone } from '../models/Announcement.js';
import { badRequest, notFound } from '../utils/AppError.js';

/**
 * Announcements from the team to shops — see `models/Announcement.ts`.
 */

export interface AnnouncementInput {
  title: string;
  body?: string;
  titleBn?: string;
  bodyBn?: string;
  tone?: AnnouncementTone;
  plans?: string[];
  linkLabel?: string;
  linkUrl?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
  dismissible?: boolean;
}

export type AnnouncementState = 'live' | 'scheduled' | 'ended' | 'off';

/** Where an announcement stands right now. Pure, for the console's label and the tests. */
export function stateOf(
  a: { active?: boolean | null; startsAt?: Date | null; endsAt?: Date | null },
  now = new Date(),
): AnnouncementState {
  if (!a.active) return 'off';
  if (a.endsAt && a.endsAt.getTime() <= now.getTime()) return 'ended';
  if (a.startsAt && a.startsAt.getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

/** Whether a shop on `plan` is in an announcement's audience. Empty means everybody. */
export function isFor(a: { plans?: string[] | null }, plan: string) {
  return !a.plans?.length || a.plans.includes(plan);
}

function clean(input: Partial<AnnouncementInput>) {
  const out: Record<string, unknown> = {};
  for (const k of ['title', 'body', 'titleBn', 'bodyBn', 'linkLabel', 'linkUrl'] as const) {
    if (input[k] !== undefined) out[k] = String(input[k] ?? '').trim();
  }
  if (input.tone !== undefined) out.tone = input.tone;
  if (input.plans !== undefined) out.plans = [...new Set(input.plans.map((p) => p.trim()).filter(Boolean))];
  if (input.active !== undefined) out.active = input.active;
  if (input.dismissible !== undefined) out.dismissible = input.dismissible;
  if (input.startsAt !== undefined) out.startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  if (input.endsAt !== undefined) out.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (out.linkUrl && !/^https?:\/\//i.test(String(out.linkUrl)) && !String(out.linkUrl).startsWith('/')) {
    throw badRequest('The link has to start with https:// or with /');
  }
  if (out.linkLabel && !out.linkUrl) throw badRequest('A button needs a link');
  return out;
}

function checkWindow(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest('It has to end after it starts');
}

export async function listAll() {
  const rows = await AnnouncementModel.find({}).sort({ createdAt: -1 }).limit(200).lean();
  const now = new Date();
  return rows.map((r) => ({ ...r, state: stateOf(r, now) }));
}

export async function create(input: AnnouncementInput, authorId: string) {
  const data = clean(input);
  if (!data.title) throw badRequest('Give it a title');
  checkWindow(data.startsAt as Date | undefined, data.endsAt as Date | null | undefined);
  const author = await UserModel.findById(authorId).select('name').lean();
  const a = await AnnouncementModel.create({ ...data, createdBy: authorId, createdByName: author?.name ?? '' });
  return { ...a.toObject(), state: stateOf(a) };
}

export async function update(id: string, input: Partial<AnnouncementInput>) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Announcement');
  const a = await AnnouncementModel.findById(id);
  if (!a) throw notFound('Announcement');
  const data = clean(input);
  if (data.title !== undefined && !data.title) throw badRequest('Give it a title');
  a.set(data);
  checkWindow(a.startsAt, a.endsAt);
  await a.save();
  return { ...a.toObject(), state: stateOf(a) };
}

export async function remove(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Announcement');
  const a = await AnnouncementModel.findByIdAndDelete(id).lean();
  if (!a) throw notFound('Announcement');
  return { deleted: true, title: a.title };
}

/** What one shop should see now: live, and for its plan. Newest first, at most five. */
export async function forShop(orgId: string) {
  const org = await OrganizationModel.findById(orgId).select('plan').lean();
  if (!org) return [];
  const now = new Date();
  const rows = await AnnouncementModel.find({
    active: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
  })
    .select('title body titleBn bodyBn tone plans linkLabel linkUrl dismissible startsAt endsAt updatedAt')
    .sort({ startsAt: -1 })
    .limit(20)
    .lean();
  return rows.filter((r) => isFor(r, org.plan)).slice(0, 5);
}
