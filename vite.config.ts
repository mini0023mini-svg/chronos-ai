import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  // GitHub Pages 项目站点部署在 /<repo>/ 子路径下；开发环境保持根路径以免本地调试 404
  base: mode === 'production' ? '/chronos-ai/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
}));
