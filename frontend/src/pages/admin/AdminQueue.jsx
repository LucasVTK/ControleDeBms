import { useLiveRefresh, useNotifications } from '../../components/Layout.jsx';
import EntryList from '../../components/EntryList.jsx';
import { useEntries } from '../../useEntries.js';

/** Fila de lançamentos pendentes, mais antigos primeiro. */
export default function AdminQueue() {
  const list = useEntries({ status: 'PENDENTE', order: 'asc' });
  const { refresh } = useNotifications();
  useLiveRefresh(list.refresh);

  function onReviewed(entry) {
    list.remove(entry.id);
    refresh();
  }

  return (
    <section>
      <div className="section-head">
        <h2>Fila de aprovação {list.total > 0 && <span className="muted">({list.total})</span>}</h2>
        <button className="btn btn-ghost btn-sm" onClick={list.reload}>
          Atualizar
        </button>
      </div>
      <EntryList
        list={list}
        emptyText="Nenhum lançamento aguardando avaliação. 🎉"
        cardProps={{ showMember: true, reviewable: true, onReviewed }}
      />
    </section>
  );
}
