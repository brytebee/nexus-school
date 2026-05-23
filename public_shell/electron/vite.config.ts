import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './', // Important for Electron
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'renderer.html')
      }
    }
  },
  // Vitest: only pick up unit test files; never touch Playwright E2E specs
  test: {
    include: ['tests/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
