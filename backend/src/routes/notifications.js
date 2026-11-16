import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireMember } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { writeActivity } from '../services/activity.js';
import { clientIp } from '../services/rateLimit.js';

const router = Router();
router.use(authenticate);

/**
 * Consulta leve, chamada a cada poucos segundos pelo navegador.
 * - count: número do sino (membro: avaliações não vistas; admin: pendentes)
 * - version: "carimbo" que muda sempre que algo relevante muda. O front só
 *   recarrega listas e totais quando o carimbo muda.
 */
const PATH_RE = /^\/[a-z0-9/_-]{0,79}$/;

/**
 * Presença: quem está online e em qual tela. Grava no máx. a cada 30s, ou
 * na hora quando a pessoa troca de tela (e aí registra a tela na atividade).
 */
async function heartbeat(req) {
  const tela = typeof req.query.tela === 'string' && PATH_RE.test(req.query.tela) ? req.query.tela : null;
  const ip = clientIp(req);
  const { rows } = await query(
    `WITH old AS (SELECT last_path FROM users WHERE id = $1)
     UPDATE users SET last_seen_at = NOW(), last_ip = $3, last_path = COALESCE($2, last_path)
      WHERE id = $1
        AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '30 seconds'
             OR ($2::text IS NOT NULL AND last_path IS DISTINCT FROM $2))
     RETURNING (SELECT last_path FROM old) AS prev`,
    [req.user.id, tela, ip]
  );
  if (rows[0] && tela && rows[0].prev !== tela) {
    await writeActivity({
      userId: req.user.id,
      action: 'tela',
      ip,
      userAgent: req.headers['user-agent'] || null,
      details: { tela },
    });
  }
}

router.get(
  '/count',
  asyncHandler(async (req, res) => {
    await heartbeat(req).catch((err) => console.error('[presença]', err.message));
    if (req.user.role === 'MEMBRO') {
      const { rows } = await query(
        `SELECT
           (SELECT COUNT(*) FROM entries WHERE user_id = $1 AND member_seen = FALSE)::int AS count,
           (SELECT COUNT(*) || '.' || COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0)
              FROM entries WHERE user_id = $1) AS e,
           (SELECT COUNT(*) || '.' || COALESCE(SUM(quantity), 0)
              FROM payments WHERE user_id = $1) AS p`,
        [req.user.id]
      );
      const r = rows[0];
      return res.json({ count: r.count, version: `${r.e}|${r.p}` });
    }

    const { rows } = await query(
      `SELECT
         (SELECT COUNT(*) FROM entries WHERE status = 'PENDENTE')::int AS count,
         (SELECT COUNT(*) || '.' || COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM entries) AS e,
         (SELECT COUNT(*) || '.' || COALESCE(SUM(quantity), 0) FROM payments) AS p,
         (SELECT COUNT(*) || '.' || COUNT(*) FILTER (WHERE active) || '.' || COALESCE(SUM(length(name)), 0)
            FROM users) AS u`
    );
    const r = rows[0];
    res.json({ count: r.count, version: `${r.e}|${r.p}|${r.u}` });
  })
);

// Membro marca os avisos como lidos
router.post(
  '/read',
  requireMember,
  asyncHandler(async (req, res) => {
    await query('UPDATE entries SET member_seen = TRUE WHERE user_id = $1 AND member_seen = FALSE', [
      req.user.id,
    ]);
    res.json({ count: 0 });
  })
);

export default router;
