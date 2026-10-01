import type { Response } from 'express';

export function ok(res: Response, data: unknown, message = 'Success') {
  return res.json({ success: true, message, data });
}

export function created(res: Response, data: unknown, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

export function noContent(res: Response) {
  return res.status(204).json({ success: true, message: 'No content', data: null });
}
