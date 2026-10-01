import pino from 'pino';
import { isProduction } from '../config/env.js';
import { REDACT_PATHS } from './redact.js';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  /*
   * Blanked before anything is written, in every environment.
   *
   * Not only in production: a developer's log file is the one most likely to be
   * pasted into a chat window or attached to an issue. See utils/redact.ts for
   * what is on the list and why.
   */
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  },
});
