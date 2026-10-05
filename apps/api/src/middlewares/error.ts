import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { reportError } from '../integrations/errorReporter.js';
import { translateMessage } from '../i18n/messages.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      // In the screen's language — see i18n/messages. The code stays English, for the client to act on.
      message: translateMessage(err.message, req.lang),
      code: err.code,
      errors: err.details,
      data: null,
    });
  }

  logger.error({ err }, 'Unhandled error');
  // Only the unexpected ones. An AppError is the application saying no on
  // purpose — reporting those would bury the real faults under refusals.
  reportError(err, {
    userId: req.user?.id,
    orgId: req.user?.org ?? undefined,
    role: req.user?.role,
    route: `${req.method} ${req.route?.path ?? req.path}`,
  });
  return res.status(500).json({
    success: false,
    message: translateMessage('Internal server error', req.lang),
    code: 'INTERNAL',
    errors: null,
    data: null,
  });
}
