import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { pool } from '../db/pool.js';
import { authService } from './auth.service.js';

function databaseFixture(t: TestContext, options: { owner?: boolean; token?: boolean; failRetire?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  t.mock.method(pool, 'connect', async () => ({
    release() {},
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('select r.user_id')) return { rows: options.token === false ? [] : [{
        user_id: 'fixture-user', device_session_id: 'fixture-session',
        token_family_id: 'fixture-family', device_id: 'fixture-device'
      }] };
      if (sql.includes('update push_installation_owners')) {
        if (options.failRetire) throw new Error('fixture retire failure');
        return { rows: options.owner === false ? [] : [{ generation: 'fixture-generation' }] };
      }
      return { rows: [] };
    }
  }));
  return calls;
}

test('logout revokes the whole login family and clears only its generation', async (t) => {
  const calls = databaseFixture(t);
  await authService.logout({ refreshToken: 'fixture-not-a-real-token' });
  const revoke = calls.find((call) => call.sql.includes('update refresh_tokens'))!;
  assert.deepEqual(revoke.params, ['fixture-user', 'fixture-session', 'fixture-family']);
  assert.match(revoke.sql, /token_family_id = \$3/);
  const clear = calls.find((call) => call.sql.includes('update device_sessions'))!;
  assert.deepEqual(clear.params, ['fixture-session', 'fixture-generation']);
  assert.match(clear.sql, /push_owner_generation = \$2/);
  assert.ok(calls.findIndex((call) => call.sql.includes('pg_advisory_xact_lock')) < calls.indexOf(revoke));
  assert.equal(calls.at(-1)!.sql, 'commit');
});

test('late logout from an old family cannot remove the later login binding', async (t) => {
  const calls = databaseFixture(t, { owner: false });
  await authService.logout({ refreshToken: 'fixture-old-token' });
  assert.equal(calls.some((call) => call.sql.includes('update device_sessions')), false);
  assert.equal(calls.at(-1)!.sql, 'commit');
});

test('unknown logout is idempotent and never changes push authority', async (t) => {
  const calls = databaseFixture(t, { token: false });
  assert.deepEqual(await authService.logout({ refreshToken: 'fixture-unknown-token' }), { success: true });
  assert.equal(calls.some((call) => call.sql.includes('update ')), false);
});

test('failed push retirement rolls back logout rather than returning success', async (t) => {
  const calls = databaseFixture(t, { failRetire: true });
  await assert.rejects(authService.logout({ refreshToken: 'fixture-token' }), /fixture retire failure/);
  assert.equal(calls.at(-1)!.sql, 'rollback');
});
