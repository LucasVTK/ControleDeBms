import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

try {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migração concluída: tabelas criadas/atualizadas.');

  // No Supabase, cria também o bucket público das fotos (no Postgres local não existe o schema storage).
  const { rows } = await pool.query("SELECT to_regclass('storage.buckets') IS NOT NULL AS has_storage");
  if (rows[0].has_storage) {
    const bucket = process.env.SUPABASE_BUCKET || 'fotos';
    await pool.query(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
       VALUES ($1, $1, TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
       ON CONFLICT (id) DO UPDATE SET public = TRUE`,
      [bucket]
    );
    console.log(`Bucket de fotos "${bucket}" pronto no Supabase Storage.`);
  }
} catch (err) {
  console.error('Falha na migração:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
