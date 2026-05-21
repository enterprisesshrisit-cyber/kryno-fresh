import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED }
    : undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
