import {
  OrganizationModel,
  UserModel,
  PaymentModel,
  AuditLogModel,
  SupplierModel,
  SupplierLedgerModel,
  ShopProductModel,
  ShopRackModel,
  StockBatchModel,
  StockCountModel,
  StockLedgerModel,
  ShopCounterModel,
  PurchaseModel,
  ExpenseModel,
  IncomeModel,
  CashMoveModel,
  MonthCloseModel,
  ShopOrderModel,
  ShiftModel,
  ShopCustomerModel,
  CustomerLedgerModel,
  SaleModel,
  ShopControlLogModel,
  ShopSettingsModel,
} from '../models/index.js';
import { storage } from './storage.service.js';
import { notFound, badRequest } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Taking a shop's data out, and taking a shop off.
 *
 * The export is the honest answer to the question every shop asks before
 * signing up — "if I leave, do I lose my stock and my khata?" — and being able
 * to say "no, here it is" is worth more than any feature. Deletion is the same
 * walk run backwards, and is why the file store is laid out tenant-first:
 * `uploads/org/<id>/` goes in one call.
 */

/** Every collection that belongs to one shop. */
const OWNED = [
  { name: 'settings', model: ShopSettingsModel },
  { name: 'racks', model: ShopRackModel },
  { name: 'counters', model: ShopCounterModel },
  { name: 'products', model: ShopProductModel },
  { name: 'batches', model: StockBatchModel },
  { name: 'stockLedger', model: StockLedgerModel },
  { name: 'stockCounts', model: StockCountModel },
  { name: 'suppliers', model: SupplierModel },
  { name: 'supplierLedger', model: SupplierLedgerModel },
  { name: 'purchases', model: PurchaseModel },
  { name: 'orders', model: ShopOrderModel },
  { name: 'customers', model: ShopCustomerModel },
  { name: 'customerLedger', model: CustomerLedgerModel },
  { name: 'shifts', model: ShiftModel },
  { name: 'sales', model: SaleModel },
  { name: 'cashMoves', model: CashMoveModel },
  { name: 'expenses', model: ExpenseModel },
  { name: 'incomes', model: IncomeModel },
  { name: 'monthCloses', model: MonthCloseModel },
  { name: 'controlLog', model: ShopControlLogModel },
  { name: 'payments', model: PaymentModel },
  { name: 'auditLogs', model: AuditLogModel },
] as const;

type Collection = {
  find: (f: unknown) => { lean: () => Promise<unknown[]> };
  deleteMany: (f: unknown) => Promise<{ deletedCount?: number }>;
};

/**
 * Everything a shop owns, as one JSON document. Credentials are stripped: an
 * export is a backup, not a way to walk off with password hashes.
 */
export async function exportOrganization(orgId: string) {
  const organization = await OrganizationModel.findById(orgId).lean();
  if (!organization) throw notFound('Shop');

  const users = await UserModel.find({ organization: orgId })
    .select('-passwordHash -refreshTokens -passwordResetTokenHash -emailVerifyTokenHash -sessions')
    .lean();

  const data: Record<string, unknown> = { organization, users };
  const counts: Record<string, number> = { users: users.length };

  for (const { name, model } of OWNED) {
    const rows = await (model as unknown as Collection).find({ organization: orgId }).lean();
    data[name] = rows;
    counts[name] = rows.length;
  }

  logger.info({ org: orgId, counts }, 'Shop data exported');
  return { exportedAt: new Date().toISOString(), format: 1, counts, ...data };
}

/**
 * Removes a shop and everything in it, permanently. Guarded by the shop's own
 * name typed back, because there is no undo. Files go last: a half-finished
 * deletion that leaves files is recoverable; the reverse is not.
 */
export async function deleteOrganization(orgId: string, confirmation: string) {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw notFound('Shop');

  if (confirmation.trim() !== org.name) {
    throw badRequest(`Type the shop's name exactly ("${org.name}") to confirm deletion`);
  }

  const deleted: Record<string, number> = {};
  for (const { name, model } of OWNED) {
    const res = await (model as unknown as Collection).deleteMany({ organization: orgId });
    deleted[name] = res.deletedCount ?? 0;
  }

  const users = await UserModel.deleteMany({ organization: orgId });
  deleted.users = users.deletedCount ?? 0;

  await storage.removeFolder(`org/${orgId}`).catch((err) => {
    logger.error({ err, org: orgId }, 'Shop files could not be removed; delete them by hand');
  });

  await OrganizationModel.deleteOne({ _id: orgId });
  deleted.organization = 1;

  logger.warn({ org: orgId, name: org.name, deleted }, 'Shop deleted permanently');
  return { name: org.name, deleted };
}
