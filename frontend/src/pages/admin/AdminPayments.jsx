import { useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useLiveRefresh } from '../../components/Layout.jsx';
import { useMembers } from '../../useMembers.js';
import { formatDateTime } from '../../utils.js';

export default function AdminPayments() {
  const { members } = useMembers();
  const [userId, setUserId] = useState('');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);
  useLiveRefresh(() => setTick((t) => t + 1));

  useEffect(() => {
    let cancelled = false;
    if (tick === 0) setLoading(true); // atualizações automáticas não mostram "Carregando…"
    setError('');
    api(`/payments${qs({ user_id: userId })}`)
      .then((d) => !cancelled && setPayments(d.payments))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  const total = payments.reduce((s, p) => s + p.quantity, 0);

  return (
    <section>
      <div className="section-head">
        <h2>Histórico de pagamentos</h2>
      </div>
      <div className="filters">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Membro">
          <option value="">Todos os membros</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : payments.length === 0 ? (
        <p className="empty">Nenhum pagamento quitado ainda.</p>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Membro</th>
                <th className="num">Qtd. quitada</th>
                <th className="hide-sm">Quitado por</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.created_at)}</td>
                  <td>{p.user_name}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="hide-sm">{p.paid_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num">{total}</td>
                <td className="hide-sm" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
