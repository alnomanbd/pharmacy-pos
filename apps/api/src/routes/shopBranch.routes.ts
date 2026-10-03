import { Router } from 'express';
import { z } from 'zod';
import * as branches from '../services/branch.service.js';
import { requireAuth, requireRole, requireWritableTenant, requireShopPermission } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import { validate } from '../middlewares/validate.js';
import { ok, created } from '../utils/response.js';
import { audit } from '../services/audit.service.js';

/**
 * A shop's branches. Everybody in the shop may read the list — the branch
 * switcher needs it — and only the owner opens, renames or closes one, since
 * a branch is part of what the shop pays for.
 */
const router = Router();
router.use(requireAuth, requireRole(...SHOP_ROLES));

router.get('/', async (req, res, next) => {
  try {
    ok(res, await branches.branchesPage(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

const branchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
});

router.post('/', requireWritableTenant, requireShopPermission('branches.manage'), validate(branchSchema), async (req, res, next) => {
  try {
    const b = await branches.createBranch(req.user!.org!, req.body);
    await audit(req, 'organization.update', { model: 'Branch', id: String(b._id), label: b.name }, { after: { action: 'branch.create' } });
    created(res, b, 'Branch opened');
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requireWritableTenant,
  requireShopPermission('branches.manage'),
  validate(branchSchema.partial().extend({ active: z.boolean().optional() })),
  async (req, res, next) => {
    try {
      const b = await branches.updateBranch(req.user!.org!, req.params.id, req.body);
      await audit(req, 'organization.update', { model: 'Branch', id: req.params.id, label: b.name }, { after: { action: 'branch.update', ...req.body } });
      ok(res, b, 'Branch saved');
    } catch (err) {
      next(err);
    }
  },
);

export default router;
