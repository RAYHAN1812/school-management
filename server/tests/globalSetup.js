import { execSync } from 'node:child_process';

// Rebuild the test database from migrations, then seed demo data.
// Refuses to run against anything that doesn't look like a test database.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://sms:sms_dev_password@localhost:5432/sms_test?schema=public';
  if (!/\/[^/?]*test[^/?]*(\?|$)/.test(url)) {
    throw new Error(`Refusing to reset a non-test database: ${url}`);
  }
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? 'TestOnly@12345',
  };
  execSync('npx prisma migrate reset --force --skip-generate --skip-seed', { env, stdio: 'inherit' });
  execSync('node prisma/seed.js', { env, stdio: 'inherit' });
}
