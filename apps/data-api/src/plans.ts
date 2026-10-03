import { Plan } from './models.js';
import { logger } from './lib/logger.js';

/**
 * The plans a fresh deployment starts with. Written only when there are no
 * plans at all — after that they are the admin's to change, and a restart
 * never puts a price back.
 */
const STARTING = [
  {
    key: 'catalogue',
    name: 'Catalogue',
    description: 'Every registered medicine: brand, generic, strength, form, maker and listed price.',
    scopes: ['catalogue'],
    historyMonths: 0,
    requestsPerMinute: 60,
    requestsPerDay: 2_000,
    requestsPerMonth: 40_000,
    priceMonthly: 5_000,
  },
  {
    key: 'insight',
    name: 'Insight',
    description: 'The catalogue, plus what sells across the country: top medicines, generics, companies, and what is rising.',
    scopes: ['catalogue', 'demand', 'trends'],
    historyMonths: 12,
    requestsPerMinute: 120,
    requestsPerDay: 10_000,
    requestsPerMonth: 200_000,
    priceMonthly: 50_000,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Everything in Insight, district by district, three years back.',
    scopes: ['catalogue', 'demand', 'trends', 'districts'],
    historyMonths: 36,
    requestsPerMinute: 300,
    requestsPerDay: 50_000,
    requestsPerMonth: 1_000_000,
    priceMonthly: 150_000,
  },
];

export async function ensurePlans() {
  if (await Plan.exists({})) return;
  await Plan.insertMany(STARTING);
  logger.info({ plans: STARTING.map((p) => p.key) }, 'Starting plans written');
}
