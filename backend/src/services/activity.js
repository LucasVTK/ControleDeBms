import { query } from '../db/pool.js';
import { clientIp } from './rateLimit.js';

/**
 * Registro de atividade (visão do dono).
 *
 * Grava toda requisição que muda algo (POST/PATCH/DELETE) e toda requisição
 * que falhou (401, 403, 404, 429...), com quem fez, IP, aparelho e o resultado.
 * Leituras bem-sucedidas (GET) não são gravadas: seriam milhares de linhas
 * da atualização automática das telas. As telas abertas são registradas à
 * parte, pelo sinal de presença (ver routes/notifications.js).
 *
 * Na Vercel a função pode ser congelada logo depois da resposta, então a
 * gravação acontece ANTES de a resposta terminar de ser enviada.
 */

const MAX_STR = 200;
const RETENTION_DAYS = 90;
const WRITE_TIMEOUT_MS = 1500;

// Campos do corpo que vale guardar (senha NUNCA é gravada, só o fato de ter sido trocada)
const BODY_FIELDS = [
  'username', 'name', 'status', 'comment', 'user_id', 'active', 'qty_done', 'qty_banned',
  'fb_account', 'role', 'blocked_actions', 'ip', 'reason',
];

/** Nome legível da ação a partir do método + rota. */
export function actionFor(method, path, status) {
  const p = path.replace(/\/\d+(?=\/|$)/g, '/:id');
  const key = `${method} ${p}`;
  if (key === 'POST /api/auth/login') {
    if (status < 400) return 'login';
    return status === 429 ? 'login_limite' : 'login_falhou';
  }
  const map = {
    'POST /api/entries': 'lancamento_criado',
    'PATCH /api/entries/:id': 'lancamento_editado',
    'DELETE /api/entries/:id': 'lancamento_excluido',
    'PATCH /api/entries/:id/review': 'lancamento_avaliado',
    'POST /api/payments': 'pagamento',
    'POST /api/users': 'membro_criado',
    'PATCH /api/users/:id': 'membro_editado',
    'POST /api/owner/accounts': 'dono_conta_criada',
    'PATCH /api/owner/accounts/:id': 'dono_conta_editada',
    'POST /api/owner/accounts/:id/logout': 'dono_derrubou_sessao',
    'POST /api/owner/blocked-ips': 'dono_bloqueou_ip',
    'DELETE /api/owner/blocked-ips': 'dono_desbloqueou_ip',
    'POST /api/owner/me/password': 'dono_trocou_senha',
  };
  if (map[key]) return map[key];
  if (status === 401) return 'nao_autenticado';
  if (status === 403) return 'acesso_negado';
  if (status === 404) return 'nao_encontrado';
  if (status === 429) return 'limite_atingido';
  return method === 'GET' ? 'consulta' : 'requisicao';
}

function clip(v, n = MAX_STR) {
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
}

function pickBody(body, path) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out = {};
  for (const f of BODY_FIELDS) {
    const v = body[f];
    if (v === undefined) continue;
    if (Array.isArray(v)) out[f] = v.slice(0, 10).map((x) => clip(x, 40));
    else if (typeof v === 'boolean' || typeof v === 'number') out[f] = v;
    else out[f] = clip(v);
  }
  if (body.password !== undefined && path !== '/api/auth/login') out.trocou_senha = true;
  return Object.keys(out).length ? out : null;
}

function errorFrom(chunk) {
  if (!chunk) return null;
  try {
    const data = JSON.parse(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return data?.error ? clip(data.error) : null;
  } catch {
    return null;
  }
}

// Sem login, quem falha muito (robô varrendo o site) não pode encher o banco:
// no máximo N linhas por IP por minuto, em cada instância.
const anonBudget = new Map();
const ANON_PER_MINUTE = 20;
function anonAllowed(ip) {
  const now = Date.now();
  const b = anonBudget.get(ip);
  if (!b || b.reset < now) {
    if (anonBudget.size > 5000) anonBudget.clear();
    anonBudget.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  b.n += 1;
  return b.n <= ANON_PER_MINUTE;
}

export async function writeActivity({ userId = null, action, method = null, path = null, status = null, ip = null, userAgent = null, details = null }) {
  try {
    await query(
      `INSERT INTO activity_log (user_id, action, method, path, status, ip, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, method, path ? clip(path) : null, status, ip, userAgent ? clip(userAgent, 300) : null, details]
    );
    if (Math.random() < 0.005) {
      query(`DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`).catch(() => {});
    }
  } catch (err) {
    console.error('[activity] Falha ao registrar:', err.message);
  }
}

function withTimeout(promise) {
  return Promise.race([promise, new Promise((r) => setTimeout(r, WRITE_TIMEOUT_MS))]);
}

/** Middleware: registra a requisição quando a resposta for enviada. */
export function activityLogger(req, res, next) {
  const origEnd = res.end;
  let done = false;

  res.end = function patchedEnd(chunk, encoding, cb) {
    if (done) return origEnd.call(this, chunk, encoding, cb);
    done = true;

    const status = res.statusCode;
    const method = req.method;
    const path = (req.originalUrl || req.url).split('?')[0];
    const skip =
      res.locals.skipActivity ||
      method === 'OPTIONS' ||
      method === 'HEAD' ||
      (method === 'GET' && status < 400) ||
      (method === 'POST' && path === '/api/notifications/read' && status < 400);
    const ip = clientIp(req);
    if (skip || (!req.user && status >= 400 && !anonAllowed(ip))) {
      return origEnd.call(this, chunk, encoding, cb);
    }

    const details = pickBody(req.body, path) || {};
    const error = status >= 400 ? errorFrom(chunk) : null;
    if (error) details.erro = error;
    if (res.locals.activity) Object.assign(details, res.locals.activity);
    const query_ = req.originalUrl?.split('?')[1];
    if (query_ && status >= 400) details.query = clip(query_);

    const write = writeActivity({
      userId: req.user?.id ?? res.locals.activityUserId ?? null,
      action: actionFor(method, path, status),
      method,
      path,
      status,
      ip,
      userAgent: req.headers['user-agent'] || null,
      details: Object.keys(details).length ? details : null,
    });
    withTimeout(write).finally(() => origEnd.call(res, chunk, encoding, cb));
    return res;
  };

  next();
}

// ---- Bloqueio de IP ----

let cache = { at: 0, ips: new Set() };
const CACHE_MS = 10_000;

export function invalidateBlockedIps() {
  cache = { at: 0, ips: new Set() };
}

async function blockedIps() {
  if (Date.now() - cache.at < CACHE_MS) return cache.ips;
  const { rows } = await query('SELECT ip FROM blocked_ips');
  cache = { at: Date.now(), ips: new Set(rows.map((r) => r.ip)) };
  return cache.ips;
}

/** Middleware: IP bloqueado pelo dono não usa a API. */
export async function blockIps(req, res, next) {
  try {
    const ip = clientIp(req);
    const ips = await blockedIps();
    if (!ips.has(ip)) return next();
    res.locals.skipActivity = true; // não enche o registro; conta as batidas na própria tabela
    await query('UPDATE blocked_ips SET hits = hits + 1, last_hit_at = NOW() WHERE ip = $1', [ip]).catch(() => {});
    res.status(403).json({ error: 'Acesso bloqueado.' });
  } catch (err) {
    next(err);
  }
}
