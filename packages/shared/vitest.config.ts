import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The shared package tests itself.
 *
 * Its subjects moved here with it - the Bangla field and keyboard, the password
 * rules, the date helpers - and a test that ran from one app's suite would
 * quietly stop running the day that app stopped importing the thing.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
