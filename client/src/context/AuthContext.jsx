import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { setUnauthorizedHandler } from '../services/api';
import { authService } from '../services/auth.service';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' until the first /auth/me resolves, so routes don't flash the login page.
  const [status, setStatus] = useState('loading');
  const [sessionExpired, setSessionExpired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await authService.me();
      setUser(me);
      setStatus('authenticated');
      return me;
    } catch {
      setUser(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any 401 from a protected call means the session is gone (expired, revoked, deactivated).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser((current) => {
        if (current) setSessionExpired(true);
        return null;
      });
      setStatus('anonymous');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { user: loggedIn } = await authService.login(identifier, password);
    setUser(loggedIn);
    setStatus('authenticated');
    setSessionExpired(false);
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
      login,
      logout,
      refresh,
      setUser,
    }),
    [user, status, sessionExpired, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
