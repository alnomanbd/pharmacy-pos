import {
  MedicineGroupModel,
  MedicineCompanyModel,
  MedicineGenericModel,
  MedicineModel,
  OrganizationModel,
  UserModel,
} from '../models/index.js';
import { seedMedicines as medicineRows, medicineGroups, medicineCompanies, medicineGenerics } from './medicines.data.js';
import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';

/**
 * Seeding the Dawai database.
 *
 * - `seedPlatformAdmin` — the operator login (a real credential, never in `all`).
 * - `seedPlans` — Trial, Basic, Plus, matching the price list on the site.
 * - `seedCompanies` / `seedMedicines` — the medicine catalogue (a demo subset, or
 *   the full built CSV). `copyCatalog` below copies the whole catalogue from
 *   another database instead; the usual route is the checked-in archive, see
 *   `catalogArchive.ts`.
 * - `seedDemoShop` — one demo pharmacy with an owner, a pharmacist and a
 *   salesman, so `shop-demo` has somewhere to put stock.
 */

/**
 * Creates the operator account — the one login that reaches the Dawai console.
 *
 * Not part of `all`: it is a real credential, created on purpose with a
 * password given in the environment rather than a known one in every database.
 */
export async function seedPlatformAdmin(opts: { email?: string; password?: string; name?: string } = {}) {
  const bcryptjs = (await import('bcryptjs')).default;
  const email = (opts.email || process.env.PLATFORM_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = opts.password || process.env.PLATFORM_ADMIN_PASSWORD || '';
  const name = opts.name || process.env.PLATFORM_ADMIN_NAME || 'Dawai Operator';

  if (!email || !password) {
    throw new Error(
      'Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (or pass them) before seeding the operator account.',
    );
  }
  if (password.length < 10) {
    throw new Error('The platform admin password must be at least 10 characters.');
  }

  const existing = await UserModel.findOne({ email });
  if (existing) {
    // Re-running resets the password rather than failing — that is what this
    // command is reached for when the operator is locked out.
    existing.set('passwordHash', await bcryptjs.hash(password, 12));
    existing.set('role', 'platformAdmin');
    existing.set('organization', undefined);
    existing.set('isActive', true);
    await existing.save();
    return { email, created: false, passwordReset: true };
  }

  await UserModel.create({
    role: 'platformAdmin',
    name,
    email,
    // The operator has no shop; the phone is required by the schema, so a
    // placeholder is stored and never used.
    phone: opts.email ? `platform-${Date.now()}` : `platform-${Date.now()}`,
    passwordHash: await bcryptjs.hash(password, 12),
    isEmailVerified: true,
  });

  return { email, created: true, passwordReset: false };
}

/**
 * The starting plan catalogue, matching the site's price list. Idempotent and
 * never overwriting: once an operator has priced a plan in the console, a
 * redeploy running the seed must not put it back.
 */
export async function seedPlans() {
  const { PlanModel } = await import('../models/index.js');
  const { clearPlanCache } = await import('../services/plan.service.js');

  const rows = [
    {
      key: 'trial',
      name: 'Trial',
      description: 'The whole shop, nothing held back, for 14 days.',
      price: 0,
      isTrial: true,
      trialDays: 14,
      sortOrder: 0,
      limits: { outlets: 1, terminals: 1, shopUsers: 2 },
    },
    {
      key: 'basic',
      name: 'Pharmacy Basic',
      description: 'One shop, one billing screen, two people.',
      price: 1500,
      sortOrder: 1,
      limits: { outlets: 1, terminals: 1, shopUsers: 2 },
    },
    {
      key: 'plus',
      name: 'Pharmacy Plus',
      description: 'Several billing screens and up to ten staff, with roles.',
      price: 3000,
      sortOrder: 2,
      limits: { outlets: 1, terminals: 5, shopUsers: 10 },
    },
  ];

  let created = 0;
  for (const row of rows) {
    if (await PlanModel.findOne({ key: row.key }).lean()) continue;
    await PlanModel.create(row);
    created++;
  }

  clearPlanCache();
  return { total: rows.length, created, existing: rows.length - created };
}

export async function seedCompanies() {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { parseCsv } = await import('../services/formularyImport.service.js');

  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, 'data/bd-companies.csv'), 'utf8');
  const rows = parseCsv(raw).slice(1); // past the `name` header

  let created = 0;
  let existing = 0;
  for (const [name] of rows) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await MedicineCompanyModel.findOne({
      name: new RegExp(`^${escaped}$`, 'i'),
    }).lean();
    if (found) {
      existing++;
      continue;
    }
    await MedicineCompanyModel.create({
      name: trimmed,
      slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    });
    created++;
  }

  return { rows: rows.length, created, existing };
}

export async function seedMedicines(
  doFull = false,
  starter = false,
  opts: { file?: string; dryRun?: boolean; onProgress?: (message: string) => void } = {},
) {
  if (doFull || starter) {
    const { runFullImport } = await import('./medicinesFull.js');
    const r = starter
      ? await runFullImport('data/bd-medicines-starter.csv')
      : await runFullImport(opts);
    return {
      file: r.file,
      dryRun: r.dryRun,
      rows: r.rows,
      inserted: r.created,
      updated: r.updated,
      unchanged: r.unchanged,
      failed: r.failed.length,
      // The first few reasons, not all of them: a malformed 25,000-row file
      // would otherwise print 25,000 identical lines and bury the count.
      failures: r.failed.slice(0, 10),
    };
  }

  const groups = new Map<string, string>();
  for (const g of medicineGroups) {
    const doc = await MedicineGroupModel.findOneAndUpdate(
      { name: g },
      { $setOnInsert: { name: g } },
      { upsert: true, new: true },
    );
    groups.set(g, doc.id);
  }

  const companies = new Map<string, string>();
  for (const c of medicineCompanies) {
    const doc = await MedicineCompanyModel.findOneAndUpdate(
      { name: c },
      { $setOnInsert: { name: c, slug: c.toLowerCase().replace(/[^a-z0-9]+/g, '-') } },
      { upsert: true, new: true },
    );
    companies.set(c, doc.id);
  }

  const generics = new Map<string, string>();
  for (const g of medicineGenerics) {
    const doc = await MedicineGenericModel.findOneAndUpdate(
      { name: g },
      { $setOnInsert: { name: g } },
      { upsert: true, new: true },
    );
    generics.set(g, doc.id);
  }

  let inserted = 0;
  let updated = 0;
  for (const m of medicineRows) {
    const key = { brandName: m.brand, genericName: m.generic, strength: m.strength };
    const res = await MedicineModel.updateOne(
      key,
      {
        $set: {
          generic: generics.get(m.generic),
          company: companies.get(m.company),
          group: groups.get(m.group),
          dosageForm: m.dosageForm,
          strength: m.strength,
          packSize: m.packSize,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) inserted++;
    else updated++;
  }

  return { inserted, updated, groups: groups.size, companies: companies.size, generics: generics.size };
}

/**
 * One demo pharmacy, active, on a long trial, with the three kinds of staff.
 * Passwords come from `SEED_SHOP_PASSWORD` (see memory: demo passwords live in
 * `.env`), and re-running resets them rather than failing.
 */
export async function seedDemoShop() {
  const password = env.seed.shopPassword;
  const hash = await bcrypt.hash(password, 12);

  let org = await OrganizationModel.findOne({ name: 'Jonni Pharmacy' });
  if (!org) {
    org = await OrganizationModel.create({
      name: 'Jonni Pharmacy',
      status: 'active',
      plan: 'plus',
      approvedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 365 * 86_400_000),
      contactPhone: '01700000000',
      address: { street: 'Satmatha', city: 'Bogura', district: 'Bogura' },
    });
  }

  const people = [
    { role: 'admin' as const, name: 'Rafiq Hasan', email: 'owner@dawai.demo', phone: '01700000001' },
    { role: 'pharmacist' as const, name: 'Shirin Akter', email: 'pharmacist@dawai.demo', phone: '01700000002' },
    { role: 'salesman' as const, name: 'Rashed Mia', email: 'salesman@dawai.demo', phone: '01700000003' },
  ];

  const ids: string[] = [];
  for (const p of people) {
    const user = await UserModel.findOneAndUpdate(
      { email: p.email },
      {
        $set: { ...p, organization: org._id, passwordHash: hash, isActive: true, isEmailVerified: true },
      },
      { upsert: true, new: true },
    );
    ids.push(String(user._id));
  }
  org.set('owner', ids[0]);
  await org.save();

  logger.info({ shop: org.name, logins: people.map((p) => p.email) }, 'Demo shop ready');
  return { shop: org.name, logins: people.map((p) => p.email) };
}

/**
 * Copies the medicine catalogue from another database into this one — staging
 * into production, say — keeping every `_id`, so both carry exactly the same
 * brands, companies, generics and groups, including every correction an
 * operator has made.
 *
 * Upserts by `_id` in batches, so re-running is safe and only brings changes.
 */
export async function copyCatalog(fromUri: string, onProgress?: (m: string) => void) {
  const mongoose = (await import('mongoose')).default;
  const source = await mongoose.createConnection(fromUri).asPromise();
  const pairs = [
    { name: 'medicinegroups', model: MedicineGroupModel },
    { name: 'medicinecompanies', model: MedicineCompanyModel },
    { name: 'medicinegenerics', model: MedicineGenericModel },
    { name: 'medicines', model: MedicineModel },
  ] as const;

  const counts: Record<string, number> = {};
  try {
    for (const { name, model } of pairs) {
      const cursor = source.db!.collection(name).find({});
      let batch: Record<string, unknown>[] = [];
      let n = 0;
      const flush = async () => {
        if (!batch.length) return;
        await model.collection.bulkWrite(
          batch.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })) as never,
          { ordered: false },
        );
        n += batch.length;
        batch = [];
        onProgress?.(`${name}: ${n}`);
      };
      for await (const doc of cursor) {
        batch.push(doc as Record<string, unknown>);
        if (batch.length >= 1000) await flush();
      }
      await flush();
      counts[name] = n;
    }
  } finally {
    await source.close();
  }
  return counts;
}
