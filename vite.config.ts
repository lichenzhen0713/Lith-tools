import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/** KaTeX ships ttf/woff fallbacks; modern browsers use woff2, so prune the rest. */
function pruneLegacyFonts() {
  return {
    name: 'prune-legacy-fonts',
    apply: 'build' as const,
    closeBundle() {
      const assets = path.resolve(import.meta.dirname, 'dist/assets');
      if (!fs.existsSync(assets)) return;
      let saved = 0;
      for (const file of fs.readdirSync(assets)) {
        if (/\.(ttf|woff)$/i.test(file)) {
          const full = path.join(assets, file);
          saved += fs.statSync(full).size;
          fs.rmSync(full);
        }
      }
      if (saved > 0) console.log(`[build] pruned legacy font files: ${(saved / 1024 / 1024).toFixed(2)} MB`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), pruneLegacyFonts()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**', '**/data/**', '**/*.TMP', '**/*~RF*', '**/*.tmp'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (/[\\/]node_modules[\\/](marked|dompurify)[\\/]/.test(id)) {
            return 'vendor-markdown';
          }
        },
      },
    },
  },
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
}));
