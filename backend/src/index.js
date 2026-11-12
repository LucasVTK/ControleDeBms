// Servidor local (desenvolvimento). Na Vercel quem usa o app é api/index.js.
import app from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`API rodando em http://localhost:${config.port}`);
});
