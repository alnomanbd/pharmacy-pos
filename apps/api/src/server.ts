import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { initErrorReporting } from './integrations/errorReporter.js';
import { logger } from './utils/logger.js';

async function main() {
  // Before anything else, so a failure during startup is itself reported.
  initErrorReporting();

  await connectDB();

  const server = http.createServer(app);
  startScheduler();

  server.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    stopScheduler();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
