const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'bm_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Chamada à API. `body` vira JSON; `form` (FormData) vai como multipart.
 * Lança Error com a mensagem do servidor em caso de falha.
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet.');
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (!res.ok) {
    if (data.error) throw new Error(data.error);
    if (res.status >= 500) throw new Error('Servidor indisponível. Verifique se o backend está rodando.');
    throw new Error(`Erro ${res.status}`);
  }
  return data;
}

export function qs(params) {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return s ? `?${s}` : '';
}
