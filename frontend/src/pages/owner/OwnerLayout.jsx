import { NavLink, Outlet } from 'react-router-dom';

export default function OwnerLayout() {
  const tabs = [
    { to: '/dono', label: 'Ao vivo', end: true },
    { to: '/dono/atividade', label: 'Atividade' },
    { to: '/dono/contas', label: 'Contas' },
    { to: '/dono/seguranca', label: 'Segurança' },
    { to: '/admin', label: 'Painel admin →', end: true },
  ];
  return (
    <div className="owner">
      <nav className="tabs">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
