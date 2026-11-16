import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { formatDateTime } from '../../utils.js';
import { BLOCK_LABEL, deviceLabel, ROLE_LABEL, screenLabel, timeAgo, usePolling } from './ownerUtils.js';

export default function OwnerAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [blockable, setBlockable] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api('/owner/accounts');
      setAccounts(d.accounts);
      setBlockable(d.blockable);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 10000);

  const replace = (acc) => setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)));
  const shown = accounts.filter((a) => !filter || a.role === filter);

  return (
    <div>
      <CreateAccount onCreated={(acc) => setAccounts((prev) => [...prev, acc])} />
      <section className="section">
        <div className="section-head">
          <h2>Todas as contas ({accounts.length})</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Tipo de conta">
            <option value="">Todos os tipos</option>
            <option value="ADMIN">Só admins</option>
            <option value="MEMBRO">Só membros</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Carregando…</p>}
        <div className="member-rows">
          {shown.map((a) => (
            <AccountRow key={a.id} account={a} blockable={blockable} onUpdated={replace} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CreateAccount({ onCreated }) {
  const empty = { name: '', username: '', password: '', role: 'MEMBRO' };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const d = await api('/owner/accounts', { method: 'POST', body: form });
      onCreated(d.account);
      setMsg({ type: 'success', text: `Conta ${ROLE_LABEL[d.account.role]} "${d.account.username}" criada.` });
      setForm(empty);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + Criar conta (admin ou membro)
      </button>
    );
  }
  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Criar conta</h2>
      <div className="grid-2">
        <div>
          <label htmlFor="o-name">Nome</label>
          <input id="o-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={100} />
        </div>
        <div>
          <label htmlFor="o-role">Tipo</label>
          <select id="o-role" value={form.role} onChange={set('role')}>
            <option value="MEMBRO">Membro</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label htmlFor="o-user">Login</label>
          <input id="o-user" value={form.username} onChange={set('username')} autoCapitalize="none" pattern="[a-z0-9._\-]{3,30}" required />
        </div>
        <div>
          <label htmlFor="o-pass">Senha</label>
          <input id="o-pass" type="text" autoComplete="new-password" value={form.password} onChange={set('password')} minLength={8} maxLength={72} required />
        </div>
      </div>
      {msg.text && <p className={msg.type}>{msg.text}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Fechar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Criar'}
        </button>
      </div>
    </form>
  );
}

function AccountRow({ account: a, blockable, onUpdated }) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState(''); // '' | 'senha' | 'bloqueios'
  const [password, setPassword] = useState('');
  const [blocks, setBlocks] = useState(a.blocked_actions);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const isOwner = a.role === 'DONO';

  async function call(path, method, body, okText) {
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const d = await api(path, { method, body });
      onUpdated(d.account);
      setMsg({ type: 'success', text: okText });
      return true;
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body, okText) => call(`/owner/accounts/${a.id}`, 'PATCH', body, okText);

  async function onToggle() {
    const verb = a.active ? 'desativar' : 'reativar';
    const extra = a.active ? '\nA pessoa é desconectada na hora e não consegue mais entrar.' : '';
    if (!window.confirm(`Deseja ${verb} ${a.name}?${extra}`)) return;
    await patch({ active: !a.active }, a.active ? 'Conta desativada e desconectada.' : 'Conta reativada.');
  }

  async function onLogout() {
    if (!window.confirm(`Derrubar todas as sessões de ${a.name}? Vai precisar fazer login de novo.`)) return;
    await call(`/owner/accounts/${a.id}/logout`, 'POST', undefined, 'Sessões derrubadas.');
  }

  async function onSavePassword(e) {
    e.preventDefault();
    if (await patch({ password }, 'Senha alterada (sessões antigas caíram).')) {
      setPassword('');
      setPanel('');
    }
  }

  async function onSaveBlocks() {
    if (await patch({ blocked_actions: blocks }, blocks.length ? 'Bloqueios salvos.' : 'Bloqueios removidos.')) setPanel('');
  }

  // Bloqueios que fazem sentido para o tipo de conta
  const relevant = blockable.filter((b) => (a.role === 'MEMBRO' ? b === 'LANCAR' : b !== 'LANCAR'));

  return (
    <div className={`card member-row ${a.active ? '' : 'inactive'}`}>
      <div className="member-row-main">
        <div>
          {a.online && <span className="online-dot" title="Online agora" />}
          <strong>{a.name}</strong> <span className="muted">@{a.username}</span>{' '}
          <span className={`role-chip role-${a.role.toLowerCase()}`}>{ROLE_LABEL[a.role]}</span>
          {!a.active && <span className="badge badge-inactive">Desativado</span>}
          {a.blocked_actions.length > 0 && <span className="badge badge-reprovado">Com bloqueios</span>}
          {a.fails_24h > 0 && <span className="badge badge-pendente">{a.fails_24h} falha(s) 24h</span>}
          <div className="muted small">
            {a.online ? (
              <>
                Online · na tela <strong>{screenLabel(a.last_path)}</strong>
              </>
            ) : (
              <>Visto {timeAgo(a.last_seen_at)}</>
            )}
            {' · '}último login {a.last_login_at ? formatDateTime(a.last_login_at) : 'nunca'}
          </div>
          <div className="muted small">
            {a.last_ip || 'sem IP'} · {deviceLabel(a.last_user_agent)} · {a.entries_total} lançamento(s) · desde{' '}
            {formatDateTime(a.created_at)}
          </div>
          {a.blocked_actions.length > 0 && (
            <div className="small text-fail">Bloqueado: {a.blocked_actions.map((b) => BLOCK_LABEL[b]).join(', ')}</div>
          )}
        </div>
        <div className="member-row-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dono/atividade?user_id=${a.id}&kind=all`)}>
            Atividade
          </button>
          {!isOwner && (
            <>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setBlocks(a.blocked_actions); setPanel((p) => (p === 'bloqueios' ? '' : 'bloqueios')); }}>
                Bloqueios
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPanel((p) => (p === 'senha' ? '' : 'senha'))}>
                Senha
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy || !a.active} onClick={onLogout}>
                Derrubar sessão
              </button>
              <button className={`btn btn-sm ${a.active ? 'btn-danger-ghost' : 'btn-success'}`} disabled={busy} onClick={onToggle}>
                {a.active ? 'Desativar' : 'Reativar'}
              </button>
            </>
          )}
        </div>
      </div>

      {panel === 'senha' && (
        <form className="inline-form" onSubmit={onSavePassword}>
          <input
            type="text"
            placeholder="Nova senha (mín. 8)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={72}
            required
          />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            Salvar
          </button>
        </form>
      )}

      {panel === 'bloqueios' && (
        <div className="block-panel">
          <p className="muted small">Marque o que {a.name} fica proibido de fazer (o resto continua normal):</p>
          {relevant.map((b) => (
            <label key={b} className="check">
              <input
                type="checkbox"
                checked={blocks.includes(b)}
                onChange={(e) => setBlocks((prev) => (e.target.checked ? [...prev, b] : prev.filter((x) => x !== b)))}
              />
              {BLOCK_LABEL[b]}
            </label>
          ))}
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={onSaveBlocks}>
            Salvar bloqueios
          </button>
        </div>
      )}
      {msg.text && <p className={msg.type}>{msg.text}</p>}
    </div>
  );
}
