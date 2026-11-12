import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

/**
 * Se as variáveis do Cloudinary não estiverem no .env, as fotos são salvas
 * localmente em backend/uploads (modo de desenvolvimento/teste).
 */
export const useLocalStorage = !(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

export const LOCAL_UPLOAD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../uploads');

if (!useLocalStorage) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function extensionFor(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'heic';
}

async function uploadLocal(buffer, subfolder) {
  const name = `${randomUUID()}.${extensionFor(buffer)}`;
  const publicId = `${subfolder}/${name}`;
  await mkdir(join(LOCAL_UPLOAD_DIR, subfolder), { recursive: true });
  await writeFile(join(LOCAL_UPLOAD_DIR, publicId), buffer);
  return { url: `/uploads/${publicId}`, publicId: `local:${publicId}` };
}

function uploadCloudinary(buffer, subfolder) {
  return new Promise((resolvePromise, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${config.cloudinaryFolder}/${subfolder}`,
        resource_type: 'image',
        // Converte HEIC e afins para um formato que todo navegador abre
        format: 'jpg',
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

/** Sobe um buffer de imagem e devolve { url, publicId }. */
export function uploadImage(buffer, subfolder) {
  return useLocalStorage ? uploadLocal(buffer, subfolder) : uploadCloudinary(buffer, subfolder);
}

export async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    if (publicId.startsWith('local:')) {
      await unlink(join(LOCAL_UPLOAD_DIR, publicId.slice('local:'.length)));
    } else {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
  } catch (err) {
    console.error('[storage] Falha ao remover imagem órfã', publicId, err.message);
  }
}
