import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const d = await api('/users');
      setMembers(d.members);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const replace = useCallback((m) => {
    setMembers((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  }, []);

  return { members, setMembers, loading, error, reload, replace };
}
