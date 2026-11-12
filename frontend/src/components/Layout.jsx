import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { homePathFor, useAuth } from '../auth.jsx';

const NotificationsContext = createContext({ count: 0, refresh: () => {}, markRead: () => {} });
export const useNotifications = () => useContext(NotificationsContext);

const POLL_MS = 30_000;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const isAdmin = user.role === 'ADMIN';

  const refresh = useCallback(() => {
    api('/notifications/count')
      .then((d) => setCount(d.count))
      .catch(() => {});
  }, []);

  const markRead = useCallback(async () => {
    if (isAdmin) return;
    await api('/notifications/read', { method: 'POST' }).catch(() => {});
    setCount(0);
  }, [isAdmin]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  function onBellClick() {
    if (isAdmin) {
      navigate('/admin/fila');
    } else {
      navigate('/membro#historico');
      document.getElementById('historico')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  const bellTitle = isAdmin
    ? `${count} lançamento(s) aguardando avaliação`
    : `${count} lançamento(s) avaliado(s) que você ainda não viu`;

  return (
    <NotificationsContext.Provider value={{ count, refresh, markRead }}>
      <header className="topbar">
        <Link to={homePathFor(user)} className="brand">
          <span className="brand-logo">BM</span>
          <span className="brand-stack">
            <span className="brand-text">Produção</span>
            <span className="brand-credit">por Lucas Veteka</span>
          </span>
        </Link>
        <div className="topbar-right">
          <button className="bell" onClick={onBellClick} title={bellTitle} aria-label={bellTitle}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"
              />
            </svg>
            {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
          </button>
          <span className="user-name" title={user.username}>
            {user.name}
            {isAdmin && <small className="role-tag">admin</small>}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="site-footer">Feito por Lucas Veteka</footer>
    </NotificationsContext.Provider>
  );
}
