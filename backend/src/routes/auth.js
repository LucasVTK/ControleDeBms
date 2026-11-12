import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

// Hash fixo para comparar quando o usuário não existe (evita revelar por tempo de resposta).
// (pré-calculado para não gastar tempo na inicialização da função serverless)
const DUMMY_HASH = '$2a$12$5tZmaPp7yCzVXbTmeo3K0OywXrhdhB54GCHIRyU4Y3awD9gwBJqMW';

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!username || !password) throw new HttpError(400, 'Informe login e senha.');

    const { rows } = await query(
      'SELECT id, name, username, role, active, password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Login ou senha incorretos.');
    if (!user.active) throw new HttpError(403, 'Este usuário está desativado. Fale com o administrador.');

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
