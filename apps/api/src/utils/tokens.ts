import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../models/User.js';

export interface TokenPayload {
  sub: string;
  org: string | null | undefined;
  role: Role;
  /**
   * Set only on a support-view session. `requireAuth` refuses every write while
   * it is present — so the read-only limit lives in the token, and an ordinary
   * session cannot acquire it by accident.
   */
  imp?: boolean;
  /** The operator behind a support-view session, for the audit trail. */
  by?: string;
}

export function signAccessToken(payload: TokenPayload, expiresIn?: string): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    // A support view passes its own, much shorter life; everything else uses
    // the configured one.
    expiresIn: (expiresIn ?? env.jwt.accessExpires) as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(sub: string): string {
  return jwt.sign({ sub }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwt.refreshSecret) as { sub: string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
