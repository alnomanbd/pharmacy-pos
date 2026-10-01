import mongoose from 'mongoose';
import { env, isProduction } from './env.js';
import { logger } from '../utils/logger.js';
import { maskMongoUri } from '../utils/redact.js';

/**
 * The database connection.
 *
 * Three things are set here that `mongoose.connect(uri)` on its own does not:
 *
 * - **A server-selection timeout.** The driver's default is thirty seconds, so
 *   a database that is down turns every request into a half-minute hang and the
 *   app looks broken rather than disconnected. Ten seconds is long enough for a
 *   replica-set election and short enough that the health check fails honestly.
 * - **TLS, when the deployment has it.** Off by default because a local Mongo
 *   in Docker has no certificate and demanding one would stop development dead;
 *   on wherever the database is reached across a network, which is every
 *   deployment where it is not a container on the same host.
 * - **An auth source.** Credentials for an application user usually live in
 *   `admin` rather than in the application's own database, and getting this
 *   wrong produces an authentication failure that reads like a wrong password.
 *
 * Authentication itself is a property of the URI (`mongodb://user:pass@host`),
 * which is why there is no flag for it here. Turning it on against a database
 * that is already running is an operations task, not a code change.
 */
export async function connectDB(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    ...(env.mongoTls ? { tls: true } : {}),
    ...(env.mongoTlsCaFile ? { tlsCAFile: env.mongoTlsCaFile } : {}),
    ...(env.mongoAuthSource ? { authSource: env.mongoAuthSource } : {}),
  });

  // Masked: the URI carries the database password, and this line is printed on
  // every boot into whatever collects the container's output.
  logger.info(`MongoDB connected: ${maskMongoUri(env.mongoUri)}`);

  /*
   * Say so, once, when a production deployment is talking to its database with
   * no credentials. Not a refusal — a shop whose API will not start is worse
   * off than one whose database is behind a firewall and nothing else — but it
   * should not be possible to be in this state without having been told.
   */
  if (isProduction && !/^\w+(\+\w+)?:\/\/[^@/]+@/.test(env.mongoUri)) {
    logger.warn(
      'MongoDB has no credentials in the connection string. Anyone who can reach the ' +
        "port can read every shop's sales, customers and dues.",
    );
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export { isProduction };
