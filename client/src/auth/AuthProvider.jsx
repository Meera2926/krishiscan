import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, onSessionExpired, refreshSession, setAccessToken } from '../api/client.js';

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
    [user, status, applySession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
