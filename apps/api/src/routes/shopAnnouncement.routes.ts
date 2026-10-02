import { Router } from 'express';
import { forShop } from '../services/announcement.service.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import { ok } from '../utils/response.js';

/**
 * The team's announcements for this shop: live, and aimed at its plan.
 *
 * Mounted at `/api/shop/announcements` ahead of the shop router's admin gate,
 * for every role, and not behind the read-only lock — "your trial has ended"
 * and "maintenance tonight" are for the counter as much as the owner.
 */
const router = Router();

router.use(requireAuth, requireRole(...SHOP_ROLES));

router.get('/', async (req, res, next) => {
  try {
    ok(res, await forShop(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

export default router;
