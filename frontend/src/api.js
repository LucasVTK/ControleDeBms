const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'bm_token';

/**
 * Cada aba guarda o próprio login (sessionStorage), assim dá para ter o admin
 * numa aba e um membro em outra no mesmo navegador. O localStorage guarda o
 * último login, para uma aba nova (ou o app reaberto no celular) já entrar logada.
 */
export const tokenStore = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* armazenamento bloqueado: segue só na memória da página */
    }
  },
  clear: () => {
    try {
      const mine = sessionStorage.getItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      // só apaga o "último login" se ele for desta aba
      if (!mine || localStorage.getItem(TOKEN_KEY) === mine) localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
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
