import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { pool } from './pool.js';

const MIGRATION_LOCK_ID = 4769562461;

type MigrationFile = {
  name: string;
  sql: string;
  checksum: string;
};

function checksum(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function loadMigrationFiles() {
  const dbDir = resolve(process.cwd(), 'db');
  const schemaSql = await readFile(resolve(dbDir, 'schema.sql'), 'utf8');
  const migrationDir = resolve(dbDir, 'migrations');
  const migrationNames = (await readdir(migrationDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const migrations: MigrationFile[] = [
    {
      name: '00000000_schema.sql',
      sql: schemaSql,
      checksum: checksum(schemaSql)
    }
  ];

  for (const name of migrationNames) {
    const sql = await readFile(resolve(migrationDir, name), 'utf8');
    migrations.push({
      name,
      sql,
      checksum: checksum(sql)
    });
  }

  return migrations;
}

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function migrationAlreadyApplied(
  client: PoolClient,
  migration: MigrationFile
) {
  const result = await client.query<{ checksum: string }>(
    'select checksum from schema_migrations where name = $1 limit 1',
    [migration.name]
  );
  const applied = result.rows[0];
  if (!applied) {
    return false;
  }

  if (applied.checksum !== migration.checksum) {
    throw new Error(
      `Migration checksum mismatch for ${migration.name}. Do not edit applied migrations; create a new migration instead.`
    );
  }

  return true;
}

async function applyMigration(client: PoolClient, migration: MigrationFile) {
  if (await migrationAlreadyApplied(client, migration)) {
    console.log(`skip ${migration.name}`);
    return;
  }

  await client.query('begin');
  try {
    await client.query(migration.sql);
    await client.query(
      'insert into schema_migrations (name, checksum) values ($1, $2)',
      [migration.name, migration.checksum]
    );
    await client.query('commit');
    console.log(`apply ${migration.name}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_ID]);
    await ensureMigrationTable(client);

    const migrations = await loadMigrationFiles();
    for (const migration of migrations) {
      await applyMigration(client, migration);
    }

    console.log('database migrations complete');
  } finally {
    await client.query('select pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
