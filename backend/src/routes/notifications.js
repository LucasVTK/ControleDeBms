import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireMember } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

/**
 * Consulta leve, chamada a cada poucos segundos pelo navegador.
 * - count: número do sino (membro: avaliações não vistas; admin: pendentes)
 * - version: "carimbo" que muda sempre que algo relevante muda. O front só
 *   recarrega listas e totais quando o carimbo muda.
 */
router.get(
  '/count',
  asyncHandler(async (req, res) => {
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
