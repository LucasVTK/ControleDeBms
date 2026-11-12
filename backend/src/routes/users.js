import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin, requireMember } from '../middleware/auth.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';
import { getMemberWithStats, listMembersWithStats } from '../services/stats.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

router.use(authenticate);

// Totais do próprio membro (card da tela do membro)
router.get(
  '/me/stats',
  requireMember,
  asyncHandler(async (req, res) => {
    const member = await getMemberWithStats(req.user.id);
    res.json({ stats: member.stats });
  })
);

// ---- Rotas só do admin ----

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ members: await listMembersWithStats() });
  })
);

function validateName(name) {
  if (typeof name !== 'string') throw new HttpError(400, 'O nome deve ser um texto.');
  const n = name.trim();
  if (n.length < 2 || n.length > 100) throw new HttpError(400, 'O nome deve ter entre 2 e 100 caracteres.');
  return n;
}

function validatePassword(password) {
  if (typeof password !== 'string') throw new HttpError(400, 'A senha deve ser um texto.');
  const p = password;
  if (p.length < 8 || p.length > 72) throw new HttpError(400, 'A senha deve ter entre 8 e 72 caracteres.');
  return p;
}

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = validateName(req.body?.name);
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Login inválido: use 3 a 30 caracteres entre letras minúsculas, números, ponto, hífen ou _.');
    }
    const password = validatePassword(req.body?.password);
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const { rows } = await query(
        `INSERT INTO users (name, username, password_hash, role)
         VALUES ($1, $2, $3, 'MEMBRO') RETURNING id`,
        [name, username, hash]
      );
      res.status(201).json({ member: await getMemberWithStats(rows[0].id) });
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Já existe um usuário com esse login.');
      throw err;
    }
  })
);

// Editar membro: nome, nova senha e/ou ativar/desativar
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await query("SELECT id FROM users WHERE id = $1 AND role = 'MEMBRO'", [id]);
    if (!rows[0]) throw new HttpError(404, 'Membro não encontrado.');

    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) {
      params.push(validateName(req.body.name));
      sets.push(`name = $${params.length}`);
    }
    if (req.body?.password !== undefined) {
      params.push(await bcrypt.hash(validatePassword(req.body.password), BCRYPT_ROUNDS));
      sets.push(`password_hash = $${params.length}`, 'password_changed_at = NOW()');
    }
    if (req.body?.active !== undefined) {
      if (typeof req.body.active !== 'boolean') throw new HttpError(400, 'Campo "active" inválido.');
      params.push(req.body.active);
      sets.push(`active = $${params.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, 'Nada para atualizar.');

    params.push(id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ member: await getMemberWithStats(id) });
  })
);

export default router;
