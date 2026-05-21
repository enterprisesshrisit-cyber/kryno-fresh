import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { flushObservability } from './services/observability.service.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = await buildApp();
const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, '..', 'db', 'schema.sql');

async function ensureSchema() {
  if (env.APP_ENV === 'production') {
    return;
  }

  const sql = await readFile(schemaPath, 'utf8');
  await pool.query(sql);
}

async function start() {
  try {
    await ensureSchema();
    await app.listen({
      port: env.PORT,
      host: env.HOST
    });
    app.log.info(`auth service listening on ${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    await flushObservability();
    process.exit(1);
  }
}

const shutdown = async () => {
  await app.close();
  await pool.end();
  await flushObservability();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void start();
