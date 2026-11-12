import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Valida o JWT e carrega o usuário do banco (assim um usuário desativado
 * perde o acesso imediatamente, mesmo com token ainda válido).
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Não autenticado.');

    let payload;
    try {
      // Só aceita HS256 (bloqueia "alg: none" e troca de algoritmo)
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw new HttpError(401, 'Sessão expirada ou inválida. Faça login novamente.');
    }
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0 || userId > 2147483647) {
      throw new HttpError(401, 'Sessão inválida. Faça login novamente.');
    }

    const { rows } = await query(
      `SELECT id, name, username, role, active,
              FLOOR(EXTRACT(EPOCH FROM password_changed_at))::bigint AS pwd_changed
         FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];
    if (!user || !user.active) throw new HttpError(401, 'Usuário inexistente ou desativado.');
    // Senha trocada depois que o token foi emitido: sessão antiga não vale mais
    if (user.pwd_changed && Number(payload.iat) < Number(user.pwd_changed)) {
      throw new HttpError(401, 'Sua senha foi alterada. Faça login novamente.');
    }
    delete user.pwd_changed;

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Você não tem permissão para esta ação.'));
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireMember = requireRole('MEMBRO');
