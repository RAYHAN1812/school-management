/**
 * Docker-free PostgreSQL for local development and tests.
 *
 *   npm run db:local          (from /server)  or  npm run db:local  (from repo root)
 *
 * Runs a real PostgreSQL 17 server on port 5432 with the same credentials as
 * docker-compose (user sms / password sms_dev_password) and creates the `sms`
 * and `sms_test` databases. Data lives in server/.local-pg. Ctrl+C to stop.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', '.local-pg');
const port = Number(process.env.LOCAL_PG_PORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'sms',
  password: 'sms_dev_password',
  port,
  persistent: true,
  onLog: () => {},
});

const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log(`Initialising PostgreSQL data directory at ${dataDir} …`);
  await pg.initialise();
}
await pg.start();

for (const db of ['sms', 'sms_test']) {
  try {
    await pg.createDatabase(db);
    console.log(`Created database "${db}"`);
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
}

console.log(`PostgreSQL is running on localhost:${port} (user: sms). Press Ctrl+C to stop.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL …');
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
