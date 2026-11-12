import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLiveRefresh, useNotifications } from '../../components/Layout.jsx';
import StatsCard from '../../components/StatsCard.jsx';
import EntryList from '../../components/EntryList.jsx';
import { useEntries } from '../../useEntries.js';
import NewEntryForm from './NewEntryForm.jsx';

export default function MemberHome() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');
  const list = useEntries({ status });
  const { count, markRead } = useNotifications();

  const loadStats = useCallback(() => {
    api('/users/me/stats')
      .then((d) => setStats(d.stats))
      .catch(() => {});
  }, []);

  useEffect(loadStats, [loadStats]);

  // Atualiza totais e histórico sozinho quando o admin avalia, paga etc.
  useLiveRefresh(() => {
    loadStats();
    list.refresh();
  });

  useEffect(() => {
    if (window.location.hash === '#historico') {
      document.getElementById('historico')?.scrollIntoView();
    }
  }, []);

  function onCreated(entry) {
    if (!status || status === 'PENDENTE') list.prepend(entry);
    loadStats();
  }

  return (
    <div className="member-page">
      <section className="card">
        <h2>Meus números</h2>
        {stats ? <StatsCard stats={stats} /> : <p className="muted">Carregando…</p>}
        <p className="hint">Só lançamentos aprovados contam. A cada {stats?.goal ?? 20} feitas aprovadas, 1 pagamento.</p>
      </section>

      <NewEntryForm onCreated={onCreated} />

      <section id="historico" className="section">
        <div className="section-head">
          <h2>Meu histórico</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
            <option value="">Todos</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="APROVADO">Aprovados</option>
            <option value="REPROVADO">Reprovados</option>
          </select>
        </div>
        {count > 0 && (
          <div className="notice">
            <span>
              Você tem <strong>{count}</strong> lançamento(s) avaliado(s) recentemente (marcados como “Novo”).
            </span>
            <button
              className="btn btn-sm btn-primary"
              onClick={markRead}
            >
              Marcar como visto
            </button>
          </div>
        )}
        <EntryList
          list={list}
          emptyText="Nenhum lançamento ainda."
          cardProps={{
            highlightNew: true,
            editable: true,
            onUpdated: (entry) => {
              // Ao editar um reprovado ele volta para pendente: some do filtro "Reprovados"
              if (status && entry.status !== status) list.remove(entry.id);
              else list.replace(entry);
              loadStats();
            },
            onDeleted: (id) => {
              list.remove(id);
              loadStats();
            },
          }}
        />
      </section>
    </div>
  );
}
