import EntryCard from './EntryCard.jsx';

export default function EntryList({ list, emptyText, cardProps = {} }) {
  const { items, loading, error, hasMore, loadMore } = list;
  return (
    <div className="entry-list">
      {error && <p className="error">{error}</p>}
      {items.map((e) => (
        <EntryCard key={e.id} entry={e} {...cardProps} />
      ))}
      {!loading && !error && items.length === 0 && <p className="empty">{emptyText}</p>}
      {loading && <p className="muted center">Carregando…</p>}
      {!loading && hasMore && (
        <button className="btn btn-ghost btn-block" onClick={loadMore}>
          Carregar mais
        </button>
      )}
    </div>
  );
}
