import { connectDB, disconnectDB } from '../config/db.js';
import {
  seedPlans,
  seedPlatformAdmin,
  seedMedicines,
  seedCompanies,
  seedDemoShop,
  copyCatalog,
} from './index.js';
import { seedShopDemo } from './shopDemo.js';
import { exportCatalog, restoreCatalog } from './catalogArchive.js';
import { logger } from '../utils/logger.js';

/**
 * `npm run seed:<task>` for the Dawai database.
 *
 *   all             plans + the full medicine catalogue from data/catalogue
 *   plans           Trial / Basic / Plus
 *   platform-admin  the operator login (PLATFORM_ADMIN_EMAIL / _PASSWORD)
 *   catalog:restore the medicine catalogue from data/catalogue (--dir= to override)
 *   catalog:export  write the live catalogue back to data/catalogue, to commit
 *   catalog:copy    the catalogue from another database (--from=<mongodb uri>)
 *   catalog:build   build the catalogue CSV from the DGDA registry / drug index
 *   catalog:dar     registration numbers for medicines without one, from the DGDA registry (--dgda=)
 *   catalog:monographs  what each generic is for, its dosage and side effects, from the drug index (--medex=)
 *   medicines:full  import that CSV (a rebuild from source, rarely needed)
 *   companies      the pharmaceutical company list
 *   demo-shop      one demo pharmacy with an owner, pharmacist and salesman
 *   shop-demo      stock, suppliers, deliveries and bills for every shop
 */
const task = process.argv[2] || 'all';
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function run() {
  // Pure file work — no database connection needed.
  if (task === 'catalog:build') {
    const { buildCatalog } = await import('./catalogBuild.js');
    if (!arg('dgda') && !arg('medex')) {
      throw new Error(
        'Give at least one source: --dgda=/path/Allopathic_Drug_Database.csv and/or --medex=/path/archive',
      );
    }
    const r = await buildCatalog({
      dgda: arg('dgda'),
      medex: arg('medex'),
      out: arg('out'),
      types: arg('types')?.split(','),
      onProgress: (message: string) => logger.info(message),
    });
    logger.info(r, 'Catalogue built — import it with seed:medicines:full');
    return;
  }

  await connectDB();
  try {
    if (task === 'catalog:copy') {
      const from = arg('from');
      if (!from) throw new Error('Say where to copy from: --from=mongodb://host:27017/<database>');
      const r = await copyCatalog(from, (m) => logger.info(m));
      logger.info(r, 'Catalogue copied');
      return;
    }
    if (task === 'catalog:restore') {
      logger.info(await restoreCatalog(arg('dir'), (m) => logger.info(m)), 'Catalogue restored');
      return;
    }
    if (task === 'catalog:dar') {
      const dgda = arg('dgda');
      if (!dgda) throw new Error('Say where the registry is: --dgda=/path/Allopathic_Drug_Database.csv');
      const { backfillDar } = await import('./darBackfill.js');
      logger.info(await backfillDar({ dgda, dryRun: process.argv.includes('--dry-run'), onProgress: (m) => logger.info(m) }), 'DAR numbers filled from the registry');
      return;
    }
    if (task === 'catalog:monographs') {
      const medex = arg('medex');
      if (!medex) throw new Error('Say where the drug index is: --medex=/path/to/archive (the folder with generic.csv)');
      const { importMonographs } = await import('./monographs.js');
      const r = await importMonographs({ medex, dryRun: process.argv.includes('--dry-run'), onProgress: (m) => logger.info(m) });
      logger.info(r, 'Monographs imported — run catalog:export and commit data/catalogue');
      return;
    }
    if (task === 'catalog:export') {
      logger.info(await exportCatalog(arg('dir'), (m) => logger.info(m)), 'Catalogue exported — commit data/catalogue');
      return;
    }
    if (task === 'medicines:full') {
      const r = await seedMedicines(true, false, { file: arg('file') });
      logger.info(r, 'Seed: full medicine catalogue');
      return;
    }
    if (task === 'platform-admin') {
      logger.info(await seedPlatformAdmin(), 'Seed: operator account');
      return;
    }
    if (task === 'demo-shop') {
      logger.info(await seedDemoShop(), 'Seed: demo shop');
      return;
    }
    if (task === 'shop-demo') {
      logger.info(await seedShopDemo(), 'Seed: demo stock, deliveries and a day at the counter');
      return;
    }
    if (task === 'companies') {
      logger.info(await seedCompanies(), 'Seed: pharmaceutical companies');
      return;
    }
    if (task === 'plans' || task === 'all') {
      logger.info(await seedPlans(), 'Seed: plan catalogue');
    }
    if (task === 'all') {
      logger.info(await restoreCatalog(undefined, (m) => logger.info(m)), 'Seed: medicine catalogue');
    }
  } finally {
    await disconnectDB();
  }
}

run().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
