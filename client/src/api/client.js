import axios from 'axios';

// The access token lives only in memory. The long-lived refresh token is an httpOnly cookie
// that JavaScript cannot read, so an XSS bug cannot steal a persistent session.
let accessToken = null;
let refreshing = null;
const listeners = new Set();

export const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 60_000 });

export function setAccessToken(token) {
  accessToken = token;
}

/** Notified when the session ends involuntarily (refresh failed), so the UI can log out. */
export function onSessionExpired(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const forbiddenListeners = new Set();

/**
 * Notified on every 403. The account's standing can change under an open page (an expert suspended
 * mid-session gets 403s from pages that worked a minute ago), and the UI needs to find out.
 */
export function onForbidden(listener) {
  forbiddenListeners.add(listener);
  return () => forbiddenListeners.delete(listener);
}

// Calls that must not trigger a refresh-and-retry: signing in or out, and the refresh itself.
// /auth/me is not one of them; it is an ordinary signed-in call and expires like any other.
const NO_REFRESH = /^\/auth\/(login|register|register-expert|refresh|logout)$/;

/** Single-flight: concurrent 401s share one refresh request instead of racing. */
export function refreshSession() {
  refreshing ??= axios
    .post('/api/auth/refresh', null, { withCredentials: true })
    .then(({ data }) => {
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config: original, response } = error;
    const isAuthCall = NO_REFRESH.test(original?.url ?? '');
    if (response?.status === 403) forbiddenListeners.forEach((l) => l(error));
    if (response?.status === 401 && original && !original._retried && !isAuthCall && accessToken) {
      original._retried = true;
      try {
        await refreshSession();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        accessToken = null;
        listeners.forEach((l) => l());
      }
    }
    return Promise.reject(error);
  },
);

/** Pulls a human-readable message (and field errors) out of an API error. */
export function describeError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return { message: fallback, fields: {} };
  if (error.code === 'ECONNABORTED') return { message: 'The request timed out. Check your connection and try again.', fields: {} };
  if (!error.response) return { message: 'Cannot reach the server. Check your internet connection.', fields: {} };
  const body = error.response.data?.error;
  return { message: body?.message ?? fallback, fields: body?.details ?? {} };
}
