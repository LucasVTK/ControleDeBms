import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/http.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// Mantém em memória: o arquivo vai direto para o Cloudinary, nada fica no disco.
export const entryPhotosUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 2, fields: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpError(400, 'Formato de imagem não aceito. Use JPG, PNG, WEBP ou HEIC.'));
    }
    cb(null, true);
  },
}).fields([
  { name: 'foto_antes', maxCount: 1 },
  { name: 'foto_depois', maxCount: 1 },
]);

/**
 * Confere a assinatura binária do arquivo (o mimetype vem do cliente e
 * pode ser falsificado).
 */
export function looksLikeImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  // WEBP: "RIFF....WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
  // HEIC/HEIF: "....ftyp<brand>"
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return true;
  }
  return false;
}

export function multerErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return `Imagem muito grande. Tamanho máximo: ${Math.round(config.maxImageBytes / 1024 / 1024)} MB.`;
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    return 'Envie apenas as fotos "antes" e "depois".';
  }
  return 'Erro no envio do arquivo.';
}
