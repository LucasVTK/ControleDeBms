import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { ActivityList } from './OwnerActivity.jsx';
import { deviceLabel, ROLE_LABEL, screenLabel, timeAgo, usePolling } from './ownerUtils.js';

export default function OwnerLive() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyIp, setBusyIp] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api('/owner/overview'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 5000);

  async function blockIp(ip) {
    const reason = window.prompt(`Bloquear o IP ${ip}? Ninguém nesse IP vai conseguir usar o site.\nMotivo (opcional):`);
    if (reason === null) return;
    setBusyIp(ip);
    try {
      await api('/owner/blocked-ips', { method: 'POST', body: { ip, reason } });
      await load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyIp('');
    }
  }

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">Carregando…</p>;
  const c = data.counters;
  const toActivity = (q) => navigate(`/dono/atividade?${new URLSearchParams(q)}`);

  return (
    <div className="owner-live">
      {error && <p className="error">{error}</p>}

      <div className="stats">
        <div className="stat stat-highlight">
          <span className="stat-label">Online agora</span>
          <span className="stat-value">{data.online.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Logins hoje</span>
          <span className="stat-value">{c.logins_today}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lançamentos hoje</span>
          <span className="stat-value">{c.entries_today}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avaliações hoje</span>
          <span className="stat-value">{c.reviews_today}</span>
        </div>
        <button className={`stat stat-btn ${c.failed_logins_24h ? 'stat-alert' : ''}`} onClick={() => toActivity({ kind: 'logins' })}>
          <span className="stat-label">Logins errados (24h)</span>
          <span className="stat-value">{c.failed_logins_24h}</span>
        </button>
        <button className={`stat stat-btn ${c.denied_24h ? 'stat-alert' : ''}`} onClick={() => toActivity({ kind: 'fails' })}>
          <span className="stat-label">Acessos negados (24h)</span>
          <span className="stat-value">{c.denied_24h}</span>
        </button>
      </div>

      <section className="section">
        <h2>Quem está online</h2>
        {data.online.length === 0 ? (
          <p className="empty">Ninguém usando o site neste momento.</p>
        ) : (
          <div className="online-list">
            {data.online.map((u) => (
              <div key={u.id} className="card online-item">
                <span className="online-dot" />
                <div>
                  <strong>{u.name}</strong> <span className={`role-chip role-${u.role.toLowerCase()}`}>{ROLE_LABEL[u.role]}</span>
                  <div className="muted small">
                    Na tela: <strong>{screenLabel(u.last_path)}</strong> · {timeAgo(u.last_seen_at)}
                  </div>
                  <div className="muted small">
                    {u.last_ip} · {deviceLabel(u.last_user_agent)}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => toActivity({ user_id: u.id, kind: 'all' })}>
                  Ver o que fez
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.suspiciousIps.length > 0 && (
        <section className="section">
          <h2>⚠ IPs com muitas falhas (24h)</h2>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th className="num">Falhas</th>
                  <th>Contas / logins tentados</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.suspiciousIps.map((s) => (
                  <tr key={s.ip}>
                    <td>
                      <button className="link-btn" onClick={() => toActivity({ ip: s.ip, kind: 'all' })}>
                        {s.ip}
                      </button>
                      <div className="muted small">{timeAgo(s.last_at)}</div>
                    </td>
                    <td className="num">{s.fails}</td>
                    <td className="small">{[...new Set([...s.usernames, ...s.tried])].join(', ') || '—'}</td>
                    <td className="num">
                      {s.blocked ? (
                        <span className="badge badge-reprovado">Bloqueado</span>
                      ) : (
                        <button className="btn btn-danger-ghost btn-sm" disabled={busyIp === s.ip} onClick={() => blockIp(s.ip)}>
                          Bloquear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Últimos acontecimentos</h2>
          <Link to="/dono/atividade" className="btn btn-ghost btn-sm">
            Ver tudo
          </Link>
        </div>
        <ActivityList
          items={data.recent}
          onUser={(id) => toActivity({ user_id: id, kind: 'all' })}
          onIp={(ip) => toActivity({ ip, kind: 'all' })}
        />
      </section>
    </div>
  );
}
