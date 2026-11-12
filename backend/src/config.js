import 'dotenv/config';

// Na Vercel não existe processo contínuo: lançamos erro em vez de process.exit().
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`[config] Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

export const isVercel = Boolean(process.env.VERCEL);

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || 'bm-producao',
  maxImageBytes: (Number(process.env.MAX_IMAGE_MB) || 10) * 1024 * 1024,
};

// Regra de negócio: a cada N feitas aprovadas gera 1 pagamento.
export const FEITAS_POR_PAGAMENTO = 20;

export function requireRuntimeConfig() {
  required('JWT_SECRET');
  if (config.jwtSecret.length < 16) {
    throw new Error('[config] JWT_SECRET precisa ter pelo menos 16 caracteres.');
  }
  // Em produção (Vercel) não há disco persistente: Cloudinary é obrigatório.
  if (isVercel) {
    required('CLOUDINARY_CLOUD_NAME');
    required('CLOUDINARY_API_KEY');
    required('CLOUDINARY_API_SECRET');
  }
}
