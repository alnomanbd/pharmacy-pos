import pino from 'pino';
import { env } from '../env.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.production ? 'info' : 'debug'),
  ...(env.production || process.env.VITEST ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
