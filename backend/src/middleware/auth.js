import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
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
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sessão expirada ou inválida. Faça login novamente.');
    }

    const { rows } = await query(
      'SELECT id, name, username, role, active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.active) throw new HttpError(401, 'Usuário inexistente ou desativado.');

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
