import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { z } from 'zod';
import { claimImpersonation } from '../services/impersonation.service.js';
import { ok } from '../utils/response.js';
import { limitReply } from '../i18n/messages.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

/**
 * Password reset is tighter than the rest of /api/auth: each request costs an
 * SMS, and both endpoints are guessing surfaces (addresses on forgot, tokens on
 * reset). Keyed on IP, which is all an unauthenticated caller gives us.
 */
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitReply('Too many attempts. Please try again later.'),
});

router.post('/register', validate(registerSchema), authController.register);
// Confirming an address needs the token, not a session — the link is opened in
// whatever browser the mail was read in.
router.post('/verify-email', authController.verifyEmail);
router.post('/login', validate(loginSchema), authController.login);

/**
 * Where the shop app trades a support-view code for its read-only session.
 *
 * No credentials, because the caller has none yet: the code in the body is the
 * credential, it works once and for a minute, and `/api/auth` already carries
 * the tightest rate limit in the app.
 */
router.post(
  '/impersonation/claim',
  validate(z.object({ code: z.string().trim().regex(/^[a-f0-9]{64}$/) })),
  async (req, res, next) => {
    try {
      ok(res, await claimImpersonation(req.body.code), 'Support view opened');
    } catch (err) {
      next(err);
    }
  },
);
router.post('/refresh', validate(refreshSchema), authController.refresh);
// Signing out is audited, so the actor has to be known — requireAuth supplies it.
router.post('/logout', requireAuth, validate(logoutSchema), authController.logout);
router.post(
  '/forgot-password',
  resetLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  resetLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  authController.changePassword,
);
router.get('/me', requireAuth, authController.me);

/*
 * Sessions: what this account is signed in on, and ending them.
 *
 * Deliberately reachable by every signed-in user rather than by an
 * administrator. The person who needs to end a session is the person who left a
 * browser open at the counter, and asking them to raise a support ticket for it
 * means it does not get done.
 */
router.get('/sessions', requireAuth, authController.listSessions);
router.delete('/sessions', requireAuth, authController.revokeOtherSessions);
router.delete('/sessions/:id', requireAuth, authController.revokeSession);
router.post('/verify-email/resend', requireAuth, authController.resendEmailVerification);

export default router;
