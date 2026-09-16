import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Integration tests share one in-memory MongoDB per file; keep files isolated.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      INFERENCE_DRIVER: 'mock',
      MONGO_URI: '',
    },
  },
});
