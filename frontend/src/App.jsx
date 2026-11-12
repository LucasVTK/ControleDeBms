import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import MemberHome from './pages/member/MemberHome.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminQueue from './pages/admin/AdminQueue.jsx';
import AdminEntries from './pages/admin/AdminEntries.jsx';
import AdminPayments from './pages/admin/AdminPayments.jsx';
import AdminMembers from './pages/admin/AdminMembers.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Carregando…</div>;
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/membro"
          element={
            <ProtectedRoute role="MEMBRO">
              <MemberHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="fila" element={<AdminQueue />} />
          <Route path="lancamentos" element={<AdminEntries />} />
          <Route path="pagamentos" element={<AdminPayments />} />
          <Route path="membros" element={<AdminMembers />} />
        </Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
