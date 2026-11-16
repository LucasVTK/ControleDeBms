import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { formatDateTime } from '../../utils.js';
import { actionTitle, blockedLabel, deviceLabel, detailsText, ROLE_LABEL, usePolling } from './ownerUtils.js';

/** Lista de linhas do registro de atividade (usada aqui e no "Ao vivo"). */
export function ActivityList({ items, onUser, onIp }) {
  if (!items.length) return <p className="empty">Nada registrado ainda.</p>;
  return (
    <div className="card table-card">
      <table className="table activity-table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Quem</th>
            <th>O quê</th>
            <th className="hide-sm">IP / aparelho</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const failed = a.status >= 400;
            return (
              <tr key={a.id} className={failed ? 'row-fail' : a.action === 'tela' ? 'row-screen' : ''}>
                <td className="nowrap small">{formatDateTime(a.created_at)}</td>
                <td>
                  {a.user_id ? (
                    <button className="link-btn" onClick={() => onUser?.(a.user_id)} title="Ver só esta conta">
                      {a.user_name}
                    </button>
                  ) : (
                    <span className="muted">desconhecido</span>
                  )}
                  {a.role && <span className={`role-chip role-${a.role.toLowerCase()}`}>{ROLE_LABEL[a.role]}</span>}
                </td>
                <td>
                  <strong className={failed ? 'text-fail' : ''}>{actionTitle(a)}</strong>
                  {failed && (
                    <span className="status-chip" title={`Código ${a.status}`}>
                      {blockedLabel(a.status)}
                    </span>
                  )}
                  <div className="muted small">{detailsText(a)}</div>
                  <div className="muted small show-sm">
                    {a.ip} · {deviceLabel(a.user_agent)}
                  </div>
                </td>
                <td className="hide-sm small">
                  {a.ip ? (
                    <button className="link-btn" onClick={() => onIp?.(a.ip)} title="Ver só este IP">
                      {a.ip}
                    </button>
                  ) : (
                    '—'
                  )}
                  <div className="muted">{deviceLabel(a.user_agent)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const KINDS = [
  { value: 'hide_screens', label: 'Ações e tentativas' },
  { value: 'fails', label: 'Só o que falhou / suspeito' },
  { value: 'logins', label: 'Logins' },
  { value: 'changes', label: 'Só alterações' },
  { value: 'screens', label: 'Telas abertas' },
  { value: 'all', label: 'Tudo' },
];

export default function OwnerActivity() {
  const [params, setParams] = useSearchParams();
  const userId = params.get('user_id') || '';
  const ip = params.get('ip') || '';
  const kind = params.get('kind') || 'hide_screens';
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    api('/owner/accounts')
      .then((d) => setAccounts(d.accounts))
      .catch(() => {});
  }, []);

  const filters = { user_id: userId, ip, kind };
  const load = useCallback(
    async (silent) => {
      if (!silent) setLoading(true);
      try {
        const d = await api(`/owner/activity${qs({ user_id: userId, ip, kind })}`);
        // Atualização automática: mantém o que já foi carregado com "Carregar mais"
        setItems((prev) => {
          if (!silent || prev.length <= d.items.length) {
            setHasMore(d.hasMore);
            return d.items;
          }
          const oldest = d.items[d.items.length - 1]?.id ?? Infinity;
          return [...d.items, ...prev.filter((x) => x.id < oldest)];
        });
        setError('');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [userId, ip, kind]
  );

  useEffect(() => {
    load(false);
  }, [load]);
  usePolling(() => load(true), 5000);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    try {
      const d = await api(`/owner/activity${qs({ ...filters, before: last.id })}`);
      setItems((prev) => [...prev, ...d.items]);
      setHasMore(d.hasMore);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>Registro de atividade</h2>
        <span className="muted small">atualiza sozinho · guarda 90 dias</span>
      </div>
      <div className="filters">
        <select value={kind} onChange={(e) => setFilter('kind', e.target.value)} aria-label="Tipo">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select value={userId} onChange={(e) => setFilter('user_id', e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({ROLE_LABEL[a.role]})
            </option>
          ))}
        </select>
        {ip && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter('ip', '')}>
            IP {ip} ✕
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <ActivityList items={items} onUser={(id) => setFilter('user_id', String(id))} onIp={(v) => setFilter('ip', v)} />
      )}
      {hasMore && !loading && (
        <button className="btn btn-ghost btn-block" onClick={loadMore}>
          Carregar mais
        </button>
      )}
    </section>
  );
}
