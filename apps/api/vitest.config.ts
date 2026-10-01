import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // config/env.ts throws on missing secrets; unit tests never sign a token.
    env: {
      JWT_ACCESS_SECRET: 'test_access_secret_at_least_32_characters',
      JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_characters',
      APP_TZ: 'Asia/Dhaka',
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
