import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    tokenStore.set(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  // Troca o token desta aba (ex.: depois de o dono trocar a própria senha)
  const replaceToken = useCallback((token) => tokenStore.set(token), []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, replaceToken }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

const HOME_BY_ROLE = { DONO: '/dono', ADMIN: '/admin', MEMBRO: '/membro' };
export const homePathFor = (user) => HOME_BY_ROLE[user?.role] || '/membro';
