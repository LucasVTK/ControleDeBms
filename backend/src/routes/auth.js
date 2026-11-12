import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { clientIp, enforce } from '../services/rateLimit.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();

// Limites contra força bruta (guardados no banco, valem entre instâncias da Vercel)
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_MAX_PER_USER = 10; // tentativas por login a cada 15 min
const LOGIN_MAX_PER_IP = 40; // tentativas por IP a cada 15 min (vários logins)

// Hash fixo para comparar quando o usuário não existe (evita revelar por tempo de resposta).
// (pré-calculado para não gastar tempo na inicialização da função serverless)
const DUMMY_HASH = '$2a$12$5tZmaPp7yCzVXbTmeo3K0OywXrhdhB54GCHIRyU4Y3awD9gwBJqMW';

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const rawUser = req.body?.username;
    const rawPass = req.body?.password;
    if (typeof rawUser !== 'string' || typeof rawPass !== 'string') {
      throw new HttpError(400, 'Informe login e senha.');
    }
    const username = rawUser.trim().toLowerCase().slice(0, 100);
    const password = rawPass.slice(0, 200);
    if (!username || !password) throw new HttpError(400, 'Informe login e senha.');

    const tooMany = 'Muitas tentativas de login.';
    await enforce(res, `login:ip:${clientIp(req)}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_SEC, tooMany);
    await enforce(res, `login:user:${username}`, LOGIN_MAX_PER_USER, LOGIN_WINDOW_SEC, tooMany);

    const { rows } = await query(
      'SELECT id, name, username, role, active, password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Login ou senha incorretos.');
    if (!user.active) throw new HttpError(403, 'Este usuário está desativado. Fale com o administrador.');

    // Login certo zera o contador desse usuário
    await query('DELETE FROM rate_limits WHERE key = $1', [`login:user:${username}`]);
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
