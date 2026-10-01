import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import medicineRoutes from './medicine.routes.js';
import platformRoutes from './platform.routes.js';
import fileRoutes from './file.routes.js';
import billingRoutes from './billing.routes.js';
import twoFactorRoutes from './twoFactor.routes.js';
import publicRoutes from './public.routes.js';
import shopRoutes from './shop.routes.js';
import tillRoutes from './till.routes.js';

/**
 * The Dawai API. One product — the medicine shop — so every route here is the
 * shop's own: its account, its catalogue search, its back room (`/shop`), its
 * counter (`/till`), its subscription, and the operator console (`/platform`).
 */
const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/medicines', medicineRoutes);
router.use('/platform', platformRoutes);
router.use('/files', fileRoutes);
router.use('/billing', billingRoutes);
router.use('/two-factor', twoFactorRoutes);
router.use('/public', publicRoutes);
router.use('/shop', shopRoutes);
router.use('/till', tillRoutes);

export default router;
