import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import argon2 from 'argon2';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { authService } from '../src/services/auth.service.js';
import { devicesService } from '../src/services/devices.service.js';
import { ACTIVE_PUSH_TARGETS_SQL, activatePushOwner, lockPushInstallation } from '../src/services/push-ownership.service.js';
import { tokenService } from '../src/services/token.service.js';
import { AppError } from '../src/utils/errors.js';
import { sha256 } from '../src/utils/crypto.js';

// This is an opt-in local Postgres test, not part of production smoke tests.
test('Postgres push ownership: migration, real login/refresh/logout and registration races', { timeout: 60000 }, async (t) => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.DATABASE_URL).hostname),
    'Fixture mutations are permitted only against local Postgres.');
  assert.notEqual(env.APP_ENV, 'production', 'Never run this fixture in production.');
  const schema = `qa_push_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^qa_push_[a-f0-9]{32}$/);
  const admin = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const clients = new Set<pg.Client>();
  const releases: Promise<void>[] = [];
  let created = false;
  let failRegistrationWrite = false;
  let lockAttempt: (() => void) | null = null;
  let pauseRefreshInsert: (() => Promise<void>) | null = null;
  const openClient = async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    await client.connect();
    clients.add(client);
    await client.query(`set search_path to "${schema}"`);
    await client.query("set statement_timeout = '10s'");
    return client;
  };
  const migration = await readFile(new URL('../db/migrations/20261008_add_push_installation_owners.sql', import.meta.url), 'utf8');
  const scopeMigration = await readFile(new URL('../db/migrations/20261008_add_native_push_scope.sql', import.meta.url), 'utf8');
  const proofMigration = await readFile(new URL('../db/migrations/20261008_add_push_installation_credentials.sql', import.meta.url), 'utf8');
  const proof = 'ab'.repeat(32);
  const otherProof = 'cd'.repeat(32);
  const deviceId = `fixture-installation-${randomUUID()}`;
  const a = { userId: randomUUID(), sessionId: randomUUID(), deviceId, username: 'fixture_a' };
  const b = { userId: randomUUID(), sessionId: randomUUID(), deviceId, username: 'fixture_b' };
  const c = { userId: randomUUID(), sessionId: randomUUID(), deviceId: `fixture-other-${randomUUID()}`, username: 'fixture_c' };
  const password = 'Fixture-password-not-a-user-credential';
  const token = 'ExpoPushToken[fixture-only-no-real-device]';
  const login = async (account: typeof a) => authService.login({ identifier: account.username, password,
    deviceId: account.deviceId, installationCredential: account === c ? otherProof : proof,
    devicePublicKey: 'fixture-public-only' }, { ip: null, userAgent: null });
  const registration = async (account: typeof a, accessToken: string, pushToken = token) => {
    const claims = await tokenService.verifyAccessToken(accessToken);
    return devicesService.registerPushToken({ userId: account.userId, sessionId: account.sessionId,
      deviceId: account.deviceId, installationCredential: account === c ? otherProof : proof,
      tokenFamilyId: claims.family, provider: 'expo', pushToken, platform: 'android' });
  };
  const targets = async (userId: string) => (await admin.query(ACTIVE_PUSH_TARGETS_SQL, [userId])).rows;
  const expectStale = (error: unknown) => error instanceof AppError && error.code === 'PUSH_OWNER_CHANGED';

  await admin.connect();
  try {
    await admin.query(`create schema "${schema}"`);
    created = true;
    await admin.query(`set search_path to "${schema}"`);
    for (const name of ['users', 'device_sessions', 'refresh_tokens']) {
      await admin.query(`create table "${schema}".${name} (like public.${name} including all)`);
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const account of [a, b, c]) {
      await admin.query('insert into users (id,username,email,password_hash,email_verified_at) values ($1,$2,$3,$4,now())',
        [account.userId, account.username, `${account.username}@example.invalid`, passwordHash]);
      // Existing sessions avoid security-alert emails; no real users or mail are used.
      await admin.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [account.sessionId, account.userId, account.deviceId, 'fixture-public-only']);
    }
    const oldA = randomUUID();
    const oldB = randomUUID();
    for (const [account, family, days] of [[a, oldA, 3], [b, oldB, 2], [a, oldA, 1]] as const) {
      await admin.query(`insert into refresh_tokens (user_id,device_session_id,token_family_id,token_hash,issued_at,expires_at)
        values ($1,$2,$3,$4,now()-($5::int*interval '1 day'),now()+interval '1 day')`,
      [account.userId, account.sessionId, family, sha256(randomUUID()), days]);
    }
    await admin.query("update device_sessions set push_provider='expo', push_token=$1 where device_id=$2", [token, deviceId]);
    await admin.query(migration);
    await admin.query(scopeMigration);
    await admin.query(scopeMigration); // Explicit replay is safe in this isolated schema.
    await admin.query(proofMigration);
    await admin.query(proofMigration);
    await admin.query('insert into push_installation_credentials (device_id,credential_hash) values ($1,$2)', [deviceId, sha256(proof)]);
    // Verify the migration and all subsequent services resolve fixture relations,
    // not public data. Schema is destroyed only after every test client is closed.
    const relations = await admin.query(`select n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.oid in ('users'::regclass,'device_sessions'::regclass,'refresh_tokens'::regclass,'push_installation_owners'::regclass,
      'push_installation_credentials'::regclass)`);
    assert.equal(relations.rows.length, 5);
    assert.ok(relations.rows.every((row) => row.nspname === schema));
    t.mock.method(pool, 'connect', async () => {
      const client = await openClient();
      return {
        async query(sql: string, params?: unknown[]) {
          if (sql.includes('pg_advisory_xact_lock') && lockAttempt) { const notify = lockAttempt; lockAttempt = null; notify(); }
          const result = await client.query(sql, params);
          if (sql.includes('insert into refresh_tokens') && pauseRefreshInsert) {
            const pause = pauseRefreshInsert; pauseRefreshInsert = null; await pause();
          }
          if (failRegistrationWrite && sql.includes('push_owner_generation = $7')) throw new Error('fixture post-write failure');
          return result;
        },
        release() { releases.push(client.end().finally(() => { clients.delete(client); })); }
      };
    });
    t.mock.method(pool, 'query', async (sql: string, params?: unknown[]) => {
      const client = await openClient();
      try { return await client.query(sql, params); }
      finally { await client.end(); clients.delete(client); }
    });

    await t.test('proof table has RLS and denies consumer role/PUBLIC access', async () => {
      const row = (await admin.query(`select relrowsecurity from pg_class where oid='push_installation_credentials'::regclass`)).rows[0];
      assert.equal(row.relrowsecurity, true);
      const publicGrants = await admin.query(`select 1 from pg_class, lateral aclexplode(coalesce(relacl,acldefault('r',relowner))) acl
        where oid='push_installation_credentials'::regclass and acl.grantee=0`);
      assert.equal(publicGrants.rowCount, 0);
      for (const role of ['anon', 'authenticated']) {
        const exists = (await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount;
        if (exists) assert.equal((await admin.query(`select has_table_privilege($1,'push_installation_credentials','SELECT,INSERT,UPDATE,DELETE') as allowed`, [role])).rows[0].allowed, false);
      }
    });

    await t.test('migration selects the latest original login, not a late old-account refresh; replay retains generation', async () => {
      const first = (await admin.query('select * from push_installation_owners where device_id=$1', [deviceId])).rows[0];
      assert.equal(first.token_family_id, oldB);
      await admin.query(migration);
      const second = (await admin.query('select generation from push_installation_owners where device_id=$1', [deviceId])).rows[0];
      assert.equal(first.generation, second.generation);
      assert.equal((await targets(a.userId)).length, 0);
      assert.equal((await targets(b.userId)).length, 0);
      const legacy = await admin.query('select id from device_sessions where push_token=$1 and push_owner_generation is null', [token]);
      assert.equal(legacy.rowCount, 2, 'Legacy bytes are retained but neither association is promoted.');
    });
    const aLogin = await login(a);
    await t.test('wrong installation proof cannot steal routing even with valid account credentials', async () => {
      const before = (await admin.query('select * from push_installation_owners where device_id=$1', [deviceId])).rows[0];
      await assert.rejects(authService.login({ identifier: b.username, password, deviceId,
        installationCredential: 'ef'.repeat(32), devicePublicKey: 'fixture-public-only' }, { ip: null, userAgent: null }),
      (error: unknown) => error instanceof AppError && error.code === 'INSTALLATION_PROOF_MISMATCH');
      const after = (await admin.query('select * from push_installation_owners where device_id=$1', [deviceId])).rows[0];
      assert.deepEqual(after, before);
      assert.equal((await admin.query('select credential_hash from push_installation_credentials where device_id=$1', [deviceId])).rows[0].credential_hash,
        sha256(proof));
    });
    await t.test('legacy login without proof does not move existing push authority', async () => {
      const before = (await admin.query('select * from push_installation_owners where device_id=$1', [deviceId])).rows[0];
      await authService.login({ identifier: b.username, password, deviceId, devicePublicKey: 'fixture-public-only' },
        { ip: null, userAgent: null });
      assert.deepEqual((await admin.query('select * from push_installation_owners where device_id=$1', [deviceId])).rows[0], before);
    });
    await t.test('actual credential login signs family claim and current registration is dispatchable', async () => {
      const claims = await tokenService.verifyAccessToken(aLogin.accessToken);
      const refresh = await tokenService.verifyRefreshToken(aLogin.refreshToken);
      assert.equal(claims.family, refresh.family);
      const registered = await registration(a, aLogin.accessToken);
      assert.equal((await targets(a.userId))[0].push_generation, registered.pushGeneration);
    });
    const bLogin = await login(b);
    await t.test('A-to-B switch clears A routing; late A registration cannot steal B binding', async () => {
      await registration(b, bLogin.accessToken);
      await assert.rejects(registration(a, aLogin.accessToken), expectStale);
      assert.equal((await targets(a.userId)).length, 0);
      assert.equal((await targets(b.userId)).length, 1);
    });
    await t.test('late A logout revokes A family without clearing B generation', async () => {
      await authService.logout({ refreshToken: aLogin.refreshToken });
      assert.equal((await targets(b.userId)).length, 1);
      const activeA = await admin.query('select id from refresh_tokens where token_family_id=$1 and revoked_at is null',
        [(await tokenService.verifyRefreshToken(aLogin.refreshToken)).family]);
      assert.equal(activeA.rowCount, 0);
    });
    await t.test('refresh rotates within same owner; logout with old token revokes replacement and retires routing', async () => {
      const rotated = await authService.refresh({ refreshToken: bLogin.refreshToken, deviceId }, { ip: null, userAgent: null });
      await registration(b, rotated.accessToken);
      await authService.logout({ refreshToken: bLogin.refreshToken });
      assert.equal((await targets(b.userId)).length, 0);
      await assert.rejects(registration(b, rotated.accessToken), expectStale);
      await assert.rejects(authService.refresh({ refreshToken: rotated.refreshToken, deviceId }, { ip: null, userAgent: null }), AppError);
    });
    const aReturn = await login(a);
    await registration(a, aReturn.accessToken);
    await t.test('native scope capability is persisted; unknown versions fail the database constraint', async () => {
      const claims = await tokenService.verifyAccessToken(aReturn.accessToken);
      const result = await devicesService.registerPushToken({ userId: a.userId, sessionId: a.sessionId,
        deviceId, tokenFamilyId: claims.family, provider: 'fcm', platform: 'android',
        pushToken: 'fixture-fcm-no-real-device-token', pushScopeVersion: 1, installationCredential: proof });
      assert.equal(result.pushScopeVersion, 1);
      assert.equal((await targets(a.userId))[0].push_scope_version, 1);
      await assert.rejects(admin.query('update device_sessions set push_scope_version=2 where id=$1', [a.sessionId]),
        (error: unknown) => (error as { code?: string }).code === '23514');
      await registration(a, aReturn.accessToken);
      assert.equal((await targets(a.userId))[0].push_scope_version, 0);
    });
    await t.test('A-to-B-to-A creates new generation; old A logout cannot clear the returned A', async () => {
      await authService.logout({ refreshToken: aLogin.refreshToken });
      assert.equal((await targets(a.userId)).length, 1);
      await assert.rejects(registration(a, aLogin.accessToken), expectStale);
    });
    await t.test('failure after actual registration update rolls back to original routing', async () => {
      failRegistrationWrite = true;
      try { await assert.rejects(registration(a, aReturn.accessToken, 'ExpoPushToken[fixture-new-token]'), /fixture post-write failure/); }
      finally { failRegistrationWrite = false; }
      assert.equal((await targets(a.userId))[0].push_token, token);
    });
    const cLogin = await login(c);
    await t.test('another installation cannot claim an already bound token', async () => {
      await assert.rejects(registration(c, cLogin.accessToken),
        (error: unknown) => error instanceof AppError && error.code === 'PUSH_TOKEN_ALREADY_BOUND');
      assert.equal((await targets(a.userId)).length, 1);
      assert.equal((await targets(c.userId)).length, 0);
    });
    await t.test('concurrent refresh and logout cannot leave a live replacement token or push target', async () => {
      const active = await login(a);
      await registration(a, active.accessToken);
      let inserted!: () => void;
      let resume!: () => void;
      const insertedBarrier = new Promise<void>((resolve) => { inserted = resolve; });
      const resumeBarrier = new Promise<void>((resolve) => { resume = resolve; });
      pauseRefreshInsert = async () => { inserted(); await resumeBarrier; };
      const refresh = authService.refresh({ refreshToken: active.refreshToken, deviceId }, { ip: null, userAgent: null });
      try {
        await insertedBarrier;
        const attempted = new Promise<void>((resolve) => { lockAttempt = resolve; });
        const logout = authService.logout({ refreshToken: active.refreshToken });
        await attempted;
        resume();
        const replacement = await refresh;
        await logout;
        const family = (await tokenService.verifyRefreshToken(replacement.refreshToken)).family;
        const live = await admin.query('select id from refresh_tokens where token_family_id=$1 and revoked_at is null', [family]);
        assert.equal(live.rowCount, 0);
        assert.equal((await targets(a.userId)).length, 0);
        await assert.rejects(registration(a, replacement.accessToken), expectStale);
      } finally { resume(); await refresh.catch(() => undefined); }
    });
    const raceA = await login(a);
    await t.test('old registration queued behind switch lock fails after newer owner commits', async () => {
      const barrier = await openClient();
      try {
        await barrier.query('begin');
        await lockPushInstallation(barrier as unknown as pg.PoolClient, deviceId);
        const attempted = new Promise<void>((resolve) => { lockAttempt = resolve; });
        const pending = registration(a, raceA.accessToken).then(() => null, (error: unknown) => error);
        await attempted;
        const family = randomUUID();
        await barrier.query(`insert into refresh_tokens (user_id,device_session_id,token_family_id,token_hash,expires_at)
          values ($1,$2,$3,$4,now()+interval '1 day')`, [b.userId, b.sessionId, family, sha256(randomUUID())]);
        await activatePushOwner(barrier as unknown as pg.PoolClient, b.sessionId, deviceId, family);
        await barrier.query('commit');
        assert.ok(expectStale(await pending));
        assert.equal((await targets(a.userId)).length, 0);
      } finally { await barrier.end(); clients.delete(barrier); }
    });
    await t.test('concurrent installations claiming one token have exactly one successful owner', async () => {
      const currentA = await login(a);
      const currentC = await login(c);
      const sharedToken = 'ExpoPushToken[fixture-concurrent-token]';
      const attempts = await Promise.allSettled([
        registration(a, currentA.accessToken, sharedToken), registration(c, currentC.accessToken, sharedToken)
      ]);
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = attempts.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof AppError && rejected.reason.code === 'PUSH_TOKEN_ALREADY_BOUND');
      const bindings = await admin.query('select id from device_sessions where push_token=$1 and push_owner_generation is not null', [sharedToken]);
      assert.equal(bindings.rowCount, 1);
    });
    await t.test('expired refresh family is excluded even if a routing row remains', async () => {
      const active = await login(b);
      await registration(b, active.accessToken, 'ExpoPushToken[fixture-expiry]');
      const family = (await tokenService.verifyAccessToken(active.accessToken)).family;
      await admin.query("update refresh_tokens set expires_at=now()-interval '1 second' where token_family_id=$1", [family]);
      assert.equal((await targets(b.userId)).length, 0);
      await assert.rejects(registration(b, active.accessToken), expectStale);
    });
    await t.test('ambiguous latest legacy logins stay retired instead of guessing an owner', async () => {
      const ambiguousDevice = `fixture-ambiguous-${randomUUID()}`;
      for (const account of [a, b]) {
        const sessionId = randomUUID();
        await admin.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
          [sessionId, account.userId, ambiguousDevice, 'fixture-public-only']);
        await admin.query(`insert into refresh_tokens (user_id,device_session_id,token_family_id,token_hash,issued_at,expires_at)
          values ($1,$2,$3,$4,'2020-01-01T00:00:00Z',now()+interval '1 day')`,
        [account.userId, sessionId, randomUUID(), sha256(randomUUID())]);
      }
      await admin.query(migration);
      const owner = (await admin.query('select retired_at from push_installation_owners where device_id=$1', [ambiguousDevice])).rows[0];
      assert.ok(owner.retired_at, 'Ambiguous login times must not create an active guessed owner.');
    });
    await t.test('session removal keeps a generation tombstone so migration replay cannot reactivate an older owner', async () => {
      const removedDevice = `fixture-removed-${randomUUID()}`;
      const removedSession = randomUUID();
      const olderSession = randomUUID();
      const olderFamily = randomUUID();
      await admin.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [olderSession, a.userId, removedDevice, 'fixture-public-only']);
      await admin.query(`insert into refresh_tokens (user_id,device_session_id,token_family_id,token_hash,issued_at,expires_at)
        values ($1,$2,$3,$4,'2020-01-01T00:00:00Z',now()+interval '1 day')`,
      [a.userId, olderSession, olderFamily, sha256(randomUUID())]);
      await admin.query('insert into device_sessions (id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [removedSession, b.userId, removedDevice, 'fixture-public-only']);
      await admin.query(`insert into push_installation_owners (device_id,device_session_id,token_family_id)
        values ($1,$2,$3)`, [removedDevice, removedSession, randomUUID()]);
      const first = (await admin.query('select generation from push_installation_owners where device_id=$1', [removedDevice])).rows[0];
      await admin.query('delete from device_sessions where id=$1', [removedSession]);
      await admin.query(migration);
      const retained = (await admin.query('select generation,device_session_id from push_installation_owners where device_id=$1', [removedDevice])).rows[0];
      assert.equal(retained.device_session_id, null);
      assert.equal(retained.generation, first.generation);
      await assert.rejects(devicesService.registerPushToken({ userId: a.userId, sessionId: olderSession,
        tokenFamilyId: olderFamily, deviceId: removedDevice, provider: 'expo', platform: 'android', pushToken: token }), expectStale);
    });
    await t.test('missing ownership schema never falls back to insecure registration; login changes roll back', async () => {
      await admin.query('alter table push_installation_owners rename to fixture_hidden_owners');
      try {
        const before = (await admin.query('select count(*)::int as count from refresh_tokens')).rows[0].count;
        await assert.rejects(login(a), (error: unknown) => (error as { code?: string }).code === '42P01');
        const after = (await admin.query('select count(*)::int as count from refresh_tokens')).rows[0].count;
        assert.equal(before, after);
        const disabled = await registration(a, raceA.accessToken);
        assert.equal(disabled.ok, false);
        assert.equal(disabled.disabled, true);
      } finally { await admin.query('alter table fixture_hidden_owners rename to push_installation_owners'); }
    });
  } finally {
    await Promise.allSettled(releases);
    await Promise.allSettled([...clients].map((client) => client.end()));
    if (created) {
      assert.match(schema, /^qa_push_[a-f0-9]{32}$/);
      await admin.query('set search_path to pg_catalog');
      await admin.query(`drop schema "${schema}" cascade`);
    }
    await admin.end();
  }
});
