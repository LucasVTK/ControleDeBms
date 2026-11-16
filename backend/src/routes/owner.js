import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { authenticate, BLOCKABLE_ACTIONS, requireOwner, signToken } from '../middleware/auth.js';
import { invalidateBlockedIps } from '../services/activity.js';
import { clientIp } from '../services/rateLimit.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';
import { validateName, validatePassword } from './users.js';

/**
 * Visão do dono: tudo que acontece no sistema, em todas as contas,
 * e as ferramentas para impedir alguém de fazer algo.
 */
const router = Router();
router.use(authenticate, requireOwner);

const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const ONLINE_SECONDS = 60;

const ACCOUNT_COLUMNS = `
  u.id, u.name, u.username, u.role, u.active, u.created_at, u.blocked_actions,
  u.last_seen_at, u.last_path, u.last_login_at, u.last_ip, u.last_user_agent,
  (u.last_seen_at > NOW() - INTERVAL '${ONLINE_SECONDS} seconds') AS online,
  (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id)::int AS entries_total,
  (SELECT COUNT(*) FROM activity_log a
    WHERE a.user_id = u.id AND a.status >= 400 AND a.created_at > NOW() - INTERVAL '24 hours')::int AS fails_24h
`;

async function fetchAccount(id) {
  const { rows } = await query(`SELECT ${ACCOUNT_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

// ---- Visão geral ("Ao vivo") ----
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [online, counters, suspiciousIps, recent] = await Promise.all([
      query(
        `SELECT id, name, username, role, last_seen_at, last_path, last_ip, last_user_agent
           FROM users
          WHERE last_seen_at > NOW() - INTERVAL '${ONLINE_SECONDS} seconds'
          ORDER BY role, name`
      ),
      query(
        `SELECT
           (SELECT COUNT(*) FROM activity_log WHERE action = 'login' AND created_at > CURRENT_DATE)::int AS logins_today,
           (SELECT COUNT(*) FROM activity_log WHERE action IN ('login_falhou','login_limite')
               AND created_at > NOW() - INTERVAL '24 hours')::int AS failed_logins_24h,
           (SELECT COUNT(*) FROM activity_log WHERE status >= 400
               AND created_at > NOW() - INTERVAL '24 hours')::int AS fails_24h,
           (SELECT COUNT(*) FROM activity_log WHERE status IN (401, 403)
               AND action NOT IN ('login_falhou')
               AND created_at > NOW() - INTERVAL '24 hours')::int AS denied_24h,
           (SELECT COUNT(*) FROM entries WHERE created_at > CURRENT_DATE)::int AS entries_today,
           (SELECT COUNT(*) FROM entries WHERE reviewed_at > CURRENT_DATE)::int AS reviews_today,
           (SELECT COUNT(*) FROM users WHERE active)::int AS active_accounts,
           (SELECT COUNT(*) FROM blocked_ips)::int AS blocked_ips`
      ),
      query(
        `SELECT a.ip, COUNT(*)::int AS fails, MAX(a.created_at) AS last_at,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.username), NULL) AS usernames,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT a.details->>'username'), NULL) AS tried,
                EXISTS (SELECT 1 FROM blocked_ips b WHERE b.ip = a.ip) AS blocked
           FROM activity_log a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.status >= 400 AND a.created_at > NOW() - INTERVAL '24 hours' AND a.ip IS NOT NULL
          GROUP BY a.ip
         HAVING COUNT(*) >= 3
          ORDER BY fails DESC
          LIMIT 10`
      ),
      query(
        `SELECT a.id, a.created_at, a.action, a.method, a.path, a.status, a.ip, a.user_agent, a.details,
                a.user_id, u.name AS user_name, u.username, u.role
           FROM activity_log a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.action <> 'tela'
          ORDER BY a.id DESC
          LIMIT 15`
      ),
    ]);
    res.json({
      online: online.rows,
      counters: counters.rows[0],
      suspiciousIps: suspiciousIps.rows,
      recent: recent.rows,
    });
  })
);

// ---- Registro de atividade ----
// Filtros: ?user_id= ?ip= ?kind=all|fails|logins|changes|screens ?before= (id, para carregar mais)
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.user_id) {
      params.push(parseId(req.query.user_id));
      where.push(`a.user_id = $${params.length}`);
    }
    if (req.query.ip) {
      params.push(String(req.query.ip).slice(0, 64));
      where.push(`a.ip = $${params.length}`);
    }
    const kinds = {
      fails: 'a.status >= 400',
      logins: "a.action IN ('login', 'login_falhou', 'login_limite')",
      changes: "a.method IN ('POST', 'PATCH', 'PUT', 'DELETE') AND a.status < 400",
      screens: "a.action = 'tela'",
      hide_screens: "a.action <> 'tela'",
    };
    const kind = String(req.query.kind || 'hide_screens');
    if (kinds[kind]) where.push(kinds[kind]);
    else if (kind !== 'all') throw new HttpError(400, 'Filtro inválido.');
    if (req.query.before) {
      const before = Number(req.query.before);
      if (!Number.isSafeInteger(before) || before <= 0) throw new HttpError(400, 'Parâmetro inválido.');
      params.push(before);
      where.push(`a.id < $${params.length}`);
    }
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const { rows } = await query(
      `SELECT a.id, a.created_at, a.action, a.method, a.path, a.status, a.ip, a.user_agent, a.details,
              a.user_id, u.name AS user_name, u.username, u.role
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.id DESC
        LIMIT ${limit + 1}`,
      params
    );
    const hasMore = rows.length > limit;
    res.json({ items: rows.slice(0, limit), hasMore });
  })
);

// ---- Contas (todas: dono, admins e membros) ----
router.get(
  '/accounts',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT ${ACCOUNT_COLUMNS} FROM users u
        ORDER BY CASE u.role WHEN 'DONO' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, u.active DESC, u.name`
    );
    res.json({ accounts: rows, blockable: BLOCKABLE_ACTIONS });
  })
);

router.post(
  '/accounts',
  asyncHandler(async (req, res) => {
    const name = validateName(req.body?.name);
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Login inválido: use 3 a 30 caracteres entre letras minúsculas, números, ponto, hífen ou _.');
    }
    const role = String(req.body?.role ?? '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'MEMBRO') throw new HttpError(400, 'Tipo de conta deve ser ADMIN ou MEMBRO.');
    const hash = await bcrypt.hash(validatePassword(req.body?.password), BCRYPT_ROUNDS);
    try {
      const { rows } = await query(
        'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, username, hash, role]
      );
      res.status(201).json({ account: await fetchAccount(rows[0].id) });
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Já existe um usuário com esse login.');
      throw err;
    }
  })
);

/** Conta que o dono pode mexer: qualquer uma, menos outra conta de dono. */
async function editableAccount(id, me) {
  const { rows } = await query('SELECT id, role FROM users WHERE id = $1', [id]);
  const acc = rows[0];
  if (!acc) throw new HttpError(404, 'Conta não encontrada.');
  if (acc.role === 'DONO') {
    throw new HttpError(403, acc.id === me ? 'Use "Minha senha" para alterar a sua conta.' : 'Não é possível alterar outra conta de dono.');
  }
  return acc;
}

// Editar conta: nome, senha, ativar/desativar, ações bloqueadas
router.patch(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await editableAccount(id, req.user.id);
    const sets = [];
    const params = [];
    const b = req.body || {};
    if (b.name !== undefined) {
      params.push(validateName(b.name));
      sets.push(`name = $${params.length}`);
    }
    if (b.password !== undefined) {
      params.push(await bcrypt.hash(validatePassword(b.password), BCRYPT_ROUNDS));
      sets.push(`password_hash = $${params.length}`, 'password_changed_at = NOW()');
    }
    if (b.active !== undefined) {
      if (typeof b.active !== 'boolean') throw new HttpError(400, 'Campo "active" inválido.');
      params.push(b.active);
      sets.push(`active = $${params.length}`);
      if (!b.active) sets.push('sessions_revoked_at = NOW()');
    }
    if (b.blocked_actions !== undefined) {
      const list = b.blocked_actions;
      if (!Array.isArray(list) || list.some((a) => !BLOCKABLE_ACTIONS.includes(a))) {
        throw new HttpError(400, 'Lista de ações bloqueadas inválida.');
      }
      params.push([...new Set(list)]);
      sets.push(`blocked_actions = $${params.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, 'Nada para atualizar.');
    params.push(id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ account: await fetchAccount(id) });
  })
);

// Derrubar todas as sessões abertas da conta (ela precisa fazer login de novo)
router.post(
  '/accounts/:id/logout',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await editableAccount(id, req.user.id);
    await query('UPDATE users SET sessions_revoked_at = NOW() WHERE id = $1', [id]);
    res.json({ account: await fetchAccount(id) });
  })
);

// Trocar a própria senha (encerra as outras sessões do dono)
router.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const current = req.body?.current;
    if (typeof current !== 'string') throw new HttpError(400, 'Informe a senha atual.');
    const password = validatePassword(req.body?.password);
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current.slice(0, 200), rows[0].password_hash))) {
      throw new HttpError(400, 'Senha atual incorreta.');
    }
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [
      await bcrypt.hash(password, BCRYPT_ROUNDS),
      req.user.id,
    ]);
    // As outras sessões caem; esta recebe um login novo
    res.json({ token: signToken(req.user) });
  })
);

// ---- IPs bloqueados ----
router.get(
  '/blocked-ips',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT b.ip, b.reason, b.created_at, b.hits, b.last_hit_at, u.name AS created_by_name
         FROM blocked_ips b LEFT JOIN users u ON u.id = b.created_by
        ORDER BY b.created_at DESC`
    );
    res.json({ items: rows, myIp: clientIp(req) });
  })
);

const IP_RE = /^[0-9a-fA-F:.]{2,64}$/;

router.post(
  '/blocked-ips',
  asyncHandler(async (req, res) => {
    const ip = String(req.body?.ip ?? '').trim();
    if (!IP_RE.test(ip)) throw new HttpError(400, 'IP inválido.');
    if (ip === clientIp(req)) throw new HttpError(400, 'Esse é o seu próprio IP: bloquear tiraria você do sistema.');
    const reason = String(req.body?.reason ?? '').trim().slice(0, 200) || null;
    await query(
      `INSERT INTO blocked_ips (ip, reason, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason`,
      [ip, reason, req.user.id]
    );
    invalidateBlockedIps();
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/blocked-ips',
  asyncHandler(async (req, res) => {
    const ip = String(req.body?.ip ?? '').trim();
    const { rowCount } = await query('DELETE FROM blocked_ips WHERE ip = $1', [ip]);
    if (rowCount === 0) throw new HttpError(404, 'Esse IP não está bloqueado.');
    invalidateBlockedIps();
    res.json({ ok: true });
  })
);

export default router;
