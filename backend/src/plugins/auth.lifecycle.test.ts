import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../db/pool.js';
import { tokenService } from '../services/token.service.js';
import { AppError } from '../utils/errors.js';
import { authenticateAccessToken, assertActiveRelayAuthority } from './auth.js';

const claims = { sub: 'fixture-user', sid: 'fixture-session', did: 'fixture-device',
  family: 'fixture-family', type: 'access' as const, exp: Math.floor(Date.now() / 1000) + 3600 };
const session = { user_id: claims.sub, device_id: claims.did, trusted: true, active_family: true };
const expired = (error: unknown) => error instanceof AppError && error.statusCode === 401;

test('access authorization requires the signed current login family, not just a trusted device', async t => {
  t.mock.method(tokenService, 'verifyAccessToken', async () => claims);
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /r.token_family_id = \$2/);
    assert.match(sql, /r.revoked_at is null/);
    assert.deepEqual(values, [claims.sid, claims.family]);
    return { rows: [session] };
  });
  const auth = await authenticateAccessToken('synthetic-token');
  assert.equal(auth.tokenFamilyId, claims.family);
  assert.equal(auth.accessExpiresAt, claims.exp * 1000);
});

test('a revoked family cannot authorize a still-trusted device', async t => {
  t.mock.method(tokenService, 'verifyAccessToken', async () => claims);
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...session, active_family: false }] }));
  await assert.rejects(authenticateAccessToken('synthetic-token'), expired);
});

test('legacy access without family requests refresh rather than inferring a new family', async t => {
  t.mock.method(tokenService, 'verifyAccessToken', async () => ({ ...claims, family: undefined }));
  t.mock.method(pool, 'query', async () => { throw new Error('Legacy access must not choose a family'); });
  await assert.rejects(authenticateAccessToken('synthetic-token'), error => expired(error) &&
    (error as AppError).code === 'ACCESS_TOKEN_EXPIRED');
});

test('wrong token type and mismatched device are rejected', async t => {
  t.mock.method(tokenService, 'verifyAccessToken', async () => ({ ...claims, type: 'refresh' } as never));
  await assert.rejects(authenticateAccessToken('synthetic-token'), expired);
  t.mock.restoreAll();
  t.mock.method(tokenService, 'verifyAccessToken', async () => claims);
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...session, device_id: 'other-device' }] }));
  await assert.rejects(authenticateAccessToken('synthetic-token'), expired);
});

test('relay command authority checks exact account, installation and family', async t => {
  const auth = { userId: claims.sub, sessionId: claims.sid, deviceId: claims.did,
    tokenFamilyId: claims.family, accessExpiresAt: Date.now() + 60000 };
  t.mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /d.trusted = true/);
    assert.match(sql, /r.expires_at > now\(\)/);
    assert.deepEqual(values, [claims.sid, claims.sub, claims.did, claims.family]);
    return { rows: [{ id: claims.sid }] };
  });
  await assertActiveRelayAuthority(auth);
});

test('expired relay authority fails before querying and revoked authority fails closed', async t => {
  const auth = { userId: claims.sub, sessionId: claims.sid, deviceId: claims.did,
    tokenFamilyId: claims.family, accessExpiresAt: Date.now() - 1 };
  let queries = 0;
  t.mock.method(pool, 'query', async () => { queries++; return { rows: [] }; });
  await assert.rejects(assertActiveRelayAuthority(auth), expired);
  assert.equal(queries, 0);
  await assert.rejects(assertActiveRelayAuthority({ ...auth, accessExpiresAt: Date.now() + 60000 }), expired);
  assert.equal(queries, 1);
});
