import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Ratonpur Central School API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
