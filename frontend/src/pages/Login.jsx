import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (user) return <Navigate to={homePathFor(user)} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(username, password);
      const from = location.state?.from;
      const home = homePathFor(u);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <span className="login-credit">por Lucas Veteka</span>
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <span className="brand-logo brand-logo-lg">BM</span>
          <h1>Controle de Produção</h1>
          <p className="muted">Entre com sua conta</p>
        </div>
        <label htmlFor="username">Login</label>
        <input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <footer className="site-footer">Feito por Lucas Veteka</footer>
    </div>
  );
}
