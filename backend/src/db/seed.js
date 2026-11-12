// Cria o primeiro usuário ADMIN (a partir do .env).
// Com a flag --membros, cria também 5 membros iniciais com senhas aleatórias.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const BCRYPT_ROUNDS = 12;
const createMembers = process.argv.includes('--membros');

async function upsertUser({ name, username, password, role }) {
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rowCount > 0) return false;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query(
    'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
    [name, username, hash, role]
  );
  return true;
}

try {
  const name = process.env.ADMIN_NAME || 'Administrador';
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error('Defina ADMIN_PASSWORD no .env (mínimo 8 caracteres).');
  }

  const created = await upsertUser({ name, username, password, role: 'ADMIN' });
  console.log(created ? `Admin "${username}" criado.` : `Admin "${username}" já existe — nada alterado.`);

  if (createMembers) {
    console.log('\nMembros iniciais (anote as senhas, elas não serão mostradas de novo):');
    for (let i = 1; i <= 5; i++) {
      const memberUsername = `membro${i}`;
      const memberPassword = randomBytes(6).toString('base64url');
      const ok = await upsertUser({
        name: `Membro ${i}`,
        username: memberUsername,
        password: memberPassword,
        role: 'MEMBRO',
      });
      console.log(ok ? `  ${memberUsername} / ${memberPassword}` : `  ${memberUsername} já existe — ignorado`);
    }
  }
} catch (err) {
  console.error('Falha no seed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
