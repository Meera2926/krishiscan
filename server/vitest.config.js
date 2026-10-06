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
      // Belt as well as braces. NODE_ENV=test already makes the database ephemeral, but that was
      // one line of defence and a test which span up a server with NODE_ENV=development slipped
      // past it and deleted the developer's real database. Pinning the path here means a test
      // has to go out of its way to reach server/.mongo-data at all.
      MONGO_DB_PATH: path.join(os.tmpdir(), 'krishiscan-test-db'),
    },
  },
});
