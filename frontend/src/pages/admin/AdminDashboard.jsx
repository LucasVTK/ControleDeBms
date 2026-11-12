import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { ConfirmModal } from '../../components/Modal.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import { useMembers } from '../../useMembers.js';

export default function AdminDashboard() {
  const { members, loading, error, replace } = useMembers();
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [flash, setFlash] = useState('');

  const active = members.filter((m) => m.active);
  const totals = active.reduce(
    (acc, m) => ({
      done: acc.done + m.stats.approvedDone,
      banned: acc.banned + m.stats.approvedBanned,
      pendingPayments: acc.pendingPayments + m.stats.paymentsPending,
      pendingEntries: acc.pendingEntries + m.stats.pendingEntries,
    }),
    { done: 0, banned: 0, pendingPayments: 0, pendingEntries: 0 }
  );

  async function confirmPay() {
    setBusy(true);
    setPayError('');
    try {
      const d = await api('/payments', { method: 'POST', body: { user_id: paying.id } });
      replace(d.member);
      setFlash(`${d.payment.quantity} pagamento(s) de ${paying.name} marcados como pagos.`);
      setPaying(null);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="summary">
        <div className="summary-item">
          <strong>{totals.done}</strong>
          <span>Feitas aprovadas</span>
        </div>
        <div className="summary-item">
          <strong>{totals.banned}</strong>
          <span>Banidas</span>
        </div>
        <Link to="/admin/fila" className="summary-item summary-link">
          <strong>{totals.pendingEntries}</strong>
          <span>A avaliar</span>
        </Link>
        <div className="summary-item">
          <strong>{totals.pendingPayments}</strong>
          <span>Pagamentos pendentes</span>
        </div>
      </section>

      {flash && (
        <p className="success" onClick={() => setFlash('')}>
          {flash}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando…</p>}
      {!loading && members.length === 0 && (
        <p className="empty">
          Nenhum membro cadastrado. <Link to="/admin/membros">Cadastrar membro</Link>
        </p>
      )}

      <div className="member-grid">
        {members.map((m) => (
          <article key={m.id} className={`card member-card ${m.active ? '' : 'inactive'}`}>
            <header className="member-card-head">
              <div>
                <h3>{m.name}</h3>
                <span className="muted">@{m.username}</span>
              </div>
              {!m.active && <span className="badge badge-inactive">Desativado</span>}
              {m.stats.pendingEntries > 0 && (
                <Link to={`/admin/lancamentos?user_id=${m.id}&status=PENDENTE`} className="badge badge-pendente">
                  {m.stats.pendingEntries} a avaliar
                </Link>
              )}
            </header>
            <StatsCard stats={m.stats} compact />
            <div className="member-card-actions">
              <Link className="btn btn-ghost btn-sm" to={`/admin/lancamentos?user_id=${m.id}`}>
                Ver lançamentos
              </Link>
              <button
                className="btn btn-primary btn-sm"
                disabled={m.stats.paymentsPending === 0}
                onClick={() => {
                  setPayError('');
                  setPaying(m);
                }}
              >
                Marcar como pago
              </button>
            </div>
          </article>
        ))}
      </div>

      {paying && (
        <ConfirmModal
          title="Confirmar pagamento"
          confirmLabel="Sim, marcar como pago"
          busy={busy}
          onCancel={() => setPaying(null)}
          onConfirm={confirmPay}
        >
          <p>
            Marcar <strong>{paying.stats.paymentsPending} pagamento(s)</strong> de <strong>{paying.name}</strong> como
            pago(s)?
          </p>
          <p className="muted">
            Os pagamentos pendentes vão a zero. O total de feitas ({paying.stats.approvedDone}) e o progresso atual (
            {paying.stats.progress}/{paying.stats.goal}) não mudam.
          </p>
          {payError && <p className="error">{payError}</p>}
        </ConfirmModal>
      )}
    </div>
  );
}
