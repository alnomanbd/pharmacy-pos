import http from 'node:http';
import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './env.js';
import { ensurePlans } from './plans.js';
import { logger } from './lib/logger.js';

async function main() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  await ensurePlans();
  const server = http.createServer(app);
  server.listen(env.port, () => {
    logger.info(`Data API on http://localhost:${env.port} — figures need ${env.minShops}+ shops${env.adminToken ? '' : ' — admin closed (no DATA_API_ADMIN_TOKEN)'}`);
  });
  const stop = () => {
    server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  logger.error({ err }, 'Data API failed to start');
  process.exit(1);
});
