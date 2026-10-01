import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ok } from '../utils/response.js';
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  twoFactorStatus,
} from '../services/twoFactor.service.js';

/**
 * Two-factor authentication for one's own account.
 *
 * Always about the caller — there is no route that turns it on for somebody
 * else, because the person who has to hold the phone is the person setting it
 * up.
 */
const router = Router();

router.use(requireAuth);

const codeSchema = z.object({ code: z.string().trim().min(4).max(20) });

router.get('/', async (req, res, next) => {
  try {
    ok(res, await twoFactorStatus(req.user!.id));
  } catch (err) {
    next(err);
  }
});

router.post('/setup', async (req, res, next) => {
  try {
    ok(res, await beginTwoFactorSetup(req.user!.id));
  } catch (err) {
    next(err);
  }
});

router.post('/confirm', validate(codeSchema), async (req, res, next) => {
  try {
    // The recovery codes come back once. They are stored only as hashes, so
    // this response is the only time anyone will see them.
    ok(res, await confirmTwoFactorSetup(req.user!.id, req.body.code), 'Two-factor is on');
  } catch (err) {
    next(err);
  }
});

router.post('/disable', validate(codeSchema), async (req, res, next) => {
  try {
    await disableTwoFactor(req.user!.id, req.body.code);
    ok(res, null, 'Two-factor is off');
  } catch (err) {
    next(err);
  }
});

export default router;
