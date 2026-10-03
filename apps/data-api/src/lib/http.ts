import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

/** An error the caller is told about: a status, a code a program can test, and words a person can read. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** An async handler whose return value is the response's `data`. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res)
      .then((data) => {
        if (!res.headersSent) res.json({ data });
      })
      .catch(next);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({ error: { code: 'bad_request', message: `${first?.path.join('.') || 'body'}: ${first?.message ?? 'invalid'}` } });
    return;
  }
  logger.error({ err, path: req.path }, 'Request failed');
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side' } });
}
