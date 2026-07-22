import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

// Custom plugin to copy libs folder to dist/libs
function copyLibsPlugin() {
  return {
    name: 'copy-libs',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'libs');
      const destDir = path.resolve(__dirname, 'dist/libs');
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log('[copy-libs] Successfully copied libs to dist/libs');
      }
      
      const srcJsDir = path.resolve(__dirname, 'js');
      const destJsDir = path.resolve(__dirname, 'dist/js');
      if (fs.existsSync(srcJsDir)) {
        fs.mkdirSync(destJsDir, { recursive: true });
        fs.cpSync(srcJsDir, destJsDir, { recursive: true });
        console.log('[copy-libs] Successfully copied js to dist/js');
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyLibsPlugin()],
  base: './', // Important for Electron
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'renderer.html')
      }
    }
  },
  // Vitest: only pick up unit test files; never touch Playwright E2E specs
  test: {
    include: ['tests/*.test.{js,ts}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
