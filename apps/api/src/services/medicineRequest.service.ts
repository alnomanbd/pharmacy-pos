import { Types } from 'mongoose';
import {
  MedicineModel,
  MedicineRequestModel,
  UserModel,
  MEDICINE_REQUEST_STATUS,
  type MedicineRequestStatus,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { createMedicine, pageWindow, type CatalogueMedicine } from './catalogue.service.js';
import * as notify from './notification.service.js';
import type { ApproveRequestInput, MedicineRequestInput } from '../validators/catalogue.validator.js';

/**
 * The bridge between a shop that cannot find a brand and the catalogue that
 * does not have it yet.
 *
 * Shops cannot write the shared catalogue — one wrong edit would reach every
 * shop on the deployment — so the gap is raised here instead of being lost.
 */

/** How many unanswered requests one shop may have at a time. */
export const MAX_PENDING_PER_SHOP = 30;

export const DUPLICATE_REQUEST = 'You have already asked for this one';

/* Spacing and case are how the same strip gets typed twice: "Napa 500mg", "napa 500 mg". */
const norm = (v?: string | null) => (v ?? '').toLowerCase().replace(/\s+/g, '');

/** Whether two requests from one shop are asking for the same thing. */
export function sameRequest(
  a: { brandName: string; strength?: string | null },
  b: { brandName: string; strength?: string | null },
) {
  return norm(a.brandName) === norm(b.brandName) && norm(a.strength) === norm(b.strength);
}

export function pendingCapMessage(pending: number): string | null {
  return pending >= MAX_PENDING_PER_SHOP
    ? `You have ${MAX_PENDING_PER_SHOP} requests waiting already — we will answer those first`
    : null;
}

export const isRequestStatus = (v: unknown): v is MedicineRequestStatus =>
  typeof v === 'string' && (MEDICINE_REQUEST_STATUS as readonly string[]).includes(v);

const POPULATE_MEDICINE = { path: 'medicine', select: 'brandName strength dosageForm' };
const POPULATE_REQUESTER = { path: 'requestedBy', select: 'name' };
const POPULATE_SHOP = { path: 'organization', select: 'name' };

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Request');
  return new Types.ObjectId(id);
}

/* ------------------------------------------------------------- the shop -- */

export async function createRequest(
  actor: { org: string; id: string },
  input: MedicineRequestInput,
) {
  const brandName = input.brandName.trim();
  const strength = input.strength?.trim() ?? '';

  // At most thirty, so reading them all and comparing here is cheaper than
  // building a regex, and the comparison is the one the tests pin.
  const pending = await MedicineRequestModel.find({ organization: actor.org, status: 'pending' })
    .select('brandName strength')
    .lean();
  if (pending.some((p) => sameRequest(p, { brandName, strength }))) {
    throw badRequest(DUPLICATE_REQUEST);
  }
  const cap = pendingCapMessage(pending.length);
  if (cap) throw badRequest(cap);

  const doc = await MedicineRequestModel.create({
    organization: actor.org,
    requestedBy: actor.id,
    brandName,
    genericName: input.genericName?.trim() ?? '',
    companyName: input.companyName?.trim() ?? '',
    strength,
    dosageForm: input.dosageForm?.trim() ?? '',
    packSize: input.packSize?.trim() ?? '',
    note: input.note?.trim() ?? '',
  });
  return MedicineRequestModel.findById(doc._id)
    .populate(POPULATE_REQUESTER)
    .populate(POPULATE_MEDICINE)
    .lean();
}

/** What this shop has asked for — so the pharmacist can see it was not swallowed. */
export async function listOwnRequests(orgId: string) {
  return MedicineRequestModel.find({ organization: orgId })
    .populate(POPULATE_REQUESTER)
    .populate(POPULATE_MEDICINE)
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

/**
 * Takes back a request nobody has answered yet.
 *
 * The shop's owner or pharmacist may withdraw any of the shop's requests; a
 * salesman only the ones they raised. An answered request stays, because it
 * is the record of what the catalogue team decided.
 */
export async function withdrawRequest(
  actor: { org: string; id: string; canManage: boolean },
  id: string,
) {
  const request = await MedicineRequestModel.findOne({ _id: oid(id), organization: actor.org });
  if (!request) throw notFound('Request');
  if (!actor.canManage && String(request.requestedBy) !== actor.id) {
    throw badRequest('Only the person who asked, or the owner, can withdraw this');
  }
  if (request.status !== 'pending') {
    throw badRequest('This request has already been answered and cannot be withdrawn');
  }
  await MedicineRequestModel.deleteOne({ _id: request._id });
  return { id: String(request._id), deleted: true as const };
}

/* ---------------------------------------------------------- the console -- */

export async function listRequests(opts: { status?: string; page?: number; limit?: number }) {
  const { page, limit, skip } = pageWindow(opts);
  const filter: Record<string, unknown> = {};
  if (opts.status !== undefined) {
    if (!isRequestStatus(opts.status)) throw badRequest('Unknown status');
    filter.status = opts.status;
  }

  const [data, total] = await Promise.all([
    MedicineRequestModel.find(filter)
      .populate(POPULATE_SHOP)
      .populate(POPULATE_REQUESTER)
      .populate(POPULATE_MEDICINE)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MedicineRequestModel.countDocuments(filter),
  ]);
  return { data, total, page, limit };
}

async function pendingRequest(id: string) {
  const request = await MedicineRequestModel.findById(oid(id)).lean();
  if (!request) throw notFound('Request');
  if (request.status !== 'pending') throw badRequest(`This request is already ${request.status}`);
  return request;
}

async function loadForConsole(id: Types.ObjectId) {
  return MedicineRequestModel.findById(id)
    .populate(POPULATE_SHOP)
    .populate(POPULATE_REQUESTER)
    .populate(POPULATE_MEDICINE)
    .lean();
}

/** Best effort: a decision must not fail because the mail server is down. */
async function tellRequester(
  request: { requestedBy?: unknown; brandName: string },
  added: boolean,
  reason?: string,
) {
  try {
    if (!request.requestedBy) return;
    const user = await UserModel.findById(request.requestedBy).select('name email').lean();
    if (!user?.email) return;
    void notify.medicineRequestDecided({
      email: user.email,
      name: user.name,
      brandName: request.brandName,
      added,
      reason,
    });
  } catch (err) {
    logger.warn({ err }, 'Could not tell the shop about its medicine request');
  }
}

/**
 * Answers a request by linking it to a catalogue row — one that exists, or one
 * created here through the same `createMedicine` the catalogue page uses, so a
 * request cannot sneak a duplicate past the rule that page enforces.
 *
 * The decision is written only if the request is still pending at that moment,
 * so two operators answering the same request cannot both win.
 */
export async function approveRequest(id: string, reviewerId: string, input: ApproveRequestInput) {
  const request = await pendingRequest(id);

  let medicineId: Types.ObjectId;
  let created: CatalogueMedicine | null = null;
  if ('medicineId' in input) {
    const existing = await MedicineModel.findById(input.medicineId).select('_id').lean();
    if (!existing) throw notFound('Medicine');
    medicineId = existing._id as Types.ObjectId;
  } else {
    created = await createMedicine(input.medicine);
    medicineId = new Types.ObjectId(created._id);
  }

  const updated = await MedicineRequestModel.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    {
      $set: {
        status: 'added',
        medicine: medicineId,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: '',
      },
    },
  );
  if (!updated) throw badRequest('Somebody else answered this request a moment ago');

  void tellRequester(request, true);
  return { request: await loadForConsole(request._id as Types.ObjectId), created };
}

export async function rejectRequest(id: string, reviewerId: string, reason: string) {
  const request = await pendingRequest(id);
  const updated = await MedicineRequestModel.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: reason.trim(),
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    },
  );
  if (!updated) throw badRequest('Somebody else answered this request a moment ago');

  void tellRequester(request, false, reason.trim());
  return loadForConsole(request._id as Types.ObjectId);
}

export const pendingCount = () => MedicineRequestModel.countDocuments({ status: 'pending' });
