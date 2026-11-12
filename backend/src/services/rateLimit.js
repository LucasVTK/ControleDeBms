import { isVercel } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/http.js';

/**
 * Conta uma tentativa para `key` numa janela de `windowSec` segundos e
 * devolve { allowed, retryAfter }. Atômico (um único UPSERT), funciona com
 * várias instâncias serverless ao mesmo tempo.
 */
export async function hit(key, limit, windowSec) {
  const { rows } = await query(
    `INSERT INTO rate_limits (key, hits, reset_at)
     VALUES ($1, 1, NOW() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       hits     = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN NOW() + make_interval(secs => $2)
                       ELSE rate_limits.reset_at END
     RETURNING hits, CEIL(EXTRACT(EPOCH FROM (reset_at - NOW())))::int AS retry_after`,
    [key, windowSec]
  );
  // Limpeza ocasional de chaves vencidas
  if (Math.random() < 0.01) {
    query("DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'").catch(() => {});
  }
  return { allowed: rows[0].hits <= limit, retryAfter: Math.max(1, rows[0].retry_after) };
}

/** Lança 429 se o limite estourou. */
export async function enforce(res, key, limit, windowSec, message) {
  const { allowed, retryAfter } = await hit(key, limit, windowSec);
  if (!allowed) {
    res.set('Retry-After', String(retryAfter));
    const minutes = Math.ceil(retryAfter / 60);
    throw new HttpError(429, `${message} Tente novamente em ${minutes} minuto(s).`);
  }
}

/**
 * IP do cliente. Na Vercel o x-real-ip é preenchido pela própria plataforma;
 * fora dela esse cabeçalho poderia ser forjado, então usamos o IP da conexão.
 */
export function clientIp(req) {
  const ip = isVercel ? req.headers['x-real-ip'] || req.ip : req.socket?.remoteAddress || req.ip;
  return String(ip || 'desconhecido').slice(0, 64);
}
