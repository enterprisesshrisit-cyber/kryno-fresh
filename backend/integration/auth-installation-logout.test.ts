import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { deriveFixture } from './logout-fixture.js';

test('PostgreSQL and HTTP: exact installation logout is durable and leaves replacement authority intact', async t => {
  const target = new URL(env.DATABASE_URL);
  assert.equal(target.href, 'postgres://fixture@127.0.0.1:56498/kryno_logout_fixture');
  assert.equal(env.APP_ENV, 'test');
  assert.equal(env.REDIS_URL, undefined);
  assert.equal(env.SENTRY_DSN, undefined);
  assert.equal(env.AUTH_DURABLE_LOGOUT_ENABLED, false);
  assert.deepEqual(env.AUTH_DURABLE_LOGOUT_TARGETS, []);
  const fixtureMarker = await pool.query('select name from local_logout_fixture_marker');
  assert.deepEqual(fixtureMarker.rows, [{ name: 'disposable synthetic logout QA' }]);
  env.AUTH_DURABLE_LOGOUT_ENABLED = true;
  t.after(async () => {
    env.AUTH_DURABLE_LOGOUT_ENABLED = false;
    env.AUTH_DURABLE_LOGOUT_TARGETS = [];
    await pool.end();
  });

  const app = await buildApp();
  const targetFor = (f: Awaited<ReturnType<typeof deriveFixture>>) => ({
    userId: f.account, deviceSessionId: f.session, deviceId: f.deviceId
  });
  const submit = (f: Awaited<ReturnType<typeof deriveFixture>>, overrides = {}) =>
    app.inject({ method: 'POST', url: '/api/auth/logout/installation', payload: {
      device_id: f.deviceId, refresh_fingerprint: f.fingerprint, installation_credential: f.proof, ...overrides
    } });
  try {
    await t.test('known old predecessor revokes its whole current family and removes only its binding', async () => {
      const f = await deriveFixture();
      env.AUTH_DURABLE_LOGOUT_TARGETS = [targetFor(f)];
      const first = await submit(f);
      assert.equal(first.statusCode, 204);
      assert.equal(first.headers['x-kryno-logout-receipt'], '1');
      const state = await f.state();
      assert.deepEqual(state, { live: 0, rows: 2, reuse: 0, bound: false, retired: true, ownerUnchanged: true });
      assert.equal((await submit(f)).statusCode, 204);
      assert.deepEqual(await f.state(), state);
    });

    await t.test('missing proof or mismatched installation leaves the fixture family unchanged', async () => {
      const f = await deriveFixture();
      const other = await deriveFixture();
      env.AUTH_DURABLE_LOGOUT_TARGETS = [targetFor(f), targetFor(other)];
      const before = await f.state();
      for (const change of [
        { installation_credential: 'ff'.repeat(32) },
        { refresh_fingerprint: 'aa'.repeat(32) },
        { device_id: other.deviceId, installation_credential: other.proof }
      ]) {
        const rejected = await submit(f, change);
        assert.equal(rejected.statusCode, 403);
        assert.equal(rejected.headers['x-kryno-logout-receipt'], undefined);
        assert.equal(rejected.json().error, 'INSTALLATION_LOGOUT_UNVERIFIED');
      }
      assert.deepEqual(await f.state(), before);
      assert.equal((await other.state()).live, 1);
    });

    await t.test('matching proof does not broaden the exact account and session allowlist', async () => {
      const f = await deriveFixture();
      const target = targetFor(f);
      const before = await f.state();
      for (const entry of [[], [{ ...target, deviceSessionId: randomUUID() }],
        [{ ...target, userId: randomUUID() }]]) {
        env.AUTH_DURABLE_LOGOUT_TARGETS = entry;
        const rejected = await submit(f);
        assert.equal(rejected.statusCode, 403);
        assert.equal(rejected.headers['x-kryno-logout-receipt'], undefined);
        assert.deepEqual(await f.state(), before);
      }
    });

    await t.test('same-account later login on the same device session keeps its family and binding', async () => {
      const f = await deriveFixture();
      env.AUTH_DURABLE_LOGOUT_TARGETS = [targetFor(f)];
      const replacement = await deriveFixture({ deviceId: f.deviceId, account: f.account });
      assert.equal(replacement.session, f.session);
      const before = await replacement.state();
      await Promise.all([submit(f), submit(f)]).then(results => {
        for (const result of results) assert.equal(result.statusCode, 204);
      });
      assert.equal((await f.state()).live, 0);
      assert.deepEqual(await replacement.state(), before);
      assert.equal(before.live, 1);
      assert.equal(before.bound, true);
    });

    await t.test('different-account later login on the same installation keeps its family and binding', async () => {
      const f = await deriveFixture();
      env.AUTH_DURABLE_LOGOUT_TARGETS = [targetFor(f)];
      const replacement = await deriveFixture({ deviceId: f.deviceId });
      const before = await replacement.state();
      const rejected = await submit(replacement);
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.headers['x-kryno-logout-receipt'], undefined);
      assert.equal((await submit(f)).statusCode, 204);
      assert.equal((await f.state()).live, 0);
      assert.deepEqual(await replacement.state(), before);
      assert.equal(before.live, 1);
      assert.equal(before.bound, true);
    });

    await t.test('a transaction failing retirement cannot acknowledge or leave partial revocation', async () => {
      const f = await deriveFixture();
      env.AUTH_DURABLE_LOGOUT_TARGETS = [targetFor(f)];
      const before = await f.state();
      const label = randomUUID().replaceAll('-', '');
      const constraint = `fixture_reject_retire_${label}`;
      // Only the disposable cluster is eligible; parameterized row work below.
      await pool.query(`alter table push_installation_owners add constraint ${constraint}
        check (device_id <> '${f.deviceId}' or retired_at is null)`);
      try {
        const failed = await submit(f);
        assert.equal(failed.statusCode, 500);
        assert.equal(failed.headers['x-kryno-logout-receipt'], undefined);
        assert.deepEqual(await f.state(), before);
      } finally { await pool.query(`alter table push_installation_owners drop constraint ${constraint}`); }
    });
  } finally { await app.close(); }
});
