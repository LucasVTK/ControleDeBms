import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin, requireMember } from '../middleware/auth.js';
import { entryPhotosUpload, looksLikeImage } from '../middleware/upload.js';
import { enforce } from '../services/rateLimit.js';
import { acceptsHeic, deleteImage, uploadImage } from '../services/storage.js';
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

// Contra abuso do storage: no máx. 30 envios/edições por membro por hora.
// Roda antes do multer, para nem ler as fotos de quem já estourou o limite.
const UPLOADS_PER_HOUR = 30;
const uploadLimit = asyncHandler(async (req, res, next) => {
  await enforce(res, `upload:user:${req.user.id}`, UPLOADS_PER_HOUR, 3600, 'Limite de envios por hora atingido.');
  next();
});

// O membro só pode editar/excluir enquanto o lançamento não foi aprovado
// (um aprovado já conta para pagamento).
const MEMBER_EDITABLE = ['PENDENTE', 'REPROVADO'];

function validatePhoto(file, label) {
  if (!looksLikeImage(file.buffer)) throw new HttpError(400, `A foto "${label}" não é uma imagem válida.`);
  if (!acceptsHeic && file.buffer.toString('ascii', 4, 8) === 'ftyp') {
    throw new HttpError(
      400,
      'Foto em formato HEIC não é aceita. No iPhone: Ajustes → Câmera → Formatos → "Mais compatível".'
    );
  }
}

function parseEntryFields(body) {
  const qtyDone = parseNonNegativeInt(body.qty_done, 'Quantidade feita');
  const qtyBanned = parseNonNegativeInt(body.qty_banned, 'Quantidade banida');
  const description = String(body.description ?? '').trim();
  if (description.length > MAX_TEXT) {
    throw new HttpError(400, `A descrição pode ter no máximo ${MAX_TEXT} caracteres.`);
  }
  return { qtyDone, qtyBanned, description: description || null };
}

/** Sobe várias fotos; se alguma falhar, apaga as que subiram e lança erro. */
async function uploadAll(files, userId) {
  const folder = `user-${userId}`;
  const results = await Promise.allSettled(files.map((f) => uploadImage(f.buffer, folder)));
  const uploaded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (uploaded.length < files.length) {
    await Promise.all(uploaded.map((u) => deleteImage(u.publicId)));
    const reason = results.find((r) => r.status === 'rejected')?.reason;
    console.error('[entries] Falha no upload das fotos:', reason?.message || reason);
    throw new HttpError(502, 'Não foi possível enviar as fotos. Tente novamente.');
  }
  return uploaded;
}

// Novo lançamento (somente membro, sempre em nome de quem está logado)
router.post(
  '/',
  requireMember,
  uploadLimit,
  entryPhotosUpload,
  asyncHandler(async (req, res) => {
    const before = req.files?.foto_antes?.[0];
    const after = req.files?.foto_depois?.[0];
    if (!before) throw new HttpError(400, 'A foto "ANTES" é obrigatória.');
    if (!after) throw new HttpError(400, 'A foto "DEPOIS" é obrigatória.');
    validatePhoto(before, 'ANTES');
    validatePhoto(after, 'DEPOIS');
    const { qtyDone, qtyBanned, description } = parseEntryFields(req.body);

    const [beforeImg, afterImg] = await uploadAll([before, after], req.user.id);
    try {
      const { rows } = await query(
        `INSERT INTO entries
           (user_id, before_url, before_public_id, after_url, after_public_id, qty_done, qty_banned, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [req.user.id, beforeImg.url, beforeImg.publicId, afterImg.url, afterImg.publicId, qtyDone, qtyBanned, description]
      );
      res.status(201).json({ entry: await fetchEntry(rows[0].id) });
    } catch (err) {
      await Promise.all([deleteImage(beforeImg.publicId), deleteImage(afterImg.publicId)]);
      throw err;
    }
  })
);

async function findOwnEditable(entryId, userId) {
  const { rows } = await query(
    'SELECT id, status, before_public_id, after_public_id FROM entries WHERE id = $1 AND user_id = $2',
    [entryId, userId]
  );
  const entry = rows[0];
  if (!entry) throw new HttpError(404, 'Lançamento não encontrado.');
  if (!MEMBER_EDITABLE.includes(entry.status)) {
    throw new HttpError(409, 'Lançamento aprovado não pode ser alterado. Fale com o admin.');
  }
  return entry;
}

/**
 * Membro edita o próprio lançamento (pendente ou reprovado).
 * Fotos são opcionais: só substitui as que vierem. Volta para PENDENTE
 * e limpa a avaliação anterior, para o admin avaliar de novo.
 */
router.patch(
  '/:id',
  requireMember,
  uploadLimit,
  entryPhotosUpload,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const current = await findOwnEditable(id, req.user.id);
    const before = req.files?.foto_antes?.[0];
    const after = req.files?.foto_depois?.[0];
    if (before) validatePhoto(before, 'ANTES');
    if (after) validatePhoto(after, 'DEPOIS');
    const { qtyDone, qtyBanned, description } = parseEntryFields(req.body);

    const newFiles = [before, after].filter(Boolean);
    const uploaded = newFiles.length ? await uploadAll(newFiles, req.user.id) : [];
    const beforeImg = before ? uploaded[0] : null;
    const afterImg = after ? uploaded[before ? 1 : 0] : null;

    let rowCount;
    try {
      // A condição de status no WHERE evita sobrescrever se o admin aprovou neste meio-tempo.
      ({ rowCount } = await query(
        `UPDATE entries
            SET qty_done = $1, qty_banned = $2, description = $3,
                before_url = COALESCE($4, before_url), before_public_id = COALESCE($5, before_public_id),
                after_url  = COALESCE($6, after_url),  after_public_id  = COALESCE($7, after_public_id),
                status = 'PENDENTE', admin_comment = NULL, reviewed_by = NULL, reviewed_at = NULL,
                member_seen = TRUE
          WHERE id = $8 AND user_id = $9 AND status = ANY($10)`,
        [
          qtyDone, qtyBanned, description,
          beforeImg?.url ?? null, beforeImg?.publicId ?? null,
          afterImg?.url ?? null, afterImg?.publicId ?? null,
          id, req.user.id, MEMBER_EDITABLE,
        ]
      ));
    } catch (err) {
      await Promise.all(uploaded.map((u) => deleteImage(u.publicId)));
      throw err;
    }
    if (rowCount === 0) {
      await Promise.all(uploaded.map((u) => deleteImage(u.publicId)));
      throw new HttpError(409, 'Este lançamento acabou de ser aprovado e não pode mais ser alterado.');
    }

    // Remove as fotos antigas que foram substituídas
    await Promise.all([
      beforeImg && deleteImage(current.before_public_id),
      afterImg && deleteImage(current.after_public_id),
    ]);
    res.json({ entry: await fetchEntry(id) });
  })
);

// Membro exclui o próprio lançamento (pendente ou reprovado)
router.delete(
  '/:id',
  requireMember,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await findOwnEditable(id, req.user.id);
    const { rows } = await query(
      `DELETE FROM entries WHERE id = $1 AND user_id = $2 AND status = ANY($3)
       RETURNING before_public_id, after_public_id`,
      [id, req.user.id, MEMBER_EDITABLE]
    );
    if (!rows[0]) throw new HttpError(409, 'Este lançamento acabou de ser aprovado e não pode mais ser excluído.');
    await Promise.all([deleteImage(rows[0].before_public_id), deleteImage(rows[0].after_public_id)]);
    res.json({ ok: true });
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
