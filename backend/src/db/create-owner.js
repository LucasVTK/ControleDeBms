// Cria (ou promove) a conta de DONO do sistema.
// Uso: OWNER_USERNAME=lucas OWNER_NAME="Lucas" node src/db/create-owner.js
// Se OWNER_PASSWORD não for informado, gera uma senha forte e mostra uma única vez.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

try {
  const username = String(process.env.OWNER_USERNAME || '').trim().toLowerCase();
  const name = String(process.env.OWNER_NAME || 'Dono').trim();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Defina OWNER_USERNAME (3 a 30 caracteres: a-z, 0-9, . _ -).');

  const generated = !process.env.OWNER_PASSWORD;
  const password = process.env.OWNER_PASSWORD || randomBytes(12).toString('base64url');
  if (password.length < 8 || password.length > 72) throw new Error('OWNER_PASSWORD deve ter entre 8 e 72 caracteres.');
  const hash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'DONO')
     ON CONFLICT (username) DO UPDATE
       SET role = 'DONO', active = TRUE, password_hash = EXCLUDED.password_hash, password_changed_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [name, username, hash]
  );
  console.log(rows[0].inserted ? `Conta de dono "${username}" criada.` : `Conta "${username}" agora é DONO (senha redefinida).`);
  if (generated) console.log(`Senha: ${password}\n(anote; ela não será mostrada de novo — dá para trocar no painel em "Minha senha")`);
} catch (err) {
  console.error('Falha:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
