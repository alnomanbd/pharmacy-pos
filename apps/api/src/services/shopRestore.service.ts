import mongoose, { Types, type Model } from 'mongoose';
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import {
  OrganizationModel,
  UserModel,
  BranchModel,
  CashMoveModel,
  CustomerLedgerModel,
  ExpenseModel,
  IncomeModel,
  MonthCloseModel,
  PurchaseModel,
  SaleModel,
  ShiftModel,
  ShopControlLogModel,
  ShopCounterModel,
  ShopCustomerModel,
  ShopOrderModel,
  ShopProductModel,
  ShopRackModel,
  ShopSettingsModel,
  StockBatchModel,
  StockCountModel,
  StockLedgerModel,
  StockTransferModel,
  SupplierModel,
  SupplierLedgerModel,
} from '../models/index.js';
import { AccessRoleModel } from '../models/AccessRole.js';
import { OnlineOrderModel } from './onlineOrder.service.js';
import { WalletPaymentModel } from './wallet.service.js';
import { backupDir, backupFile, BACKUP_FILE_RX, writeForBackupService } from './backup.service.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Putting one shop back as it was in a backup.
 *
 * The case this is for: one shop deletes the wrong things, or an import goes
 * wrong, and wants yesterday back. Putting the whole database back would roll
 * every other shop back with it, so instead the backup service loads the
 * shop-owned collections of one nightly backup into a side database
 * (`<db>_restore`, see ops/backup/stage.sh), the operator sees what would
 * change, and this swaps that one shop's rows for the backup's.
 *
 * What is put back is the shop's books — stock, bills, khata, suppliers,
 * money, settings. What is not:
 *
 * - **Logins.** Restoring users would bring back old passwords and sessions,
 *   and staff added since would be locked out. Staff keep their accounts;
 *   any branch they were assigned that the backup does not have is dropped
 *   from their list.
 * - **The subscription and its payments.** That is money the shop paid us,
 *   and a restore must not undo it.
 * - **The audit trail, support threads, operator notes.** Append-only records
 *   of what happened, including this restore.
 *
 * Before anything changes, the shop's current rows are written to
 * `shop-<id>-<time>.ejson.gz` beside the backups, and "Undo" puts those back
 * the same way. There is no transaction across collections on a single
 * MongoDB server, so that file is also the way back from a restore that fails
 * part way.
 */

type AnyModel = Model<unknown>;

/** The shop's books: replaced from the backup. */
export const RESTORED: { key: string; label: string; model: AnyModel }[] = [
  { key: 'settings', label: 'Shop settings', model: ShopSettingsModel as unknown as AnyModel },
  { key: 'branches', label: 'Branches', model: BranchModel as unknown as AnyModel },
  { key: 'roles', label: 'Staff roles', model: AccessRoleModel as unknown as AnyModel },
  { key: 'counters', label: 'Counters', model: ShopCounterModel as unknown as AnyModel },
  { key: 'racks', label: 'Racks', model: ShopRackModel as unknown as AnyModel },
  { key: 'products', label: 'Products', model: ShopProductModel as unknown as AnyModel },
  { key: 'batches', label: 'Stock batches', model: StockBatchModel as unknown as AnyModel },
  { key: 'stockLedger', label: 'Stock movements', model: StockLedgerModel as unknown as AnyModel },
  { key: 'stockCounts', label: 'Stock counts', model: StockCountModel as unknown as AnyModel },
  { key: 'stockTransfers', label: 'Stock transfers', model: StockTransferModel as unknown as AnyModel },
  { key: 'suppliers', label: 'Suppliers', model: SupplierModel as unknown as AnyModel },
  { key: 'supplierLedger', label: 'Supplier ledger', model: SupplierLedgerModel as unknown as AnyModel },
  { key: 'purchases', label: 'Purchases', model: PurchaseModel as unknown as AnyModel },
  { key: 'orders', label: 'Orders to suppliers', model: ShopOrderModel as unknown as AnyModel },
  { key: 'customers', label: 'Customers', model: ShopCustomerModel as unknown as AnyModel },
  { key: 'customerLedger', label: 'Khata entries', model: CustomerLedgerModel as unknown as AnyModel },
  { key: 'shifts', label: 'Shifts', model: ShiftModel as unknown as AnyModel },
  { key: 'sales', label: 'Bills', model: SaleModel as unknown as AnyModel },
  { key: 'walletPayments', label: 'bKash / Nagad payments', model: WalletPaymentModel as unknown as AnyModel },
  { key: 'onlineOrders', label: 'Online orders', model: OnlineOrderModel as unknown as AnyModel },
  { key: 'cashMoves', label: 'Cash in and out', model: CashMoveModel as unknown as AnyModel },
  { key: 'expenses', label: 'Expenses', model: ExpenseModel as unknown as AnyModel },
  { key: 'incomes', label: 'Other income', model: IncomeModel as unknown as AnyModel },
  { key: 'monthCloses', label: 'Closed months', model: MonthCloseModel as unknown as AnyModel },
  { key: 'controlLog', label: 'Control log', model: ShopControlLogModel as unknown as AnyModel },
];

/**
 * Models that carry a shop's id but are deliberately left alone — see above.
 * A test holds every model with an `organization` field to one list or the
 * other, so a new collection is a decision, not something a restore forgets.
 */
export const KEPT = [
  'Organization',
  'User',
  'Payment',
  'AuditLog',
  'NotificationLog',
  'ImpersonationHandoff',
  'MedicineRequest',
  'ShopNote',
  'SupportThread',
  'SupportMessage',
  'AgentCommission',
  'LeavingAnswer',
  'PushSubscription',
];

const collectionOf = (m: AnyModel) => m.collection.collectionName;

/* ------------------------------------------------------------------ */
/* The side database                                                   */
/* ------------------------------------------------------------------ */

export interface StageState {
  state: 'queued' | 'running' | 'ready' | 'failed';
  archive: string;
  by: string;
  startedAt: string;
  finishedAt: string;
  error: string;
}

function stagingDb() {
  const main = mongoose.connection.db!;
  return mongoose.connection.useDb(`${main.databaseName}_restore`, { useCache: true }).db!;
}

function requireDir() {
  const dir = backupDir();
  if (!dir) throw badRequest('Backups are not set up on this server (BACKUP_DIR is not set).');
  return dir;
}

async function readStage(dir: string): Promise<StageState | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, '.stage.json'), 'utf8')) as StageState;
  } catch {
    return null;
  }
}

/** `dawai-2026-10-03_0200.archive.gz` → `2026-10-03_0200`. */
export const stampOfArchive = (name: string) => name.replace(/^dawai-/, '').replace(/\.archive\.gz$/, '');

/** The request the backup service reads: one setting per line (ops/backup/stage.sh). */
export function stageRequest(archive: string, by: string, collections: string[]) {
  const clean = by.replace(/[\r\n]/g, ' ').trim();
  return [`archive=${archive}`, `by=${clean}`, ...collections.map((c) => `collection=${c}`)].join('\n') + '\n';
}

/**
 * Load one backup aside. Empties the side database first, so what is there
 * afterwards is that backup and nothing older.
 */
export async function prepareRestore(archive: string, by: string) {
  const dir = requireDir();
  if (!BACKUP_FILE_RX.test(archive) || !archive.startsWith('dawai-')) throw badRequest('Choose a database backup.');
  if (!(await backupFile(archive))) throw badRequest('That backup is not on the server any more.');

  const current = await readStage(dir);
  if (current && (current.state === 'queued' || current.state === 'running')) {
    throw conflict('A backup is already being loaded. Wait for it to finish.');
  }

  const stage: StageState = { state: 'queued', archive, by, startedAt: new Date().toISOString(), finishedAt: '', error: '' };
  await writeForBackupService(dir, '.stage.json', JSON.stringify(stage));
  await stagingDb().dropDatabase();
  await writeForBackupService(dir, '.stage-request', stageRequest(archive, by, RESTORED.map((r) => collectionOf(r.model))));
  return stage;
}

/** Empty the side database — it holds every shop's books from that night. */
export async function discardStage() {
  const dir = requireDir();
  await stagingDb().dropDatabase();
  await rm(path.join(dir, '.stage.json'), { force: true });
  await rm(path.join(dir, '.stage-request'), { force: true });
}

/* ------------------------------------------------------------------ */
/* What would change                                                   */
/* ------------------------------------------------------------------ */

async function shopOrThrow(orgId: string) {
  if (!Types.ObjectId.isValid(orgId)) throw notFound('Shop');
  const org = await OrganizationModel.findById(orgId).select('name').lean<{ _id: Types.ObjectId; name: string }>();
  if (!org) throw notFound('Shop');
  return org;
}

/** The copies of this shop taken before a restore, newest first. */
async function snapshotsOf(dir: string, orgId: string) {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const rx = new RegExp(`^shop-${orgId}-(\\d{4}-\\d{2}-\\d{2}_\\d{6})\\.ejson\\.gz$`);
  const out: { name: string; at: Date; size: number }[] = [];
  for (const name of names) {
    if (!rx.test(name)) continue;
    const s = await stat(path.join(dir, name)).catch(() => null);
    if (s) out.push({ name, at: s.mtime, size: s.size });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function restoreState(orgId: string) {
  const dir = backupDir();
  if (!dir) return { configured: false as const };
  const org = await shopOrThrow(orgId);
  const stage = await readStage(dir);
  const snapshots = await snapshotsOf(dir, orgId);

  let rows: { key: string; label: string; now: number; backup: number }[] | null = null;
  let lastBillInBackup: Date | null = null;
  if (stage?.state === 'ready') {
    const side = stagingDb();
    const filter = { organization: org._id };
    rows = await Promise.all(
      RESTORED.map(async (r) => ({
        key: r.key,
        label: r.label,
        now: await r.model.collection.countDocuments(filter),
        backup: await side.collection(collectionOf(r.model)).countDocuments(filter),
      })),
    );
    const last = await side
      .collection(collectionOf(SaleModel as unknown as AnyModel))
      .find(filter, { projection: { createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    lastBillInBackup = (last?.createdAt as Date | undefined) ?? null;
  }

  return { configured: true as const, shop: org.name, stage, rows, lastBillInBackup, snapshots };
}

/* ------------------------------------------------------------------ */
/* Swapping the rows                                                   */
/* ------------------------------------------------------------------ */

const { EJSON } = mongoose.mongo.BSON;
const BATCH = 1000;

/** `2026-10-04_133205` in UTC — sorts, and is safe in a file name. */
function fileStamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15).replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
}

/** Every row this shop has now, one `{ c, d }` line per row, gzipped. */
async function snapshot(dir: string, orgId: Types.ObjectId) {
  const name = `shop-${orgId}-${fileStamp()}.ejson.gz`;
  const gzip = createGzip();
  const file = createWriteStream(path.join(dir, name));
  const done = new Promise<void>((resolve, reject) => {
    file.on('finish', () => resolve());
    file.on('error', reject);
    gzip.on('error', reject);
  });
  gzip.pipe(file);
  let rows = 0;
  for (const r of RESTORED) {
    const c = collectionOf(r.model);
    for await (const doc of r.model.collection.find({ organization: orgId })) {
      if (!gzip.write(EJSON.stringify({ c, d: doc }, { relaxed: false }) + '\n')) await once(gzip, 'drain');
      rows++;
    }
  }
  gzip.end();
  await done;
  return { name, rows };
}

/**
 * This shop's rows in every restored collection, replaced by `source`'s.
 * One collection at a time, deleting then inserting in batches.
 */
async function replaceShop(
  orgId: Types.ObjectId,
  source: (collection: string) => AsyncIterable<Record<string, unknown>>,
) {
  const counts: Record<string, number> = {};
  for (const r of RESTORED) {
    const c = collectionOf(r.model);
    const target = r.model.collection;
    await target.deleteMany({ organization: orgId });
    let batch: Record<string, unknown>[] = [];
    let n = 0;
    for await (const doc of source(c)) {
      // Never another shop's row, whatever the source holds.
      if (String(doc.organization) !== String(orgId)) continue;
      batch.push(doc);
      if (batch.length >= BATCH) {
        await target.insertMany(batch, { ordered: false });
        n += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await target.insertMany(batch, { ordered: false });
      n += batch.length;
    }
    counts[r.key] = n;
  }

  // Staff keep their logins; a branch the shop no longer has comes off their list.
  const branches = await BranchModel.find({ organization: orgId }).distinct('_id');
  await UserModel.updateMany({ organization: orgId }, { $pull: { branches: { $nin: branches } } });
  return counts;
}

function confirmName(shop: string, typed: string) {
  if (typed.trim() !== shop) throw badRequest(`Type the shop's name exactly ("${shop}") to confirm.`);
}

/** Put the loaded backup's rows for this shop in place of its current ones. */
export async function applyRestore(orgId: string, confirmation: string) {
  const dir = requireDir();
  const org = await shopOrThrow(orgId);
  confirmName(org.name, confirmation);
  const stage = await readStage(dir);
  if (stage?.state !== 'ready') throw badRequest('Load a backup first.');

  const before = await snapshot(dir, org._id);
  logger.warn({ org: orgId, archive: stage.archive, snapshot: before.name }, 'Restoring a shop from a backup');

  const side = stagingDb();
  const filter = { organization: org._id };
  try {
    const counts = await replaceShop(org._id, (c) => side.collection(c).find(filter) as AsyncIterable<Record<string, unknown>>);
    logger.warn({ org: orgId, archive: stage.archive, counts }, 'Shop restored from a backup');
    return { archive: stage.archive, snapshot: before.name, counts };
  } catch (err) {
    logger.error({ err, org: orgId, snapshot: before.name }, 'Restore failed part way; undo puts the shop back');
    throw badRequest(`The restore stopped part way: ${(err as Error).message}. Use "Undo" with ${before.name} to put the shop back as it was.`);
  }
}

/** Rows of one collection from a snapshot file, read again from the start for each. */
async function* fromSnapshot(file: string, collection: string) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const row = EJSON.parse(line, { relaxed: false }) as { c: string; d: Record<string, unknown> };
    if (row.c === collection) yield row.d;
  }
}

/** Put the shop back as it was just before a restore. That too is snapshotted first. */
export async function undoRestore(orgId: string, snapshotName: string, confirmation: string) {
  const dir = requireDir();
  const org = await shopOrThrow(orgId);
  confirmName(org.name, confirmation);
  const snap = (await snapshotsOf(dir, orgId)).find((s) => s.name === snapshotName);
  if (!snap) throw badRequest('That copy is not on the server any more.');

  const file = path.join(dir, snap.name);
  const before = await snapshot(dir, org._id);
  const counts = await replaceShop(org._id, (c) => fromSnapshot(file, c));
  logger.warn({ org: orgId, from: snap.name, snapshot: before.name, counts }, 'Shop put back as it was before a restore');
  return { from: snap.name, snapshot: before.name, counts };
}
