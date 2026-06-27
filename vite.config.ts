/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, './src/engine'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
  build: {
    outDir: 'dist',
    /* CSS/JS/Asset を全てインライン化して dist/index.html 単一ファイルに集約 */
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    /* Vitest: エンジン純粋ロジックは Node 環境で十分 */
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});
