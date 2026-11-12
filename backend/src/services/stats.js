import { query } from '../db/pool.js';
import { FEITAS_POR_PAGAMENTO } from '../config.js';

/**
 * Totais por membro. Só lançamentos APROVADOS contam para feitas/banidas.
 * Pagamentos quitados ficam na tabela payments e NÃO zeram as feitas.
 */
const MEMBER_STATS_SQL = `
  SELECT u.id, u.name, u.username, u.active, u.created_at,
         COALESCE(e.approved_done, 0)::int   AS approved_done,
         COALESCE(e.approved_banned, 0)::int AS approved_banned,
         COALESCE(e.pending_entries, 0)::int AS pending_entries,
         COALESCE(p.paid, 0)::int            AS paid
    FROM users u
    LEFT JOIN (
      SELECT user_id,
             SUM(qty_done)   FILTER (WHERE status = 'APROVADO') AS approved_done,
             SUM(qty_banned) FILTER (WHERE status = 'APROVADO') AS approved_banned,
             COUNT(*)        FILTER (WHERE status = 'PENDENTE') AS pending_entries
        FROM entries
       GROUP BY user_id
    ) e ON e.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(quantity) AS paid FROM payments GROUP BY user_id
    ) p ON p.user_id = u.id
   WHERE u.role = 'MEMBRO'
`;

export function computeStats(row) {
  const done = row.approved_done;
  const generated = Math.floor(done / FEITAS_POR_PAGAMENTO);
  return {
    approvedDone: done,
    approvedBanned: row.approved_banned,
    pendingEntries: row.pending_entries,
    paymentsGenerated: generated,
    paymentsPaid: row.paid,
    // Se um lançamento já pago for reavaliado como reprovado, não deixa ficar negativo.
    paymentsPending: Math.max(0, generated - row.paid),
    progress: done % FEITAS_POR_PAGAMENTO,
    goal: FEITAS_POR_PAGAMENTO,
  };
}

function toMember(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    active: row.active,
    createdAt: row.created_at,
    stats: computeStats(row),
  };
}

export async function listMembersWithStats(db = { query }) {
  const { rows } = await db.query(`${MEMBER_STATS_SQL} ORDER BY u.active DESC, u.name`);
  return rows.map(toMember);
}

export async function getMemberWithStats(userId, db = { query }) {
  const { rows } = await db.query(`${MEMBER_STATS_SQL} AND u.id = $1`, [userId]);
  return rows[0] ? toMember(rows[0]) : null;
}
