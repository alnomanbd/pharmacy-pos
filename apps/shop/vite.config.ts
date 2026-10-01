import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * The shop app, served from shop.dawai.com.bd.
 *
 * Its own origin, apart from the operator console: a salesman's browser should
 * never download the console's code, and the till is the one screen in this
 * product that has to keep working when the line drops — which is a service
 * worker on its own origin, not a route inside another app.
 *
 * `/api` is proxied here as it is in production (nginx.conf), so the shop talks
 * to the API on its own origin and the session cookie stays host-only.
 * See docs/ARCHITECTURE.md.
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
    // The clinic app is on 5173 and the console on 5174; all three run at once.
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
    },
  },
});
