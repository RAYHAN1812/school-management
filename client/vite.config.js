import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin /api in development so the httpOnly auth cookie just works.
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:5000', changeOrigin: true },
    },
  },
});
