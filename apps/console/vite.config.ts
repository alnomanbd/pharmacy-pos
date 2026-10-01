import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * The Dawai operator console — its own origin, its own API.
 *
 * `/api` is proxied here exactly as it is for the shop app, so the console
 * talks to the API on its own origin. That is what keeps the session cookie
 * host-only and keeps the authenticated API off the CORS surface entirely -
 * see docs/ARCHITECTURE.md.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@dawai/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**'],
    css: false,
  },
  server: {
    // Beside the shop app (5175), talking to the Dawai API (5100).
    port: 5176,
    proxy: {
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
    },
  },
});
