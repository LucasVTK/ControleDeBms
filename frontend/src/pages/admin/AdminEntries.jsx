import { useSearchParams } from 'react-router-dom';
import { useLiveRefresh, useNotifications } from '../../components/Layout.jsx';
import EntryList from '../../components/EntryList.jsx';
import { useEntries } from '../../useEntries.js';
import { useMembers } from '../../useMembers.js';

/** Todos os lançamentos, com filtro por membro e status (guardados na URL). */
export default function AdminEntries() {
  const [params, setParams] = useSearchParams();
  const userId = params.get('user_id') || '';
  const status = params.get('status') || '';
  const { members } = useMembers();
  const list = useEntries({ user_id: userId, status });
  const { refresh } = useNotifications();
  useLiveRefresh(list.refresh);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function onReviewed(entry) {
    if (status && entry.status !== status) list.remove(entry.id);
    else list.replace(entry);
    refresh();
  }

  return (
    <section>
      <div className="section-head">
        <h2>
          Lançamentos <span className="muted">({list.total})</span>
        </h2>
      </div>
      <div className="filters">
        <select value={userId} onChange={(e) => setFilter('user_id', e.target.value)} aria-label="Membro">
          <option value="">Todos os membros</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.active ? '' : ' (desativado)'}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="APROVADO">Aprovados</option>
          <option value="REPROVADO">Reprovados</option>
        </select>
      </div>
      <EntryList
        list={list}
        emptyText="Nenhum lançamento encontrado com esses filtros."
        cardProps={{ showMember: true, reviewable: true, onReviewed }}
      />
    </section>
  );
}
