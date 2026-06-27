import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      canvg: path.resolve(__dirname, 'src/stubs/canvg.js'),
      'html2canvas': path.resolve(__dirname, 'src/stubs/canvg.js'),
      'dompurify': path.resolve(__dirname, 'src/stubs/canvg.js'),
    },
  },
  server: {
    hmr: { overlay: false },
    proxy: {
      '/api':     'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  optimizeDeps: {
    exclude: ['canvg', 'html2canvas', 'dompurify'],
  },
});
