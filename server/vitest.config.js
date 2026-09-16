import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Integration tests each start an in-memory MongoDB; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      INFERENCE_DRIVER: 'mock',
      MONGO_URI: '',
      STORAGE_DRIVER: 'local',
      UPLOAD_DIR: path.join(os.tmpdir(), 'krishiscan-test-uploads'),
    },
  },
});
