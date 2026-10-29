import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api calls are forwarded to the Express server, so the browser sees a single
// origin (same as production, where vercel.json proxies /api to the deployed backend).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: true },
    },
  },
});
