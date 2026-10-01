/**
 * The API calls both apps make.
 *
 * Everything here is either authentication — which the shop app and the
 * operator console both do, against the same endpoints — or a file helper the
 * two share. Anything belonging to one app's job lives in that app: the shop's
 * calls in `apps/shop/src/api.ts`, the console's in `apps/console/src/api.ts`.
 */
import api, { getData } from './client';
import { useAuthStore } from '../store/auth.store';
import type {
  SessionResponse,
  AuthUser,
} from '../types';

export const authApi = {
  /** `twoFactorCode` is only sent after the server has asked for it. */
  login: (email: string, password: string, twoFactorCode?: string) =>
    getData<SessionResponse>(api.post('/auth/login', { email, password, twoFactorCode })),
  me: () => getData<AuthUser>(api.get('/auth/me')),
  /** The token is the credential — this is opened without a session. */
  verifyEmail: (token: string) =>
    getData<{ email: string }>(api.post('/auth/verify-email', { token })),
  resendEmailVerification: () => getData<null>(api.post('/auth/verify-email/resend')),
  /** Always resolves whether or not the email is registered, by design. */
  forgotPassword: (email: string) => getData<null>(api.post('/auth/forgot-password', { email })),
  resetPassword: (token: string, newPassword: string) =>
    getData<null>(api.post('/auth/reset-password', { token, newPassword })),
  changePassword: (currentPassword: string, newPassword: string) =>
    getData<null>(api.post('/auth/change-password', { currentPassword, newPassword })),
};

/**
 * Fetches a stored file.
 *
 * Uploads are never served statically — the key is authorised against the
 * caller's shop first — so an <img> cannot point at one directly. This returns
 * an object URL to use as `src`; revoke it when the component unmounts.
 */
export async function fileObjectUrl(key: string): Promise<string> {
  const res = await api.get(`/files/${key}`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}

/** Hands a blob to the browser as a download, then releases the object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A second factor on one's own account. */
export const twoFactorApi = {
  status: () =>
    getData<{ enabled: boolean; recoveryCodesLeft: number; required: boolean }>(
      api.get('/two-factor'),
    ),
  setup: () =>
    getData<{ secret: string; qrDataUrl: string; manualEntry: string }>(
      api.post('/two-factor/setup'),
    ),
  /** The recovery codes come back once — they are stored only as hashes. */
  confirm: (code: string) =>
    getData<{ recoveryCodes: string[] }>(api.post('/two-factor/confirm', { code })),
  disable: (code: string) => getData<null>(api.post('/two-factor/disable', { code })),
};

/** One device this account is signed in on. */
export interface SignedInSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  userAgent: string;
  /** The session making the request. It cannot end itself from the list. */
  current: boolean;
}

/**
 * Your own sessions.
 *
 * Every signed-in user reaches these, not just an administrator: the person who
 * left a browser open at the counter is the one who has to close it.
 */
export const sessionsApi = {
  list: () => getData<SignedInSession[]>(api.get('/auth/sessions')),
  revoke: (id: string) => getData<null>(api.delete(`/auth/sessions/${id}`)),
  revokeOthers: () => getData<{ ended: number }>(api.delete('/auth/sessions')),
};

/**
 * Signs out on both sides.
 *
 * Clearing the store alone used to be enough, because the session lived there.
 * It does not any more: the refresh cookie would outlive the click, so the
 * server has to be told to revoke the token and clear it. The call is allowed
 * to fail — a network error must not leave somebody stuck on a screen they
 * asked to leave — but the local session goes either way.
 */
export async function signOut(): Promise<void> {
  try {
    await api.post('/auth/logout', {});
  } catch {
    // Already expired, or offline. Nothing useful to say about it.
  }
  useAuthStore.getState().logout();
}
