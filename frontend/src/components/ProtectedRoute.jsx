import { Navigate, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth.jsx';

/** Bloqueia a rota para quem não está logado ou não tem o papel exigido. */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return children;
}
