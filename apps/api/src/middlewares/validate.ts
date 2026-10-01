import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { badRequest } from '../utils/AppError.js';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest('Validation failed', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}
