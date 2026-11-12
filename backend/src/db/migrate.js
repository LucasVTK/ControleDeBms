import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

try {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migração concluída: tabelas criadas/atualizadas.');
} catch (err) {
  console.error('Falha na migração:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
