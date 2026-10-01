import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { OWNER_ROLES } from '../types/roles.js';
import { requireOrgAdmin } from '../services/authz.service.js';
import { validate } from '../middlewares/validate.js';
import { createUserSchema, updateUserSchema, updateMeSchema } from '../validators/auth.validator.js';
import { organizationUpdateSchema } from '../validators/organization.validator.js';

const router = Router();

router.use(requireAuth);

/**
 * Staff and shop settings belong to the account that signed up.
 *
 * The role is not enough to decide this: `admin` is what the owner registers as
 * *and* what a trusted manager can be added with. Without the ownership check a
 * manager could rename the shop or add and remove the owner's staff.
 * `requireOrgAdmin` passes the owner (they are `Organization.owner`) and the
 * co-administrators they appointed.
 */
const orgAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    await requireOrgAdmin({ id: req.user!.id, role: req.user!.role, org: req.user!.org });
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * The person themselves, or the shop's administrator.
 *
 * Written as a guard rather than a check inside the handler so it is impossible
 * to add another `/:id` route below and forget it.
 */
const selfOrOrgAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.params.id !== req.user!.id) {
      await requireOrgAdmin({ id: req.user!.id, role: req.user!.role, org: req.user!.org });
    }
    next();
  } catch (err) {
    next(err);
  }
};

router.get('/', requireRole(...OWNER_ROLES), userController.listUsers);
router.post('/', requireRole(...OWNER_ROLES), orgAdmin, validate(createUserSchema), userController.createUser);
// Before /:id so the literal path is not swallowed by the id parameter.
router.get('/audit-log', requireRole(...OWNER_ROLES), userController.auditTrail);
router.get('/organization/me', userController.getOrg);
/*
 * The shop's seats. Any member may read it — see the controller.
 *
 * Before `/:id`, like the rest of the literal paths here.
 */
router.get('/organization/usage', userController.getOrgUsage);
// Renaming the shop, its address and logo — the owner's.
// Validated, and strictly: the organisation document also holds `status`,
// `plan` and `subscription`, and this used to `$set` whatever it was given.
router.patch(
  '/organization/me',
  orgAdmin,
  validate(organizationUpdateSchema),
  userController.updateOrg,
);
/**
 * Your own profile: readable and writable by you, whatever your role.
 *
 * Before `/:id`, so `me` is not read as an id. Guarded by nothing but
 * `requireAuth` on purpose — the id comes from the token, never the URL, so
 * there is no request that can address somebody else's record here. What may
 * be changed is `updateMeSchema`'s business: no role, no email, no password.
 */
router.patch('/me', validate(updateMeSchema), userController.updateMe);

/**
 * Somebody's profile.
 *
 * `selfOrOrgAdmin` rather than `orgAdmin`: a member of staff may read their own
 * profile — which is the common case — and an administrator may read anyone's
 * in the shop. The service scopes
 * every read to the organization regardless.
 */
router.get('/:id', selfOrOrgAdmin, userController.getUser);

router.patch('/:id', requireRole(...OWNER_ROLES), orgAdmin, validate(updateUserSchema), userController.updateUser);
router.delete('/:id', requireRole(...OWNER_ROLES), orgAdmin, userController.removeUser);

export default router;
