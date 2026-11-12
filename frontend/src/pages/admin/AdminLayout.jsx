import { NavLink, Outlet } from 'react-router-dom';
import { useNotifications } from '../../components/Layout.jsx';

export default function AdminLayout() {
  const { count } = useNotifications();
  const tabs = [
    { to: '/admin', label: 'Painel', end: true },
    { to: '/admin/fila', label: 'Fila', badge: count },
    { to: '/admin/lancamentos', label: 'Lançamentos' },
    { to: '/admin/pagamentos', label: 'Pagamentos' },
    { to: '/admin/membros', label: 'Membros' },
  ];
  return (
    <div>
      <nav className="tabs">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
            {t.badge > 0 && <span className="tab-badge">{t.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
