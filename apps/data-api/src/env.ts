import 'dotenv/config';

/**
 * This service's settings. It runs apart from the platform — its own process,
 * its own deployment — and shares only the database, from which it reads the
 * catalogue and the demand tables and nothing else of the platform's.
 */
const production = process.env.NODE_ENV === 'production';
const adminToken = process.env.DATA_API_ADMIN_TOKEN ?? '';
if (production && adminToken.length < 32) {
  throw new Error('DATA_API_ADMIN_TOKEN must be set, at least 32 characters');
}

const minShops = Number(process.env.DEMAND_MIN_SHOPS || 5);

export const env = {
  production,
  port: Number(process.env.PORT || 5200),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dawai',
  /** Empty outside production when unset: the admin is then closed, not open. */
  adminToken: adminToken.length >= 32 ? adminToken : '',
  /**
   * The fewest different shops any figure that leaves may rest on. A lower
   * number is allowed only to try the service against a small local database.
   */
  minShops: production ? Math.max(5, minShops) : Math.max(1, minShops),
  trustProxy: process.env.TRUST_PROXY === '1',
};
