import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { formatDateTime } from '../../utils.js';
import { timeAgo } from './ownerUtils.js';

export default function OwnerSecurity() {
  return (
    <div>
      <BlockedIps />
      <MyPassword />
    </div>
  );
}

function BlockedIps() {
  const [items, setItems] = useState([]);
  const [myIp, setMyIp] = useState('');
  const [form, setForm] = useState({ ip: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    try {
      const d = await api('/owner/blocked-ips');
      setItems(d.items);
      setMyIp(d.myIp);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function onBlock(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      await api('/owner/blocked-ips', { method: 'POST', body: form });
      setForm({ ip: '', reason: '' });
      setMsg({ type: 'success', text: 'IP bloqueado.' });
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function onUnblock(ip) {
    if (!window.confirm(`Desbloquear ${ip}?`)) return;
    try {
      await api('/owner/blocked-ips', { method: 'DELETE', body: { ip } });
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <section className="section">
      <h2>IPs bloqueados</h2>
      <p className="muted small">
        Quem estiver num IP bloqueado não consegue usar nada do site (nem a tela de login). Seu IP agora: <strong>{myIp}</strong>
      </p>
      <form className="card inline-form" onSubmit={onBlock}>
        <input placeholder="IP (ex.: 177.10.20.30)" value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value.trim() }))} required />
        <input placeholder="Motivo (opcional)" value={form.reason} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        <button className="btn btn-danger btn-sm" disabled={busy}>
          Bloquear
        </button>
      </form>
      {msg.text && <p className={msg.type}>{msg.text}</p>}
      {items.length === 0 ? (
        <p className="empty">Nenhum IP bloqueado.</p>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>IP</th>
                <th className="hide-sm">Motivo</th>
                <th className="num">Tentativas barradas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.ip}>
                  <td>
                    {b.ip}
                    <div className="muted small">desde {formatDateTime(b.created_at)}</div>
                  </td>
                  <td className="hide-sm small">{b.reason || '—'}</td>
                  <td className="num">
                    {b.hits}
                    {b.last_hit_at && <div className="muted small">última {timeAgo(b.last_hit_at)}</div>}
                  </td>
                  <td className="num">
                    <button className="btn btn-ghost btn-sm" onClick={() => onUnblock(b.ip)}>
                      Desbloquear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MyPassword() {
  const { replaceToken } = useAuth();
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setMsg({ type: 'error', text: 'A confirmação não bate com a nova senha.' });
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const d = await api('/owner/me/password', { method: 'POST', body: { current: form.current, password: form.password } });
      replaceToken(d.token);
      setForm({ current: '', password: '', confirm: '' });
      setMsg({ type: 'success', text: 'Senha trocada. Outros aparelhos logados na sua conta foram desconectados.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <form className="card" onSubmit={onSubmit}>
        <h2>Minha senha</h2>
        <label htmlFor="p-cur">Senha atual</label>
        <input id="p-cur" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />
        <div className="grid-2">
          <div>
            <label htmlFor="p-new">Nova senha</label>
            <input id="p-new" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} minLength={8} maxLength={72} required />
          </div>
          <div>
            <label htmlFor="p-conf">Repita a nova senha</label>
            <input id="p-conf" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} minLength={8} maxLength={72} required />
          </div>
        </div>
        {msg.text && <p className={msg.type}>{msg.text}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </section>
  );
}
