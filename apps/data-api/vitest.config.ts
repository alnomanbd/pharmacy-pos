import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { DATA_API_ADMIN_TOKEN: 'test_admin_token_at_least_32_characters_long' },
    include: ['tests/**/*.test.ts'],
  },
});
