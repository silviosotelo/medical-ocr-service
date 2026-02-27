import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/portal/', // Mantén esto si tu app vive en /portal/, si no, usa './'
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    host: true, // Permite que otros dispositivos entren a tu IP
    port: 5173,
    proxy: {
      // Ahora redirigimos las peticiones al puerto 13500
      '/api': {
        target: 'http://localhost:13500',
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://localhost:13500',
        changeOrigin: true
      }
    }
  }
});