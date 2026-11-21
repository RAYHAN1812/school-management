import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://sms:sms_dev_password@localhost:5432/sms_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      JWT_EXPIRES_IN: '1h',
      CLIENT_URL: 'http://localhost:5173',
      PUBLIC_SCHOOL_CODE: 'GIS',
      BCRYPT_ROUNDS: '4',
      // Keep test uploads out of the real uploads folder.
      UPLOAD_DIR: path.join(os.tmpdir(), 'sms-test-uploads'),
    },
  },
});
