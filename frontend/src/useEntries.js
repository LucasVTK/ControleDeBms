import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from './api.js';

/** Lista paginada de lançamentos com "carregar mais". */
export function useEntries(filters, pageSize = 20) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(filters);
  const reqId = useRef(0);

  const load = useCallback(
    async (p) => {
      const id = ++reqId.current;
      setLoading(true);
      setError('');
      try {
        const d = await api(`/entries${qs({ ...JSON.parse(key), page: p, pageSize })}`);
        if (id !== reqId.current) return; // resposta antiga (filtro mudou)
        setItems((prev) => (p === 1 ? d.items : [...prev, ...d.items]));
        setTotal(d.total);
        setPage(p);
      } catch (err) {
        if (id === reqId.current) setError(err.message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [key, pageSize]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  // Atualização em segundo plano: recarrega tudo o que já está na tela, sem "Carregando…".
  const loadedRef = useRef(0);
  loadedRef.current = items.length;
  const refresh = useCallback(async () => {
    const id = ++reqId.current;
    const size = Math.min(100, Math.max(pageSize, loadedRef.current));
    try {
      const d = await api(`/entries${qs({ ...JSON.parse(key), page: 1, pageSize: size })}`);
      if (id !== reqId.current) return;
      setItems(d.items);
      setTotal(d.total);
      setPage(Math.max(1, Math.ceil(d.items.length / pageSize)));
      setLoading(false);
    } catch {
      // silencioso: tenta de novo na próxima mudança
    }
  }, [key, pageSize]);

  const replace = useCallback((entry) => {
    setItems((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
  }, []);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const remove = useCallback((id) => {
    if (!itemsRef.current.some((e) => e.id === id)) return; // já removido: não desconta de novo
    itemsRef.current = itemsRef.current.filter((e) => e.id !== id);
    setItems((prev) => prev.filter((e) => e.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);
  const prepend = useCallback((entry) => {
    setItems((prev) => [entry, ...prev]);
    setTotal((t) => t + 1);
  }, []);

  return {
    items,
    total,
    loading,
    error,
    hasMore: items.length < total,
    loadMore: () => load(page + 1),
    reload: () => load(1),
    refresh,
    replace,
    remove,
    prepend,
  };
}
