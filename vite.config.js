import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    root: '.',
    include: ['test/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
