import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireMember } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

/**
 * Contador do sino.
 * - Membro: lançamentos avaliados que ele ainda não viu.
 * - Admin: lançamentos pendentes aguardando avaliação.
 */
router.get(
  '/count',
  asyncHandler(async (req, res) => {
    const { rows } =
      req.user.role === 'MEMBRO'
        ? await query(
            'SELECT COUNT(*)::int AS count FROM entries WHERE user_id = $1 AND member_seen = FALSE',
            [req.user.id]
          )
        : await query("SELECT COUNT(*)::int AS count FROM entries WHERE status = 'PENDENTE'");
    res.json({ count: rows[0].count });
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
