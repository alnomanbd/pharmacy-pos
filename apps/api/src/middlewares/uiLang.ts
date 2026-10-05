import type { Request, Response, NextFunction } from 'express';

/**
 * Which language to answer in.
 *
 * The shop app sends `X-UI-Lang: bn` while its screen is in Bangla, so a
 * refusal ("That bill is already cancelled") reaches the person in the words
 * the rest of their screen is in — see i18n/messages. Anything else, the
 * console included, is answered in English.
 */
export function uiLang(req: Request, _res: Response, next: NextFunction) {
  req.lang = req.headers['x-ui-lang'] === 'bn' ? 'bn' : 'en';
  next();
}
