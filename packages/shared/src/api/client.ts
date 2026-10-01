import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';
import type { SessionResponse } from '../types';

/*
 * `withCredentials` so the refresh cookie is sent. Both apps proxy `/api` on
 * their own origin, so every call here is same-origin and the cookie is
 * host-only: the shop app cannot be handed the console's session or the other
 * way round.
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

/**
 * Bare client for the refresh call itself, so refreshing never re-enters the
 * interceptors below (which would recurse on a failing refresh).
 */
const plain = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Access tokens live 15 minutes. Without this, every request that crossed that
 * boundary logged the salesman out — mid-bill, losing the cart. On a 401
 * we spend the refresh token once and replay the original request.
 *
 * Refreshes are single-flight: a burst of parallel 401s (a page loading five
 * endpoints at once) must not each rotate the refresh token, since the server
 * invalidates the old one on use and the losers would be left holding a dead
 * token.
 *
 * Nothing is passed to the call: the refresh token is an httpOnly cookie this
 * code cannot read, which is the point of it being there.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await plain.post<{ success: boolean; data: SessionResponse }>('/auth/refresh', {});
  const payload = res.data?.data;
  if (!payload?.accessToken || !payload?.user) {
    throw new Error('Malformed refresh response');
  }

  useAuthStore.getState().setAuth(payload.user, payload.accessToken);
  return payload.accessToken;
}

/**
 * Restores the session on a cold load.
 *
 * The access token lives in memory, so a reload has none — but the refresh
 * cookie survives, and this is what trades it for a new one. Called once at
 * start-up, before anything decides whether to show the login screen: without
 * it, every refresh of the page would look like a signed-out user.
 *
 * It resolves either way. A failure here is the ordinary case of not being
 * signed in, not an error worth showing anybody.
 */
export async function restoreSession(): Promise<boolean> {
  try {
    await runRefresh();
    return true;
  } catch {
    useAuthStore.getState().logout();
    return false;
  } finally {
    useAuthStore.getState().markHydrated();
  }
}

function runRefresh(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

/** The error envelope the API returns; `errors` is Zod's flattened output. */
interface ApiErrorBody {
  message?: string;
  errors?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
}

/** `drugLicenceNo` → `Drug licence no`, `bn.name` → `Bn name` — a field name a person can read. */
function fieldLabel(path: string) {
  const last = path.split('.').pop() || path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Rewrites a validation failure into the sentence the user needs.
 *
 * The API answers a bad request with `message: 'Validation failed'` and the
 * useful part underneath, in `errors.fieldErrors` — `password: ['Use at least 8
 * characters']`. Every page in this app reads `data.message` for its toast, so
 * every page said "Validation failed" and nothing else.
 *
 * That is not a cosmetic problem. Changing a salesman's password to something too
 * short did nothing, said "Validation failed", and the next sign-in failed with
 * "invalid credentials" — the reason being sitting unread in the response body.
 *
 * Rewriting it here, once, fixes every one of those toasts rather than forty
 * catch blocks. Only the message is touched; `errors` stays as it was for any
 * caller that wants to mark up its own fields.
 */
function explainValidation(error: AxiosError) {
  const body = error.response?.data as ApiErrorBody | undefined;
  if (!body?.errors) return;

  const fields = Object.entries(body.errors.fieldErrors ?? {})
    .filter(([, messages]) => messages && messages.length > 0)
    .map(([path, messages]) => `${fieldLabel(path)}: ${messages![0]}`);

  const detail = [...(body.errors.formErrors ?? []), ...fields].filter(Boolean);
  if (detail.length === 0) return;

  // Two at most: a toast is one line, and the first thing wrong is the thing
  // to fix.
  body.message = detail.slice(0, 2).join(' · ');
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & RetriableConfig) | undefined;
    const status = error.response?.status;

    // Before anything else, so it is done whichever branch below returns.
    if (status === 400 || status === 422) explainValidation(error);

    /*
     * Whether to try the cookie. There is no refresh token in memory to test
     * for any more, so the condition is simply: this is a 401, we have not
     * already retried, and it is not the refresh or login call itself.
     */
    const shouldRefresh =
      status === 401 &&
      config &&
      !config._retried &&
      !config.url?.includes('/auth/refresh') &&
      !config.url?.includes('/auth/login');

    if (!shouldRefresh) {
      // A 401 we will not retry, with a session in hand: that session is over.
      if (status === 401 && useAuthStore.getState().accessToken) {
        useAuthStore.getState().logout();
      }
      return Promise.reject(error);
    }

    config._retried = true;
    try {
      const accessToken = await runRefresh();
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
      return api.request(config);
    } catch {
      // The refresh token is spent or revoked — this is a real sign-out.
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }
  },
);

export const getData = <T>(promise: Promise<{ data: { success: boolean; data: T } }>): Promise<T> =>
  promise.then((r) => r.data.data);

export default api;
