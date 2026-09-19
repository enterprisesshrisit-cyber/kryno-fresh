import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { authService } from './auth.service.js';
import { tokenService } from './token.service.js';

const subject = { userId: 'test-user', sessionId: 'test-session', deviceId: 'test-device' };

function databaseFixture(t: TestContext, options: { reused?: boolean; trusted?: boolean; failInsert?: boolean } = {}) {
  const queries: string[] = [];
  let committedRevocation = false;
  let pendingRevocation = false;
  const client = {
    release() {},
    async query(sql: string) {
      queries.push(sql.trim());
      if (sql === 'commit') committedRevocation = pendingRevocation;
      if (sql === 'rollback') pendingRevocation = false;
      if (sql.includes('reuse_detected = true')) pendingRevocation = true;
      if (sql.includes('from refresh_tokens')) return { rows: [{
        id: 'test-token', user_id: subject.userId, device_session_id: subject.sessionId,
        token_family_id: 'test-family', token_hash: '',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: options.reused ? new Date().toISOString() : null,
        replaced_by_token_id: options.reused ? 'replacement' : null
      }] };
      if (sql.includes('from device_sessions')) return { rows: [{ id: subject.sessionId, device_id: subject.deviceId, trusted: options.trusted ?? true }] };
      if (options.failInsert && sql.includes('insert into refresh_tokens')) throw new Error('simulated insert failure');
      return { rows: [] };
    }
  };
  t.mock.method(pool, 'connect', async () => client);
  return { queries, revoked: () => committedRevocation };
}

test('refresh reuse commits family revocation before returning a clean 401', async (t) => {
  const f = databaseFixture(t, { reused: true });
  const token = await tokenService.signRefreshToken(subject, 'test-token', 'test-family');
  await assert.rejects(authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null }),
    (error: unknown) => error instanceof AppError && error.statusCode === 401 &&
      error.code === 'REFRESH_REUSE_DETECTED' && error.message === 'Session expired, please login again.');
  assert.equal(f.revoked(), true);
  assert.ok(f.queries.includes('commit'));
  assert.equal(f.queries.includes('rollback'), false);
});

test('valid refresh returns new signed tokens and commits the rotation', async (t) => {
  const f = databaseFixture(t);
  const token = await tokenService.signRefreshToken(subject, 'test-token', 'test-family');
  const result = await authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null });
  assert.notEqual(result.refreshToken, token);
  assert.equal((await tokenService.verifyAccessToken(result.accessToken)).sub, subject.userId);
  assert.equal((await tokenService.verifyRefreshToken(result.refreshToken)).family, 'test-family');
  assert.ok(f.queries.includes('commit'));
});

test('refresh refuses an untrusted device session', async (t) => {
  const f = databaseFixture(t, { trusted: false });
  const token = await tokenService.signRefreshToken(subject, 'test-token', 'test-family');
  await assert.rejects(authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null }), AppError);
  assert.ok(f.queries.includes('rollback'));
  assert.equal(f.queries.some((sql) => sql.includes('insert into refresh_tokens')), false);
});

test('rotation database failures roll back without consuming the old token', async (t) => {
  const f = databaseFixture(t, { failInsert: true });
  const token = await tokenService.signRefreshToken(subject, 'test-token', 'test-family');
  await assert.rejects(authService.refresh({ refreshToken: token, deviceId: subject.deviceId }, { ip: null, userAgent: null }));
  assert.ok(f.queries.includes('rollback'));
  assert.equal(f.queries.includes('commit'), false);
});

test('invalid refresh JWT produces a clean 401 instead of an internal provider error', async () => {
  await assert.rejects(authService.refresh({ refreshToken: 'not-a-jwt', deviceId: subject.deviceId }, { ip: null, userAgent: null }),
    (error: unknown) => error instanceof AppError && error.statusCode === 401);
});

test('wrong-device replay cannot revoke a token family', async (t) => {
  const f = databaseFixture(t, { reused: true });
  const token = await tokenService.signRefreshToken(subject, 'test-token', 'test-family');
  await assert.rejects(authService.refresh({ refreshToken: token, deviceId: 'another-device' }, { ip: null, userAgent: null }), AppError);
  assert.equal(f.queries.length, 0);
  assert.equal(f.revoked(), false);
});
