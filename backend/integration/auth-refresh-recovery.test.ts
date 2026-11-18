import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test, { type TestContext } from 'node:test';
import argon2 from 'argon2';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool, withTransaction } from '../src/db/pool.js';
import { authService } from '../src/services/auth.service.js';
import { lockPushInstallation } from '../src/services/push-ownership.service.js';
import { tokenService } from '../src/services/token.service.js';
import { sha256 } from '../src/utils/crypto.js';
import { AppError } from '../src/utils/errors.js';

const proof = 'b9'.repeat(32);
const meta = { ip: null, userAgent: null };
const isCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

function requireLocalFixture() {
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '56497');
  assert.equal(url.pathname, '/kryno_refresh_fixture');
  assert.equal(url.username, 'fixture');
  assert.equal(env.APP_ENV, 'test');
  assert.equal(env.AUTH_REFRESH_RECOVERY_ENABLED, false);
  assert.deepEqual(env.AUTH_REFRESH_RECOVERY_TARGETS, []);
  assert.equal(env.AUTH_REFRESH_RECOVERY_KEY, 'a4'.repeat(32));
  assert.equal(env.REDIS_URL, undefined);
  assert.equal(env.SENTRY_DSN, undefined);
}

function allowScope(t: TestContext, subject: { userId: string; sessionId: string; deviceId: string }) {
  env.AUTH_REFRESH_RECOVERY_TARGETS = [{ userId: subject.userId, deviceSessionId: subject.sessionId, deviceId: subject.deviceId }];
  env.AUTH_REFRESH_RECOVERY_ENABLED = true;
  t.after(() => {
    env.AUTH_REFRESH_RECOVERY_ENABLED = false;
    env.AUTH_REFRESH_RECOVERY_TARGETS = [];
  });
}

test.after(() => pool.end());

test('Postgres: scoped refresh recovery is atomic, revocable, and backward compatible', async t => {
  requireLocalFixture();
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3500 });
  await client.connect();
  try {
    for (const table of ['device_sessions', 'refresh_tokens', 'push_installation_credentials', 'push_installation_owners']) {
      await client.query(`create temp table ${table} (like public.${table} including all)`);
    }
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));

    const seed = async (testCase: TestContext, scoped = true) => {
      const subject = { userId: randomUUID(), sessionId: randomUUID(), deviceId: randomUUID(), tokenFamilyId: randomUUID() };
      const id = randomUUID(), attemptId = randomUUID();
      allowScope(testCase, subject);
      const original = await tokenService.signRefreshToken({ ...subject, refreshRecoveryVersion: scoped ? 1 : undefined },
        id, subject.tokenFamilyId);
      await client.query('insert into pg_temp.device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [subject.sessionId, subject.userId, subject.deviceId, 'fixture-only']);
      await client.query('insert into pg_temp.push_installation_owners (device_id,device_session_id,token_family_id) values ($1,$2,$3)',
        [subject.deviceId, subject.sessionId, subject.tokenFamilyId]);
      await client.query('insert into pg_temp.push_installation_credentials (device_id,credential_hash) values ($1,$2)', [subject.deviceId, sha256(proof)]);
      await client.query(`insert into pg_temp.refresh_tokens (id,user_id,device_session_id,token_family_id,token_hash,expires_at)
        values ($1,$2,$3,$4,$5,now()+interval '1 day')`,
      [id, subject.userId, subject.sessionId, subject.tokenFamilyId, sha256(original)]);
      const input = { refreshToken: original, deviceId: subject.deviceId, recovery: { attemptId, installationCredential: proof } };
      const count = async () => (await client.query(`select count(*)::int as total,
        count(*) filter (where revoked_at is null)::int as active,
        count(*) filter (where reuse_detected)::int as reuse
        from pg_temp.refresh_tokens where token_family_id = $1`, [subject.tokenFamilyId])).rows[0];
      return { subject, original, input, count };
    };

    await t.test('same verified attempt returns the current replacement without another rotation', async sub => {
      const f = await seed(sub);
      const rotated = await authService.refresh(f.input, meta);
      const retried = await authService.refresh(f.input, meta);
      assert.equal(retried.refreshToken, rotated.refreshToken);
      assert.equal((await tokenService.verifyRefreshToken(retried.refreshToken)).rrv, 1);
      assert.equal((await tokenService.verifyAccessToken(retried.accessToken)).family, f.subject.tokenFamilyId);
      assert.deepEqual(await f.count(), { total: 2, active: 1, reuse: 0 });
    });

    await t.test('explicit logout invalidates the committed replacement and its retry', async sub => {
      const f = await seed(sub);
      await authService.refresh(f.input, meta);
      await authService.logout({ refreshToken: f.original });
      await assert.rejects(authService.refresh(f.input, meta), isCode('REFRESH_RECOVERY_OWNER_CHANGED'));
      assert.deepEqual(await f.count(), { total: 2, active: 0, reuse: 0 });
    });

    await t.test('an existing legacy session retains rotation and committed reuse revocation', async sub => {
      const f = await seed(sub, false);
      const input = { refreshToken: f.original, deviceId: f.subject.deviceId };
      await assert.rejects(authService.refresh(f.input, meta), isCode('REFRESH_RECOVERY_UNAVAILABLE'));
      assert.deepEqual(await f.count(), { total: 1, active: 1, reuse: 0 });
      await authService.refresh(input, meta);
      await assert.rejects(authService.refresh(input, meta), isCode('REFRESH_REUSE_DETECTED'));
      assert.deepEqual(await f.count(), { total: 2, active: 0, reuse: 2 });
    });

    await t.test('scope removal and legacy requests cannot consume a negotiated session', async sub => {
      const f = await seed(sub);
      const exact = env.AUTH_REFRESH_RECOVERY_TARGETS[0];
      for (const target of [
        { ...exact, userId: randomUUID() },
        { ...exact, deviceSessionId: randomUUID() },
        { ...exact, deviceId: exact.deviceId.toUpperCase() }
      ]) {
        env.AUTH_REFRESH_RECOVERY_TARGETS = [target];
        await assert.rejects(authService.refresh(f.input, meta), isCode('REFRESH_RECOVERY_UNAVAILABLE'));
      }
      env.AUTH_REFRESH_RECOVERY_TARGETS = [exact];
      env.AUTH_REFRESH_RECOVERY_ENABLED = false;
      await assert.rejects(authService.refresh(f.input, meta), isCode('REFRESH_RECOVERY_UNAVAILABLE'));
      await assert.rejects(authService.refresh({ refreshToken: f.original, deviceId: f.subject.deviceId }, meta),
        isCode('REFRESH_RECOVERY_REQUIRED'));
      assert.deepEqual(await f.count(), { total: 1, active: 1, reuse: 0 });
    });

    await t.test('disabled backend supports the legacy path before the additive schema exists', async sub => {
      // Only this disposable, connection-local table; the fixture public schema is unchanged.
      await client.query('alter table pg_temp.refresh_tokens drop column recovery_attempt_digest');
      const f = await seed(sub, false);
      env.AUTH_REFRESH_RECOVERY_ENABLED = false;
      env.AUTH_REFRESH_RECOVERY_TARGETS = [];
      const refreshed = await authService.refresh({ refreshToken: f.original, deviceId: f.subject.deviceId }, meta);
      assert.equal((await tokenService.verifyRefreshToken(refreshed.refreshToken)).rrv, undefined);
      assert.deepEqual(await f.count(), { total: 2, active: 1, reuse: 0 });
    });
  } finally {
    await client.end();
  }
});

test('Postgres: overlapping retries on distinct connections rotate an installation only once', async t => {
  requireLocalFixture();
  const userId = randomUUID(), sessionId = randomUUID(), deviceId = randomUUID(), familyId = randomUUID();
  const id = randomUUID();
  allowScope(t, { userId, sessionId, deviceId });
  const refreshToken = await tokenService.signRefreshToken({ userId, sessionId, deviceId, refreshRecoveryVersion: 1 }, id, familyId);
  const name = `fixture_${userId.replaceAll('-', '').slice(0, 22)}`;
  await withTransaction(async client => {
    await client.query('insert into users (id,username,email,password_hash) values ($1,$2,$3,$4)',
      [userId, name, `${name}@example.invalid`, 'fixture-not-a-password']);
    await client.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
      [sessionId, userId, deviceId, 'fixture-no-key']);
    await client.query('insert into push_installation_credentials (device_id,credential_hash) values ($1,$2)',
      [deviceId, sha256(proof)]);
    await client.query('insert into push_installation_owners (device_id,device_session_id,token_family_id) values ($1,$2,$3)',
      [deviceId, sessionId, familyId]);
    await client.query(`insert into refresh_tokens (id,user_id,device_session_id,token_family_id,token_hash,expires_at)
      values ($1,$2,$3,$4,$5,now()+interval '1 day')`, [id, userId, sessionId, familyId, sha256(refreshToken)]);
  });

  const gate = await pool.connect();
  const input = { refreshToken, deviceId, recovery: { attemptId: randomUUID(), installationCredential: proof } };
  let waiters = 0;
  let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof authService.refresh>>>[]> | undefined;
  try {
    await gate.query('begin');
    await lockPushInstallation(gate, deviceId);
    pending = Promise.allSettled([authService.refresh(input, meta), authService.refresh(input, meta)]);
    // Wait for both service transactions to contend on this exact installation key.
    for (let offset = 0; offset < 200; offset++) {
      const { rows } = await gate.query<{ count: number }>(`select count(*)::int as count from pg_locks held
        join pg_locks waiting using (locktype, database, classid, objid, objsubid)
        where held.pid=pg_backend_pid() and held.locktype='advisory' and held.granted and not waiting.granted`);
      waiters = rows[0].count;
      if (waiters === 2) break;
      await delay(25);
    }
  } finally {
    try { await gate.query('rollback'); }
    finally { gate.release(); }
  }
  const results = await pending;
  assert.equal(waiters, 2, 'Both requests must have waited on the same installation lock');
  assert.ok(results?.[0].status === 'fulfilled' && results[1].status === 'fulfilled');
  assert.equal(results[0].value.refreshToken, results[1].value.refreshToken);
  const counts = await pool.query(`select count(*)::int as total,
    count(*) filter (where revoked_at is null)::int as active,
    count(*) filter (where reuse_detected)::int as reuse
    from refresh_tokens where token_family_id=$1`, [familyId]);
  assert.deepEqual(counts.rows[0], { total: 2, active: 1, reuse: 0 });
});

test('Postgres: only a previously verified, opted-in installation can enroll; account switch fences its old retry', async t => {
  requireLocalFixture();
  const a = { userId: randomUUID(), sessionId: randomUUID(), deviceId: randomUUID() };
  const b = { userId: randomUUID(), sessionId: randomUUID(), deviceId: a.deviceId };
  const aOther = { ...a, sessionId: randomUUID(), deviceId: randomUUID() };
  const aUnproven = { ...a, sessionId: randomUUID(), deviceId: randomUUID() };
  const name = (id: string) => `fixture_${id.replaceAll('-', '').slice(0, 22)}`;
  const password = 'disposable-local-test-password';
  const hash = await argon2.hash(password);
  await withTransaction(async client => {
    for (const owner of [a, b]) {
      await client.query('insert into users (id,username,email,password_hash,email_verified_at) values ($1,$2,$3,$4,now())',
        [owner.userId, name(owner.userId), `${name(owner.userId)}@example.invalid`, hash]);
    }
    for (const d of [a, b, aOther, aUnproven]) {
      await client.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [d.sessionId, d.userId, d.deviceId, 'fixture-only-public-device-key']);
    }
    for (const d of [a, aOther]) {
      await client.query('insert into push_installation_credentials (device_id,credential_hash) values ($1,$2)',
        [d.deviceId, sha256(proof)]);
    }
  });
  const login = async (d: typeof a, version: 1 | undefined = 1, validProof: string | null = proof) =>
    authService.login({ identifier: name(d.userId), password, deviceId: d.deviceId, devicePublicKey: 'fixture-only-public-device-key',
      installationCredential: validProof ?? undefined, refreshRecoveryVersion: version }, meta);
  const check = async (d: typeof a, tokens: Awaited<ReturnType<typeof login>>, version?: 1) => {
    const claims = await tokenService.verifyRefreshToken(tokens.refreshToken);
    assert.equal(claims.sub, d.userId);
    assert.equal(claims.sid, d.sessionId);
    assert.equal(claims.rrv, version);
    assert.equal(tokens.refreshRecoveryVersion, version);
    assert.equal(Object.hasOwn(await tokenService.verifyAccessToken(tokens.accessToken), 'rrv'), false);
    return claims;
  };
  await check(a, await login(a)); // Backend off.
  allowScope(t, a);
  await check(a, await authService.login({ identifier: name(a.userId), password, deviceId: a.deviceId,
    devicePublicKey: 'fixture-only-public-device-key', installationCredential: proof }, meta)); // Old APK; no opt-in.
  await check(a, await login(a, 1, null));
  await check(aOther, await login(aOther));
  env.AUTH_REFRESH_RECOVERY_TARGETS.push({ userId: aUnproven.userId, deviceSessionId: aUnproven.sessionId, deviceId: aUnproven.deviceId });
  await check(aUnproven, await login(aUnproven)); // Existing session, but this login enrolls the proof.
  const enrolled = await login(a);
  const scopedClaims = await check(a, enrolled, 1);
  const retry = { refreshToken: enrolled.refreshToken, deviceId: a.deviceId, recovery: {
    attemptId: randomUUID(), installationCredential: proof
  } };
  await authService.refresh(retry, meta);
  const bLogin = await login(b);
  const bClaims = await check(b, bLogin);
  await assert.rejects(authService.refresh(retry, meta), isCode('REFRESH_RECOVERY_OWNER_CHANGED'));
  const owners = await pool.query('select device_session_id, token_family_id from push_installation_owners where device_id=$1', [a.deviceId]);
  assert.deepEqual(owners.rows, [{ device_session_id: b.sessionId, token_family_id: bClaims.family }]);
  const scopes = await pool.query('select count(*)::int as current from refresh_tokens where token_family_id=$1 and revoked_at is null',
    [scopedClaims.family]);
  assert.deepEqual(scopes.rows, [{ current: 1 }]);
  const rotatedB = await authService.refresh({ refreshToken: bLogin.refreshToken, deviceId: b.deviceId }, meta);
  assert.equal((await tokenService.verifyRefreshToken(rotatedB.refreshToken)).rrv, undefined);
});
