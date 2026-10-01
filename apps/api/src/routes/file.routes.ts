import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireWritableTenant } from '../middlewares/auth.js';
import { forbidden } from '../utils/AppError.js';
import { ok } from '../utils/response.js';
import {
  storage,
  keys,
  assertAllowed,
  organizationOfKey,
  mimeTypeOfKey,
  UPLOAD_RULES,
} from '../services/storage.service.js';
import { UserModel, OrganizationModel } from '../models/index.js';
import { audit } from '../services/audit.service.js';
import { isOrgAdmin } from '../services/authz.service.js';

/**
 * Uploading and serving files.
 *
 * Nothing here is static. These are shop logos and staff photos — a public
 * `uploads/` directory would serve any of them to
 * anyone who guessed a filename, so every read goes through `GET /files/*` and
 * is authorised against the organization named in the key itself.
 */
const router = Router();

// Held in memory, then written by the storage provider: the file has to be
// validated (type, size, who is asking) before anything lands on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_RULES.document.maxBytes, files: 1 },
});

router.use(requireAuth);

/* ------------------------------- uploads ---------------------------------- */

/** The shop's own logo — printed on its bills and invoices. */
router.post(
  '/organization/logo',
  requireWritableTenant,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw forbidden('No file was uploaded');
      const actor = { id: req.user!.id, role: req.user!.role, org: req.user!.org };
      if (!(await isOrgAdmin(actor))) throw forbidden('Only the shop owner can change the logo');

      assertAllowed('image', req.file);
      const stored = await storage.save(keys.orgLogo(req.user!.org!), req.file);

      const org = await OrganizationModel.findById(req.user!.org).select('logo');
      const previous = org?.logo;
      org?.set('logo', stored.key);
      await org?.save();
      // Replaced, not accumulated: a shop changing its logo four times should
      // not leave four files behind.
      if (previous && previous !== stored.key) await storage.remove(previous).catch(() => undefined);

      // It prints at the top of every bill and invoice the shop issues.
      await audit(req, 'file.upload', {
        model: 'Organization',
        id: req.user!.org!,
        label: 'Logo',
      });

      ok(res, stored, 'Logo updated');
    } catch (err) {
      next(err);
    }
  },
);

/**
 * A staff member's photo.
 *
 * Anyone may set their own; only the shop owner may set somebody else's.
 */
router.post(
  '/users/:id/photo',
  requireWritableTenant,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw forbidden('No file was uploaded');
      const actor = { id: req.user!.id, role: req.user!.role, org: req.user!.org };
      const isSelf = req.params.id === req.user!.id;
      if (!isSelf && !(await isOrgAdmin(actor))) {
        throw forbidden('Only the shop owner can change another user’s photo');
      }

      assertAllowed('image', req.file);

      const user = await UserModel.findOne({ _id: req.params.id, organization: req.user!.org });
      if (!user) throw forbidden('That user is not in this shop');

      const stored = await storage.save(keys.userPhoto(req.user!.org!, req.params.id), req.file);

      const previous = user.get('photo') as string | undefined;
      user.set('photo', stored.key);
      await user.save();
      if (previous && previous !== stored.key) await storage.remove(previous).catch(() => undefined);

      await audit(req, 'file.upload', {
        model: 'User',
        id: req.params.id,
        label: `${user.name} — photo`,
      });

      ok(res, stored, 'File uploaded');
    } catch (err) {
      next(err);
    }
  },
);

/* -------------------------------- reads ----------------------------------- */

/**
 * Serves a stored file.
 *
 * The key carries its own tenancy (`org/<id>/...`), so authorisation is one
 * comparison and cannot be forgotten by whoever adds the next upload kind.
 */
router.get('/*', async (req, res, next) => {
  try {
    const key = (req.params as unknown as { 0: string })[0];
    if (!key) throw forbidden('No file requested');

    const owner = organizationOfKey(key);
    const isPlatform = req.user!.role === 'platformAdmin';

    if (owner && owner !== req.user!.org && !isPlatform) {
      // Deliberately the same shape as any other refusal: whether a file exists
      // in another shop is itself information.
      throw forbidden('Not found');
    }
    if (!owner && !isPlatform) throw forbidden('Not found');

    const buffer = await storage.read(key);
    res.setHeader('Content-Type', mimeTypeOfKey(key));
    // Health data: never cached by a proxy on the way.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
