import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { config, requireRuntimeConfig } from './config.js';
import { HttpError } from './utils/http.js';
import { multerErrorMessage } from './middleware/upload.js';
import { LOCAL_UPLOAD_DIR, useLocalStorage } from './services/storage.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import entryRoutes from './routes/entries.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';

requireRuntimeConfig();

const app = express();
app.set('trust proxy', 1); // atrás de proxy (Vercel etc.), necessário p/ o rate limit
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

if (useLocalStorage) {
  console.warn('[storage] Cloudinary não configurado: fotos serão salvas em backend/uploads (modo teste).');
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d' }));
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: multerErrorMessage(err) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err.code === '23514') return res.status(400).json({ error: 'Dados inválidos.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

export default app;
