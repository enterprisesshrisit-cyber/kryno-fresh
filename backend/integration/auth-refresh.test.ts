import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { authService } from '../src/services/auth.service.js';
import { tokenService } from '../src/services/token.service.js';
import { sha256 } from '../src/utils/crypto.js';
import { AppError } from '../src/utils/errors.js';

test('Postgres: rotation and replay revocation commit to isolated temporary tables', async (t) => {
  const host = new URL(env.DATABASE_URL).hostname;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Integration test only permits a local database.');
  assert.notEqual(env.APP_ENV, 'production', 'Do not run fixtures against production.');
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    // LIKE copies types/defaults/indexes but not foreign keys. All mutations below
    // resolve to connection-local temporary tables, never public app records.
    await client.query('create temp table device_sessions (like public.device_sessions including all)');
    await client.query('create temp table refresh_tokens (like public.refresh_tokens including all)');
    const subject = { userId: randomUUID(), sessionId: randomUUID(), deviceId: 'integration-test-device' };
    const family = randomUUID();
    const tokenId = randomUUID();
    const token = await tokenService.signRefreshToken(subject, tokenId, family);
    await client.query('insert into pg_temp.device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
      [subject.sessionId, subject.userId, subject.deviceId, 'public-fixture-only']);
    await client.query(`insert into pg_temp.refresh_tokens (id,user_id,device_session_id,token_family_id,token_hash,expires_at)
      values ($1,$2,$3,$4,$5,now()+interval '1 day')`,
      [tokenId, subject.userId, subject.sessionId, family, sha256(token)]);
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));

    const next = await authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null });
    const rows = await client.query('select token_hash, revoked_at, replaced_by_token_id from pg_temp.refresh_tokens');
    assert.equal(rows.rowCount, 2);
    assert.ok(rows.rows.find((row) => row.token_hash === sha256(token)).revoked_at);
    assert.equal(rows.rows.find((row) => row.token_hash === sha256(next.refreshToken)).revoked_at, null);

    await assert.rejects(authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null }),
      (error: unknown) => error instanceof AppError && error.code === 'REFRESH_REUSE_DETECTED');
    const revocations = await client.query('select revoked_at, reuse_detected from pg_temp.refresh_tokens');
    assert.equal(revocations.rows.every((row) => row.revoked_at && row.reuse_detected), true);
    await assert.rejects(authService.refresh({ refreshToken: next.refreshToken, deviceId: subject.deviceId }, { ip: null, userAgent: null }), AppError);
  } finally {
    await client.end(); // Drops only this connection's temporary tables.
  }
});
