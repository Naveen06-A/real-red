import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['qrcode.react'],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      crypto: 'crypto-browserify',
    },
  },
  },
  css: {
    postcss: './postcss.config.js',
  },
  base:'/'
});