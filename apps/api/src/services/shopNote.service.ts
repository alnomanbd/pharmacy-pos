import { Types } from 'mongoose';
import { ShopNoteModel, OrganizationModel, UserModel } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';

/**
 * The team's notes on a shop, and the follow-ups they carry.
 *
 * Anyone who can see a shop can write a note on it and tick a follow-up done —
 * the person on the phone is the person who knows. Rewriting or deleting a note
 * is for its author, or the platform owner: a note is a record of what was
 * said, and somebody else's record is not yours to edit.
 */

const valid = (id: string, what: string) => {
  if (!Types.ObjectId.isValid(id)) throw notFound(what);
  return id;
};

/** End of the given day in local time: a follow-up "for today" is due all day. */
export function endOfDay(d = new Date()) {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

export async function listNotes(orgId: string) {
  valid(orgId, 'Shop');
  return ShopNoteModel.find({ organization: orgId }).sort({ pinned: -1, createdAt: -1 }).limit(200).lean();
}

export async function addNote(
  orgId: string,
  authorId: string,
  input: { body: string; followUpAt?: string | null; pinned?: boolean },
) {
  valid(orgId, 'Shop');
  const body = input.body.trim();
  if (!body) throw badRequest('Write the note first');
  if (!(await OrganizationModel.exists({ _id: orgId }))) throw notFound('Shop');
  const author = await UserModel.findById(authorId).select('name').lean();
  const note = await ShopNoteModel.create({
    organization: orgId,
    author: authorId,
    authorName: author?.name ?? '',
    body,
    pinned: Boolean(input.pinned),
    followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
  });
  return note.toObject();
}

export async function updateNote(
  orgId: string,
  noteId: string,
  actor: { id: string; isOwner: boolean },
  input: { body?: string; followUpAt?: string | null; pinned?: boolean; done?: boolean },
) {
  const note = await ShopNoteModel.findOne({ _id: valid(noteId, 'Note'), organization: valid(orgId, 'Shop') });
  if (!note) throw notFound('Note');

  const mine = String(note.author) === actor.id || actor.isOwner;
  if ((input.body !== undefined || input.followUpAt !== undefined) && !mine) {
    throw forbidden('Only whoever wrote this note can change what it says');
  }

  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw badRequest('A note cannot be empty');
    note.set('body', body);
  }
  if (input.followUpAt !== undefined) note.set('followUpAt', input.followUpAt ? new Date(input.followUpAt) : null);
  if (input.pinned !== undefined) note.set('pinned', input.pinned);
  if (input.done !== undefined) {
    note.set('doneAt', input.done ? new Date() : null);
    note.set('doneBy', input.done ? actor.id : null);
  }
  await note.save();
  return note.toObject();
}

export async function deleteNote(orgId: string, noteId: string, actor: { id: string; isOwner: boolean }) {
  const note = await ShopNoteModel.findOne({ _id: valid(noteId, 'Note'), organization: valid(orgId, 'Shop') });
  if (!note) throw notFound('Note');
  if (String(note.author) !== actor.id && !actor.isOwner) throw forbidden('Only whoever wrote this note can delete it');
  await note.deleteOne();
  return { deleted: true };
}

/** Follow-ups due by the end of today and not yet done, oldest first — for the bell and the overview. */
export async function dueFollowUps(limit = 20) {
  const filter = { followUpAt: { $ne: null, $lte: endOfDay() }, doneAt: null };
  const [rows, total] = await Promise.all([
    ShopNoteModel.find(filter)
      .populate('organization', 'name')
      .sort({ followUpAt: 1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean(),
    ShopNoteModel.countDocuments(filter),
  ]);
  return { data: rows, total };
}
