import { useEffect, useRef } from 'react';

export const ACTION_LABEL = {
  login: 'Entrou no sistema',
  login_falhou: 'Tentou entrar e errou',
  login_limite: 'Login travado (muitas tentativas)',
  lancamento_criado: 'Enviou lançamento',
  lancamento_editado: 'Editou lançamento',
  lancamento_excluido: 'Excluiu lançamento',
  lancamento_avaliado: 'Avaliou lançamento',
  pagamento: 'Marcou pagamento',
  membro_criado: 'Cadastrou membro',
  membro_editado: 'Alterou membro',
  dono_conta_criada: 'Dono criou conta',
  dono_conta_editada: 'Dono alterou conta',
  dono_derrubou_sessao: 'Dono derrubou sessão',
  dono_bloqueou_ip: 'Dono bloqueou IP',
  dono_desbloqueou_ip: 'Dono desbloqueou IP',
  dono_trocou_senha: 'Dono trocou a senha',
  tela: 'Abriu tela',
  nao_autenticado: 'Acesso sem login válido',
  acesso_negado: 'Tentou algo sem permissão',
  nao_encontrado: 'Acessou algo inexistente',
  limite_atingido: 'Bateu no limite',
  consulta: 'Consulta com erro',
  requisicao: 'Requisição',
};

// Mesma ação quando o sistema BARROU (status 400+): deixa claro que não aconteceu
const ATTEMPT_LABEL = {
  lancamento_criado: 'Tentou enviar lançamento',
  lancamento_editado: 'Tentou editar lançamento',
  lancamento_excluido: 'Tentou excluir lançamento',
  lancamento_avaliado: 'Tentou avaliar lançamento',
  pagamento: 'Tentou marcar pagamento',
  membro_criado: 'Tentou cadastrar membro',
  membro_editado: 'Tentou alterar membro',
};

const STATUS_REASON = {
  400: 'dados inválidos',
  401: 'sem login válido',
  403: 'sem permissão',
  404: 'não existe',
  409: 'conflito',
  429: 'excesso de tentativas',
};

/** Título da linha: o que fez, ou o que tentou fazer e foi barrado. */
export function actionTitle(item) {
  if (item.status >= 400 && ATTEMPT_LABEL[item.action]) return ATTEMPT_LABEL[item.action];
  return ACTION_LABEL[item.action] || item.action;
}

/** "BARRADO · sem permissão" para o selo vermelho. */
export function blockedLabel(status) {
  if (status >= 500) return 'ERRO NO SERVIDOR';
  return `BARRADO · ${STATUS_REASON[status] || status}`;
}

export const SCREEN_LABEL = {
  '/membro': 'Tela do membro',
  '/admin': 'Admin · Painel',
  '/admin/fila': 'Admin · Fila',
  '/admin/lancamentos': 'Admin · Lançamentos',
  '/admin/pagamentos': 'Admin · Pagamentos',
  '/admin/membros': 'Admin · Membros',
  '/dono': 'Dono · Ao vivo',
  '/dono/atividade': 'Dono · Atividade',
  '/dono/contas': 'Dono · Contas',
  '/dono/seguranca': 'Dono · Segurança',
  '/login': 'Login',
};

export const screenLabel = (p) => (p ? SCREEN_LABEL[p] || p : '—');

export const ROLE_LABEL = { DONO: 'Dono', ADMIN: 'Admin', MEMBRO: 'Membro' };

export const BLOCK_LABEL = {
  LANCAR: 'Enviar / editar lançamentos',
  AVALIAR: 'Aprovar / reprovar',
  PAGAR: 'Marcar pagamentos',
  MEMBROS: 'Cadastrar / alterar membros',
};

/** "iPhone · Safari", "Android · Chrome", "Windows · Edge"... */
export function deviceLabel(ua) {
  if (!ua) return '—';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /FxiOS|Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  if (!os && !browser) return /curl|python|node|axios|wget|bot|http/i.test(ua) ? 'Robô / script' : 'Desconhecido';
  return [os, browser].filter(Boolean).join(' · ');
}

export function timeAgo(value) {
  if (!value) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** Resumo curto dos detalhes de uma linha de atividade. */
export function detailsText(item) {
  const d = item.details || {};
  const parts = [];
  if (item.action === 'tela') return screenLabel(d.tela);
  if (d.username && !item.username) parts.push(`login tentado: "${d.username}"`);
  if (d.username && item.username && d.username !== item.username) parts.push(`login: ${d.username}`);
  if (d.motivo) parts.push(d.motivo);
  const failed = item.status >= 400;
  if (d.status) {
    const verb = d.status === 'APROVADO' ? 'aprovar' : d.status === 'REPROVADO' ? 'reprovar' : d.status;
    parts.push(failed ? `queria ${verb}` : d.status === 'APROVADO' ? 'aprovou' : d.status === 'REPROVADO' ? 'reprovou' : d.status);
  }
  if (d.qty_done !== undefined) parts.push(`${d.qty_done} feitas / ${d.qty_banned ?? 0} banidas`);
  if (d.fb_account) parts.push(`FB: ${d.fb_account}`);
  if (d.comment) parts.push(`"${d.comment}"`);
  if (d.name) parts.push(`nome: ${d.name}`);
  if (d.role) parts.push(`tipo: ${d.role}`);
  if (d.active !== undefined) parts.push(d.active ? 'reativou' : 'desativou');
  if (d.blocked_actions) parts.push(d.blocked_actions.length ? `bloqueios: ${d.blocked_actions.map((a) => BLOCK_LABEL[a] || a).join(', ')}` : 'tirou bloqueios');
  if (d.trocou_senha) parts.push('trocou a senha');
  if (d.ip) parts.push(`IP ${d.ip}`);
  if (d.reason) parts.push(d.reason);
  const idMatch = item.path?.match(/\/(\d+)(?:\/|$)/);
  if (idMatch && item.path.includes('/entries/')) parts.unshift(`lançamento #${idMatch[1]}`);
  if (idMatch && (item.path.includes('/users/') || item.path.includes('/accounts/'))) parts.unshift(`conta #${idMatch[1]}`);
  if (d.erro) parts.push(`resposta do sistema: "${d.erro}"`);
  if (!parts.length && item.status >= 400 && item.path) parts.push(`${item.method} ${item.path}`);
  return parts.join(' · ');
}

/** Chama fn a cada `ms` enquanto a aba está visível. */
export function usePolling(fn, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
