import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite abrir pelo celular na mesma rede (http://IP-DO-PC:5173)
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001', // fotos no modo teste (sem Cloudinary)
    },
  },
});
