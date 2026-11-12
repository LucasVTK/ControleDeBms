import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

/**
 * Onde as fotos ficam, por ordem de preferência:
 *  1. Supabase Storage  (SUPABASE_URL + SUPABASE_SERVICE_KEY)  ← produção
 *  2. Cloudinary        (CLOUDINARY_*)                          ← alternativa
 *  3. Disco local       (backend/uploads)                       ← só para testes
 */
const env = process.env;
export const storageProvider =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
    ? 'supabase'
    : env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
      ? 'cloudinary'
      : 'local';

export const useLocalStorage = storageProvider === 'local';
export const LOCAL_UPLOAD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../uploads');

/** Só o Cloudinary converte HEIC para JPG; nos outros o navegador não conseguiria exibir. */
export const acceptsHeic = storageProvider === 'cloudinary';

function detectType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return { ext: 'png', mime: 'image/png' };
  if (buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return { ext: 'heic', mime: 'image/heic' };
}

// ---------- Supabase Storage ----------
const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_BUCKET = env.SUPABASE_BUCKET || 'fotos';

function supabaseHeaders(extra = {}) {
  const key = env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, ...extra };
  // Chaves antigas (JWT "service_role") também vão no Authorization; as novas (sb_secret_...) só no apikey.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function uploadSupabase(buffer, subfolder) {
  const { ext, mime } = detectType(buffer);
  const path = `${subfolder}/${randomUUID()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': mime, 'Cache-Control': '31536000', 'x-upsert': 'false' }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${await res.text()}`);
  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`,
    publicId: `supabase:${path}`,
  };
}

async function deleteSupabase(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}`, {
    method: 'DELETE',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${await res.text()}`);
}

// ---------- Cloudinary ----------
if (storageProvider === 'cloudinary') {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function uploadCloudinary(buffer, subfolder) {
  return new Promise((resolvePromise, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${config.cloudinaryFolder}/${subfolder}`,
        resource_type: 'image',
        format: 'jpg', // converte HEIC e afins para um formato que todo navegador abre
        transformation: [{ width: 2400, height: 2400, crop: 'limit', quality: 'auto' }],
      },
      (err, result) => {
        if (err) return reject(err);
        resolvePromise({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// ---------- Disco local (testes) ----------
async function uploadLocal(buffer, subfolder) {
  const name = `${randomUUID()}.${detectType(buffer).ext}`;
  const path = `${subfolder}/${name}`;
  await mkdir(join(LOCAL_UPLOAD_DIR, subfolder), { recursive: true });
  await writeFile(join(LOCAL_UPLOAD_DIR, path), buffer);
  return { url: `/uploads/${path}`, publicId: `local:${path}` };
}

/** Sobe um buffer de imagem e devolve { url, publicId }. */
export function uploadImage(buffer, subfolder) {
  if (storageProvider === 'supabase') return uploadSupabase(buffer, subfolder);
  if (storageProvider === 'cloudinary') return uploadCloudinary(buffer, subfolder);
  return uploadLocal(buffer, subfolder);
}

export async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    if (publicId.startsWith('supabase:')) {
      await deleteSupabase(publicId.slice('supabase:'.length));
    } else if (publicId.startsWith('local:')) {
      await unlink(join(LOCAL_UPLOAD_DIR, publicId.slice('local:'.length)));
    } else {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
  } catch (err) {
    console.error('[storage] Falha ao remover imagem órfã', publicId, err.message);
  }
}
