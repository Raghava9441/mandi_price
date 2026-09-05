import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Live tests hit the real data.gov.in API and need a key, so they are opt-in.
    exclude: ['tests/live/**', 'node_modules/**'],
  },
});
