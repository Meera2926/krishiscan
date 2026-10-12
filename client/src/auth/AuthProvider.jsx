import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, onForbidden, onSessionExpired, refreshSession, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | authenticated | anonymous
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  const applySession = useCallback(
    ({ user: nextUser, accessToken }) => {
      setAccessToken(accessToken);
      setUser(nextUser);
      setStatus('authenticated');
      if (nextUser?.preferredLanguage && nextUser.preferredLanguage !== i18n.language) {
        i18n.changeLanguage(nextUser.preferredLanguage);
      }
    },
    [i18n],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((data) => !cancelled && applySession(data))
      .catch(() => !cancelled && setStatus('anonymous'));
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  // Stable, so a page can call it from an effect without re-running on every user change.
  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  // An expert suspended while a case page is open starts getting 403s from it. Reloading the account
  // lets the guards move them to their status page, instead of leaving them on a page that can now
  // only fail. At most once every ten seconds, since a page may fire several requests at once.
  const role = user?.role;
  useEffect(() => {
    if (role !== 'expert') return undefined;
    let last = 0;
    return onForbidden(() => {
      if (Date.now() - last < 10_000) return;
      last = Date.now();
      refreshUser().catch(() => {});
    });
  }, [role, refreshUser]);

  const value = useMemo(
    () => ({
      user,
      status,
      async login(credentials) {
        const { data } = await api.post('/auth/login', credentials);
        applySession(data);
        return data.user;
      },
      async register(details) {
        const { data } = await api.post('/auth/register', details);
        applySession(data);
        return data.user;
      },
      /** Takes FormData: the application carries a photo of the degree certificate. */
      async registerExpert(formData) {
        const { data } = await api.post('/auth/register-expert', formData);
        applySession(data);
        return data.user;
      },
      refreshUser,
      async logout() {
        try {
          await api.post('/auth/logout');
        } finally {
          clearSession();
        }
      },
      async updateProfile(changes) {
        const { data } = await api.patch('/auth/me', changes);
        setUser(data.user);
        return data.user;
      },
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, status, applySession, clearSession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * An expert account exists from the moment someone applies, but it must not reach a farmer's case
 * until an admin has checked the certificate. Anything other than 'verified' counts as not yet.
 */
export const isUnverifiedExpert = (user) => user?.role === 'expert' && user.expertVerification?.status !== 'verified';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
