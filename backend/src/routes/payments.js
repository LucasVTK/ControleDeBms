import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getMemberWithStats } from '../services/stats.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';

const router = Router();
router.use(authenticate, requireAdmin);

// Histórico de quitações (opcional ?user_id=)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.user_id) {
      params.push(parseId(req.query.user_id));
      where = 'WHERE p.user_id = $1';
    }
    const { rows } = await query(
      `SELECT p.id, p.user_id, u.name AS user_name, p.quantity, p.created_at, a.name AS paid_by_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN users a ON a.id = p.paid_by
         ${where}
        ORDER BY p.created_at DESC
        LIMIT 500`,
      params
    );
    res.json({ payments: rows });
  })
);

/**
 * "Marcar como pago": quita TODOS os pagamentos pendentes do membro.
 * Grava a quantidade quitada; não mexe nas feitas nem no progresso.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = parseId(req.body?.user_id);

    const result = await withTransaction(async (client) => {
      // Trava a linha do membro para dois cliques simultâneos não pagarem em dobro
      const lock = await client.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'MEMBRO' FOR UPDATE",
        [userId]
      );
      if (lock.rowCount === 0) throw new HttpError(404, 'Membro não encontrado.');

      const member = await getMemberWithStats(userId, client);
      const quantity = member.stats.paymentsPending;
      if (quantity <= 0) throw new HttpError(400, 'Este membro não tem pagamentos pendentes.');

      const { rows } = await client.query(
        `INSERT INTO payments (user_id, quantity, paid_by) VALUES ($1, $2, $3)
         RETURNING id, user_id, quantity, created_at`,
        [userId, quantity, req.user.id]
      );
      return { payment: rows[0], member: await getMemberWithStats(userId, client) };
    });

    res.status(201).json(result);
  })
);

export default router;
