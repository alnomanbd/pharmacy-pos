import { Router } from 'express';
import * as help from '../services/help.service.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import { ok } from '../utils/response.js';

/**
 * The help articles, for everybody in the shop and while read-only — the
 * salesman at the counter is the one most likely to need them.
 */
const router = Router();
router.use(requireAuth, requireRole(...SHOP_ROLES));

router.get('/', async (_req, res, next) => {
  try {
    ok(res, await help.publishedList());
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    ok(res, await help.publishedOne(req.params.slug));
  } catch (err) {
    next(err);
  }
});

export default router;
