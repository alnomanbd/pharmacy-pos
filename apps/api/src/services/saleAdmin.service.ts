import { Types } from 'mongoose';
import {
  SaleModel,
  ShiftModel,
  StockBatchModel,
  StockLedgerModel,
  ShopCustomerModel,
  CustomerLedgerModel,
  type SaleDoc,
} from '../models/index.js';
import { assertMonthOpen } from './shopCash.service.js';
import { badRequest, notFound, forbidden } from '../utils/AppError.js';
import { recordAudit } from './audit.service.js';
import type { Actor } from './shop.service.js';

/**
 * Changing a bill after it has been rung up.
 *
 * The most dangerous thing in the shop, and the reason it is its own file.
 *
 * Two rules hold everything here together:
 *
 * 1. **A bill is never deleted.** Cancelling one sets it to `void`, puts the
 *    stock back and reverses the money — but the row stays, because the number
 *    was printed on a customer's slip and the register has to be able to explain
 *    it. A bill that vanishes is indistinguishable from a bill that was stolen.
 * 2. **Nothing happens without a reason and a name.** Every edit and every void
 *    writes a row on the bill's own history and an entry in the audit trail, so
 *    the owner's real question — *which salesman changed this, and what did they
 *    say the reason was* — has an answer at both ends.
 *
 * Who may do it is decided by the route, but the rule is worth writing down:
 * whoever runs the shop may edit or void anything; a salesman may void their
 * own mistake, on their own open shift, within the hour. That last one is not
 * generosity — a counter that cannot undo a mis-punch will undo it by handing
 * cash back and not telling anybody.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

const money = (n: number) => Math.round(n * 100) / 100;

/** How long a salesman's own mistake stays their own to undo. */
export const SALESMAN_VOID_MINUTES = 60;

/**
 * Whether this person may cancel this bill.
 *
 * Pure, so the rule can be read and tested without a database: the route hands
 * it the facts and gets back a yes, or the reason for the no.
 */
export function mayVoid(
  sale: { salesman: unknown; soldAt: Date | string; status: string; shift?: unknown },
  actor: { id: string; runsTheShop: boolean },
  openShiftId: string | null,
  now = new Date(),
): { ok: true } | { ok: false; why: string } {
  if (sale.status === 'void') return { ok: false, why: 'That bill is already cancelled' };
  if (actor.runsTheShop) return { ok: true };

  if (String(sale.salesman) !== actor.id) {
    return { ok: false, why: 'Only the owner can cancel somebody else’s bill' };
  }
  if (!openShiftId || String(sale.shift ?? '') !== openShiftId) {
    return { ok: false, why: 'That bill belongs to a day whose cash has already been counted' };
  }
  const minutes = (now.getTime() - new Date(sale.soldAt).getTime()) / 60_000;
  if (minutes > SALESMAN_VOID_MINUTES) {
    return { ok: false, why: `After ${SALESMAN_VOID_MINUTES} minutes only the owner can cancel it` };
  }
  return { ok: true };
}

/**
 * Puts everything a bill did back the way it was.
 *
 * Stock to the lots it came out of, the customer's account to what it was, and
 * the shift's takings down by what this bill added — but only while that shift
 * is still open. A closed shift has been counted against the cash in the box,
 * and quietly moving its total afterwards would make an honest count look wrong.
 */
async function unapply(sale: SaleDoc, actor: Actor, move: 'sale_void', reason: string) {
  for (const line of sale.lines) {
    const back = line.qtyPieces - (line.returnedPieces ?? 0);
    if (back <= 0 || !line.batch) continue;

    const batch = await StockBatchModel.findById(line.batch);
    if (!batch) continue;
    batch.qtyOnHand += back;
    await batch.save();

    await StockLedgerModel.create({
      organization: actor.org,
      product: line.product,
      batch: batch._id,
      move,
      qtyDelta: back,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: line.costPerPiece,
      ref: { model: 'Sale', id: sale._id },
      reason,
      actor: actor.id,
      actorName: actor.name,
    });
  }

  if (sale.customer && sale.due > 0) {
    const customer = await ShopCustomerModel.findOne({
      _id: sale.customer,
      organization: actor.org,
    });
    if (customer) {
      const balance = money((customer.balance ?? 0) - sale.due);
      customer.balance = balance;
      await customer.save();
      await CustomerLedgerModel.create({
        organization: actor.org,
        customer: customer._id,
        entry: 'adjustment',
        amount: -sale.due,
        balanceAfter: balance,
        reference: sale.billNo,
        note: reason,
        ref: { model: 'Sale', id: sale._id },
        actor: actor.id,
        actorName: actor.name,
      });
    }
  }

  let shiftTouched = false;
  if (sale.shift) {
    const shift = await ShiftModel.findOne({ _id: sale.shift, organization: actor.org });
    if (shift && !shift.closedAt) {
      const cash = (sale.payments ?? [])
        .filter((p) => p.method === 'cash')
        .reduce((n, p) => n + p.amount, 0);
      await ShiftModel.updateOne(
        { _id: shift._id },
        {
          $inc: {
            salesCount: -1,
            salesTotal: -sale.total,
            cashTaken: -cash,
            digitalTaken: -(sale.paid - cash),
            dueGiven: -sale.due,
            expectedCash: -cash,
          },
        },
      );
      shiftTouched = true;
    }
  }

  return { shiftTouched };
}

/**
 * Does again everything the bill did, after it was cancelled.
 *
 * The mirror of `unapply`, and the reason a cancel is not the end of the road:
 * somebody cancels the wrong bill at a busy counter roughly as often as they
 * ring up the wrong one, and a shop with no way back has to re-key the whole
 * thing under a new number that the customer's slip does not match.
 *
 * The stock goes back off the same lots — not re-allocated, because FEFO would
 * pick differently now and the bill would stop saying what actually left the
 * building. That can take a lot below zero, which is the honest answer: those
 * pieces are with the customer either way.
 */
async function reapply(sale: SaleDoc, actor: Actor, reason: string) {
  for (const line of sale.lines) {
    const back = line.qtyPieces - (line.returnedPieces ?? 0);
    if (back <= 0 || !line.batch) continue;

    const batch = await StockBatchModel.findById(line.batch);
    if (!batch) continue;
    batch.qtyOnHand -= back;
    await batch.save();

    await StockLedgerModel.create({
      organization: actor.org,
      product: line.product,
      batch: batch._id,
      move: 'sale',
      qtyDelta: -back,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: line.costPerPiece,
      pricePerPiece: line.pricePerPiece,
      ref: { model: 'Sale', id: sale._id },
      reason,
      actor: actor.id,
      actorName: actor.name,
    });
  }

  if (sale.customer && sale.due > 0) {
    const customer = await ShopCustomerModel.findOne({
      _id: sale.customer,
      organization: actor.org,
    });
    if (customer) {
      const balance = money((customer.balance ?? 0) + sale.due);
      customer.balance = balance;
      await customer.save();
      await CustomerLedgerModel.create({
        organization: actor.org,
        customer: customer._id,
        entry: 'adjustment',
        amount: sale.due,
        balanceAfter: balance,
        reference: sale.billNo,
        note: reason,
        ref: { model: 'Sale', id: sale._id },
        actor: actor.id,
        actorName: actor.name,
      });
    }
  }

  let shiftTouched = false;
  if (sale.shift) {
    const shift = await ShiftModel.findOne({ _id: sale.shift, organization: actor.org });
    if (shift && !shift.closedAt) {
      const cash = (sale.payments ?? [])
        .filter((p) => p.method === 'cash')
        .reduce((n, p) => n + p.amount, 0);
      await ShiftModel.updateOne(
        { _id: shift._id },
        {
          $inc: {
            salesCount: 1,
            salesTotal: sale.total,
            cashTaken: cash,
            digitalTaken: sale.paid - cash,
            dueGiven: sale.due,
            expectedCash: cash,
          },
        },
      );
      shiftTouched = true;
    }
  }

  return { shiftTouched };
}

/**
 * Cancels a bill.
 *
 * Everything it did is reversed and the bill stays, marked, with the name of
 * whoever cancelled it and what they said the reason was.
 */
export async function voidSale(
  actor: Actor & { role?: string },
  id: string,
  input: { reason: string },
  perms: { runsTheShop: boolean; openShiftId: string | null },
) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw badRequest('Say why this bill is being cancelled — it is kept with it');
  }

  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org });
  if (!sale) throw notFound('Bill');
  /* A closed month's bills stay as they were closed. */
  await assertMonthOpen(actor.org, sale.soldAt);

  const allowed = mayVoid(sale, { id: actor.id, runsTheShop: perms.runsTheShop }, perms.openShiftId);
  if (!allowed.ok) throw forbidden(allowed.why);

  const { shiftTouched } = await unapply(sale, actor, 'sale_void', `Cancelled: ${reason}`);

  const totalBefore = sale.total;
  sale.status = 'void';
  sale.history.push({
    action: 'void',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason,
    totalBefore,
    totalAfter: 0,
    /* Worth recording: if the till was already counted, the money did not move
       back out of that day and somebody has to square it by hand. */
    note: shiftTouched ? '' : 'The cash for this bill had already been counted',
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'sale.void',
    { model: 'Sale', id: sale._id, label: sale.billNo },
    { before: { total: totalBefore, status: 'completed' }, after: { status: 'void', reason } },
  );

  return sale.toObject();
}

/**
 * Corrects what a bill says about the people on it.
 *
 * Deliberately **not** the lines. Changing what left the shelf after the
 * customer has walked out with it is not a correction, it is a second
 * transaction — and the honest way to do that is to cancel the bill and ring it
 * up again, which is one key away and leaves both halves on the record.
 *
 * What genuinely does get typed wrong and should be fixable: the name against a
 * due, the phone number, and the note. None of them move stock or money, and
 * every one of them still writes a row on the bill's history saying who changed
 * it and why.
 */
export async function editSale(
  actor: Actor & { role?: string },
  id: string,
  input: { customerName?: string; customerPhone?: string; note?: string; reason: string },
) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw badRequest('Say why this bill is being changed — it is kept with it');
  }

  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org });
  if (!sale) throw notFound('Bill');
  /* A closed month's bills stay as they were closed. */
  await assertMonthOpen(actor.org, sale.soldAt);
  if (sale.status === 'void') throw badRequest('That bill has been cancelled');
  if (sale.deletedAt) throw badRequest('That bill is in the bin');
  /* The whole point of a hold is that nothing moves until somebody has
     finished looking at it. */
  if (sale.onHold) throw badRequest('That bill is being checked — let it go first');

  const before = {
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    note: sale.note,
  };

  if (input.customerName !== undefined) sale.customerName = input.customerName.trim();
  if (input.customerPhone !== undefined) sale.customerPhone = input.customerPhone.trim();
  if (input.note !== undefined) sale.note = input.note.trim();

  const after = {
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    note: sale.note,
  };

  const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
    (k) => after[k] !== before[k],
  );
  if (changed.length === 0) throw badRequest('Nothing on that bill was changed');

  /* A due with no name cannot be chased, which is the rule the till enforces at
     the counter; an edit must not be a way round it. */
  if (sale.due > 0 && !sale.customerName.trim()) {
    throw badRequest('A bill with money owed on it has to have a name');
  }

  sale.history.push({
    action: 'edit',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason,
    totalBefore: sale.total,
    totalAfter: sale.total,
    note: changed.join(', '),
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'sale.edit',
    { model: 'Sale', id: sale._id, label: sale.billNo },
    { before, after: { ...after, reason } },
  );

  return sale.toObject();
}


/**
 * Puts a cancelled bill back.
 *
 * Somebody cancels the wrong bill at a busy counter roughly as often as they
 * ring up the wrong one. Without this the shop has to re-key it under a new
 * number, which the slip in the customer's hand does not match.
 *
 * Owner only, and never for a bill that is in the bin: taking something out of
 * the bin is its own act with its own record.
 */
export async function revertSale(
  actor: Actor & { role?: string },
  id: string,
  input: { reason: string },
) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw badRequest('Say why this bill is coming back — it is kept with it');
  }

  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org });
  if (!sale) throw notFound('Bill');
  /* A closed month's bills stay as they were closed. */
  await assertMonthOpen(actor.org, sale.soldAt);
  if (sale.status !== 'void') throw badRequest('That bill was never cancelled');
  if (sale.deletedAt) throw badRequest('That bill is in the bin — take it out of there first');

  const { shiftTouched } = await reapply(sale, actor, `Put back: ${reason}`);

  sale.status = sale.lines.every((l) => (l.returnedPieces ?? 0) >= l.qtyPieces)
    ? 'returned'
    : 'completed';
  sale.history.push({
    action: 'revert',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason,
    totalBefore: 0,
    totalAfter: sale.total,
    note: shiftTouched ? '' : 'The cash for this bill had already been counted',
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'sale.revert',
    { model: 'Sale', id: sale._id, label: sale.billNo },
    { before: { status: 'void' }, after: { status: sale.status, reason } },
  );

  return sale.toObject();
}

/**
 * Holds a bill for a look, or lets it go again.
 *
 * Neither cancelled nor settled. Somebody has questioned it — a customer
 * disputing what they were charged, a figure the owner wants to check before
 * the day is closed — and until they have finished, nothing about it is to
 * move. It touches no stock and no money: the flag is the whole of it.
 */
export async function holdSale(
  actor: Actor & { role?: string },
  id: string,
  input: { hold: boolean; reason?: string },
) {
  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org });
  if (!sale) throw notFound('Bill');
  /* A closed month's bills stay as they were closed. */
  await assertMonthOpen(actor.org, sale.soldAt);
  if (sale.deletedAt) throw badRequest('That bill is in the bin');

  const reason = input.reason?.trim() ?? '';
  if (input.hold && reason.length < 3) {
    throw badRequest('Say what is being checked — it is kept with the bill');
  }

  sale.onHold = input.hold;
  sale.holdReason = input.hold ? reason : '';
  sale.history.push({
    action: input.hold ? 'hold' : 'unhold',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason: reason || 'Let go',
    totalBefore: sale.total,
    totalAfter: sale.total,
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'sale.hold',
    { model: 'Sale', id: sale._id, label: sale.billNo },
    { after: { onHold: input.hold, reason } },
  );

  return sale.toObject();
}

/**
 * Puts a bill in the bin.
 *
 * **Cancelled first, always.** A deleted bill that still counted would be money
 * nobody could find — so if it has not been cancelled, this cancels it on the
 * way and says so on the record. The row is never removed: the number was
 * printed on a customer's slip and the register has to be able to explain it,
 * even when the answer is that somebody threw it away.
 */
export async function deleteSale(
  actor: Actor & { role?: string },
  id: string,
  input: { reason: string },
) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw badRequest('Say why this bill is being deleted — it is kept with it');
  }

  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org });
  if (!sale) throw notFound('Bill');
  /* A closed month's bills stay as they were closed. */
  await assertMonthOpen(actor.org, sale.soldAt);
  if (sale.deletedAt) throw badRequest('That bill is already in the bin');

  let alsoCancelled = false;
  if (sale.status !== 'void') {
    await unapply(sale, actor, 'sale_void', `Deleted: ${reason}`);
    sale.status = 'void';
    alsoCancelled = true;
  }

  sale.deletedAt = new Date();
  sale.deletedBy = new Types.ObjectId(actor.id);
  sale.deletedByName = actor.name;
  sale.deleteReason = reason;
  sale.history.push({
    action: 'delete',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason,
    totalBefore: sale.total,
    totalAfter: 0,
    note: alsoCancelled ? 'Cancelled on the way to the bin' : '',
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'sale.void',
    { model: 'Sale', id: sale._id, label: sale.billNo },
    { after: { deleted: true, reason } },
  );

  return sale.toObject();
}

/**
 * Takes a bill out of the bin.
 *
 * It comes back cancelled, not live — the money and the stock were reversed
 * when it went in, and putting those back is `revertSale`, which is its own act
 * with its own reason. Two steps on purpose: "I did not mean to delete that" and
 * "that sale did happen after all" are different sentences.
 */
export async function restoreSale(actor: Actor & { role?: string }, id: string) {
  const sale = await SaleModel.findOne({
    _id: oid(id),
    organization: actor.org,
    deletedAt: { $ne: null },
  });
  if (!sale) throw notFound('Bill in the bin');
  await assertMonthOpen(actor.org, sale.soldAt);

  sale.deletedAt = null;
  sale.deletedBy = null;
  sale.deletedByName = '';
  sale.deleteReason = '';
  sale.history.push({
    action: 'restore',
    actor: new Types.ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role ?? '',
    reason: 'Taken out of the bin',
    totalBefore: 0,
    totalAfter: 0,
    note: 'Still cancelled — put it back to un-cancel it',
  });
  await sale.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'shop.restore',
    { model: 'Sale', id: sale._id, label: sale.billNo },
  );

  return sale.toObject();
}
