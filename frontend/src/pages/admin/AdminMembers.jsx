import { useState } from 'react';
import { api } from '../../api.js';
import { useMembers } from '../../useMembers.js';
import { formatDateTime } from '../../utils.js';

export default function AdminMembers() {
  const { members, setMembers, loading, error, replace } = useMembers();
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [flash, setFlash] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onCreate(e) {
    e.preventDefault();
    setFormError('');
    setFlash('');
    setBusy(true);
    try {
      const d = await api('/users', { method: 'POST', body: form });
      setMembers((prev) => [...prev, d.member].sort((a, b) => a.name.localeCompare(b.name)));
      setFlash(`Membro "${d.member.name}" cadastrado. Login: ${d.member.username}`);
      setForm({ name: '', username: '', password: '' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="members-page">
      <form className="card" onSubmit={onCreate}>
        <h2>Cadastrar membro</h2>
        <label htmlFor="m-name">Nome</label>
        <input id="m-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={100} />
        <div className="grid-2">
          <div>
            <label htmlFor="m-user">Login</label>
            <input
              id="m-user"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
              autoCapitalize="none"
              autoCorrect="off"
              pattern="[a-z0-9._\-]{3,30}"
              title="3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _"
              required
            />
          </div>
          <div>
            <label htmlFor="m-pass">Senha</label>
            <input
              id="m-pass"
              type="text"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              minLength={6}
              maxLength={72}
              required
            />
          </div>
        </div>
        {formError && <p className="error">{formError}</p>}
        {flash && <p className="success">{flash}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Salvando…' : 'Cadastrar'}
        </button>
      </form>

      <section className="section">
        <h2>Membros ({members.length})</h2>
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Carregando…</p>}
        <div className="member-rows">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} onUpdated={replace} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MemberRow({ member, onUpdated }) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  async function patch(body, okText) {
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const d = await api(`/users/${member.id}`, { method: 'PATCH', body });
      onUpdated(d.member);
      setMsg({ type: 'success', text: okText });
      return true;
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onToggle() {
    const action = member.active ? 'desativar' : 'reativar';
    if (!window.confirm(`Deseja ${action} ${member.name}?`)) return;
    await patch({ active: !member.active }, member.active ? 'Membro desativado.' : 'Membro reativado.');
  }

  async function onResetPassword(e) {
    e.preventDefault();
    if (await patch({ password }, 'Senha alterada.')) {
      setResetting(false);
      setPassword('');
    }
  }

  return (
    <div className={`card member-row ${member.active ? '' : 'inactive'}`}>
      <div className="member-row-main">
        <div>
          <strong>{member.name}</strong> <span className="muted">@{member.username}</span>
          {!member.active && <span className="badge badge-inactive">Desativado</span>}
          <div className="muted small">Desde {formatDateTime(member.createdAt)}</div>
        </div>
        <div className="member-row-actions">
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetting((v) => !v)}>
            Alterar senha
          </button>
          <button
            className={`btn btn-sm ${member.active ? 'btn-danger-ghost' : 'btn-success'}`}
            disabled={busy}
            onClick={onToggle}
          >
            {member.active ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      </div>
      {resetting && (
        <form className="inline-form" onSubmit={onResetPassword}>
          <input
            type="text"
            placeholder="Nova senha (mín. 6)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            maxLength={72}
            required
          />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            Salvar
          </button>
        </form>
      )}
      {msg.text && <p className={msg.type}>{msg.text}</p>}
    </div>
  );
}
