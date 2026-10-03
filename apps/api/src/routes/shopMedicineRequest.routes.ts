import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as requests from '../services/medicineRequest.service.js';
import { requireAuth, requireRole, requireWritableTenant } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import { validate } from '../middlewares/validate.js';
import { medicineRequestSchema } from '../validators/catalogue.validator.js';
import { ok, created } from '../utils/response.js';
import { audit } from '../services/audit.service.js';

/**
 * A shop asking for a medicine the catalogue does not have.
 *
 * Mounted at `/api/shop/medicine-requests`, ahead of the shop router's admin
 * gate: the salesman is the one most likely to be holding a strip the search
 * cannot find, and asking costs the shop nothing. The shop is always the
 * signed-in user's own, never one named in the body.
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

router.get('/', run((req) => requests.listOwnRequests(req.user!.org!)));

router.post(
  '/',
  requireWritableTenant,
  validate(medicineRequestSchema),
  run(
    async (req) => {
      const request = await requests.createRequest(
        { org: req.user!.org!, id: req.user!.id },
        req.body,
      );
      // On the shop's own Activity page, under the person who asked.
      await audit(req, 'medicine.request', {
        model: 'MedicineRequest',
        id: request?._id,
        label: [req.body.brandName, req.body.strength].filter(Boolean).join(' '),
      });
      return request;
    },
    'Request sent',
    'created',
  ),
);

router.delete(
  '/:id',
  run(
    (req) =>
      requests.withdrawRequest(
        {
          org: req.user!.org!,
          id: req.user!.id,
          canManage: (req.user!.shopPermissions ?? []).includes('stock.manage'),
        },
        req.params.id,
      ),
    'Request withdrawn',
  ),
);

export default router;
