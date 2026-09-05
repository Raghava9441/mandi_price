import { defineConfig } from 'vitest/config';

/** Live contract tests: real network, real API key, run on demand. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 60_000,
    // Sequential: the upstream rate-limits bursts, and parallel probes just trip it.
    fileParallelism: false,
  },
});
