import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as support from '../services/support.service.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import { validate } from '../middlewares/validate.js';
import { ok, created } from '../utils/response.js';
import { audit } from '../services/audit.service.js';

/**
 * A shop's own conversations with Dawai support.
 *
 * Mounted at `/api/shop/support`, ahead of the shop router's admin gate, and
 * deliberately **not** behind `requireWritableTenant`: a shop whose trial has
 * lapsed is exactly the shop that most needs to reach somebody, and locking
 * the way to reach us behind the lock is how a fixable misunderstanding
 * becomes a lost customer.
 *
 * Open to every member of the shop, the salesman included: the person who
 * notices something wrong is usually the one at the counter. The shop is
 * always the signed-in user's own, never one named in the request.
 */
const router = Router();

router.use(requireAuth, requireRole(...SHOP_ROLES));

const run =
  <T>(fn: (req: Request) => Promise<T>, message?: string, status: 'ok' | 'created' = 'ok') =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(req);
      if (status === 'created') created(res, data, message);
      else ok(res, data, message);
    } catch (err) {
      next(err);
    }
  };

router.get('/', run((req) => support.listShopThreads(req.user!.org!)));

/** Just the count, for the badge in the nav. */
router.get(
  '/unread',
  run(async (req) => ({ unread: await support.shopUnreadCount(req.user!.org!) })),
);

router.post(
  '/',
  validate(
    z.object({
      subject: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(4000),
    }),
  ),
  run(
    async (req) => {
      const opened = await support.openThread(req.user!.org!, req.user!.id, req.body);
      await audit(req, 'support.create', {
        model: 'SupportThread',
        id: String(opened.thread._id),
        label: req.body.subject,
      });
      return opened;
    },
    'Sent — we will reply here',
    'created',
  ),
);

router.get('/:id', run((req) => support.readThread(req.params.id, 'shop', req.user!.org!)));

router.post(
  '/:id/messages',
  validate(z.object({ body: z.string().trim().min(1).max(4000) })),
  run(
    (req) => support.postMessage(req.params.id, 'shop', req.user!.id, req.body.body, req.user!.org!),
    'Sent',
    'created',
  ),
);

export default router;
