/** Card de totais de um membro. `compact` = versão usada no painel do admin. */
export default function StatsCard({ stats, compact = false }) {
  const pct = Math.round((stats.progress / stats.goal) * 100);
  return (
    <div className={`stats ${compact ? 'stats-compact' : ''}`}>
      <div className="stat">
        <span className="stat-value">{stats.approvedDone}</span>
        <span className="stat-label">Feitas aprovadas</span>
      </div>
      <div className="stat">
        <span className="stat-value">{stats.approvedBanned}</span>
        <span className="stat-label">Banidas</span>
      </div>
      {!compact && (
        <div className="stat">
          <span className="stat-value">{stats.pendingEntries}</span>
          <span className="stat-label">Lançamentos pendentes</span>
        </div>
      )}
      <div className={`stat ${stats.paymentsPending > 0 ? 'stat-highlight' : ''}`}>
        <span className="stat-value">{stats.paymentsPending}</span>
        <span className="stat-label">Pagamentos pendentes</span>
      </div>
      <div className="stat stat-progress">
        <div className="progress-head">
          <span className="stat-label">Próximo pagamento</span>
          <strong>
            {stats.progress}/{stats.goal}
          </strong>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={stats.progress} aria-valuemax={stats.goal}>
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
