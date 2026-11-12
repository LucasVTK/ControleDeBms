import pg from 'pg';
import { config, isVercel } from '../config.js';

// O parâmetro sslmode da URL sobrescreveria a opção `ssl` abaixo (e o pg trata
// "require" como verificação completa do certificado). Removemos e usamos DATABASE_SSL.
function cleanConnectionString(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

export const pool = new pg.Pool({
  connectionString: cleanConnectionString(config.databaseUrl),
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  // Serverless: cada instância da função usa poucas conexões (o pooler do Supabase multiplexa).
  max: isVercel ? 3 : 10,
  idleTimeoutMillis: isVercel ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Erro inesperado no pool:', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Executa fn(client) dentro de uma transação. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
