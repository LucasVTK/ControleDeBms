import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin, requireMember } from '../middleware/auth.js';
import { entryPhotosUpload, looksLikeImage } from '../middleware/upload.js';
import { deleteImage, uploadImage } from '../services/storage.js';
import { asyncHandler, HttpError, parseId, parseNonNegativeInt } from '../utils/http.js';

const router = Router();
const STATUSES = ['PENDENTE', 'APROVADO', 'REPROVADO'];
const MAX_TEXT = 2000;

router.use(authenticate);

const ENTRY_COLUMNS = `
  e.id, e.user_id, u.name AS user_name, e.before_url, e.after_url,
  e.qty_done, e.qty_banned, e.description, e.status, e.admin_comment,
  e.reviewed_at, r.name AS reviewed_by_name, e.member_seen, e.created_at
`;
const ENTRY_FROM = `
  FROM entries e
  JOIN users u ON u.id = e.user_id
  LEFT JOIN users r ON r.id = e.reviewed_by
`;

async function fetchEntry(id) {
  const { rows } = await query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_FROM} WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Lista lançamentos.
 * - Membro: sempre só os próprios (o filtro user_id é ignorado).
 * - Admin: todos, com filtros opcionais ?user_id= e ?status=.
 * Paginação: ?page=1&pageSize=20. Ordenação: ?order=asc|desc (data).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];

    if (req.user.role === 'MEMBRO') {
      params.push(req.user.id);
      where.push(`e.user_id = $${params.length}`);
    } else if (req.query.user_id) {
      params.push(parseId(req.query.user_id));
      where.push(`e.user_id = $${params.length}`);
    }

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!STATUSES.includes(status)) throw new HttpError(400, 'Status inválido.');
      params.push(status);
      where.push(`e.status = $${params.length}`);
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [list, count] = await Promise.all([
      query(
        `SELECT ${ENTRY_COLUMNS} ${ENTRY_FROM} ${whereSql}
         ORDER BY e.created_at ${order}, e.id ${order}
         LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params
      ),
      query(`SELECT COUNT(*)::int AS total FROM entries e ${whereSql}`, params),
    ]);

    res.json({ items: list.rows, total: count.rows[0].total, page, pageSize });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await fetchEntry(parseId(req.params.id));
    if (!entry || (req.user.role === 'MEMBRO' && entry.user_id !== req.user.id)) {
      throw new HttpError(404, 'Lançamento não encontrado.');
    }
    res.json({ entry });
  })
);

// Novo lançamento (somente membro, sempre em nome de quem está logado)
router.post(
  '/',
  requireMember,
  entryPhotosUpload,
  asyncHandler(async (req, res) => {
    const before = req.files?.foto_antes?.[0];
    const after = req.files?.foto_depois?.[0];
    if (!before) throw new HttpError(400, 'A foto "ANTES" é obrigatória.');
    if (!after) throw new HttpError(400, 'A foto "DEPOIS" é obrigatória.');
    if (!looksLikeImage(before.buffer)) throw new HttpError(400, 'A foto "ANTES" não é uma imagem válida.');
    if (!looksLikeImage(after.buffer)) throw new HttpError(400, 'A foto "DEPOIS" não é uma imagem válida.');

    const qtyDone = parseNonNegativeInt(req.body.qty_done, 'Quantidade feita');
    const qtyBanned = parseNonNegativeInt(req.body.qty_banned, 'Quantidade banida');
    const description = String(req.body.description ?? '').trim();
    if (description.length > MAX_TEXT) {
      throw new HttpError(400, `A descrição pode ter no máximo ${MAX_TEXT} caracteres.`);
    }

    const folder = `user-${req.user.id}`;
    const results = await Promise.allSettled([
      uploadImage(before.buffer, folder),
      uploadImage(after.buffer, folder),
    ]);
    const uploaded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (uploaded.length < 2) {
      await Promise.all(uploaded.map((u) => deleteImage(u.publicId)));
      const reason = results.find((r) => r.status === 'rejected')?.reason;
      console.error('[entries] Falha no upload para o Cloudinary:', reason?.message || reason);
      throw new HttpError(502, 'Não foi possível enviar as fotos. Tente novamente.');
    }
    const [beforeImg, afterImg] = uploaded;

    try {
      const { rows } = await query(
        `INSERT INTO entries
           (user_id, before_url, before_public_id, after_url, after_public_id, qty_done, qty_banned, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          req.user.id,
          beforeImg.url,
          beforeImg.publicId,
          afterImg.url,
          afterImg.publicId,
          qtyDone,
          qtyBanned,
          description || null,
        ]
      );
      res.status(201).json({ entry: await fetchEntry(rows[0].id) });
    } catch (err) {
      await Promise.all([deleteImage(beforeImg.publicId), deleteImage(afterImg.publicId)]);
      throw err;
    }
  })
);

// Aprovar / reprovar (somente admin). Também permite reavaliar para corrigir engano.
router.patch(
  '/:id/review',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const status = String(req.body?.status ?? '').toUpperCase();
    if (status !== 'APROVADO' && status !== 'REPROVADO') {
      throw new HttpError(400, 'Status deve ser APROVADO ou REPROVADO.');
    }
    const comment = String(req.body?.comment ?? '').trim();
    if (status === 'REPROVADO' && !comment) {
      throw new HttpError(400, 'Informe o motivo da reprovação no comentário.');
    }
    if (comment.length > MAX_TEXT) {
      throw new HttpError(400, `O comentário pode ter no máximo ${MAX_TEXT} caracteres.`);
    }

    const { rowCount } = await query(
      `UPDATE entries
          SET status = $1, admin_comment = $2, reviewed_by = $3,
              reviewed_at = NOW(), member_seen = FALSE
        WHERE id = $4`,
      [status, comment || null, req.user.id, id]
    );
    if (rowCount === 0) throw new HttpError(404, 'Lançamento não encontrado.');
    res.json({ entry: await fetchEntry(id) });
  })
);

export default router;
