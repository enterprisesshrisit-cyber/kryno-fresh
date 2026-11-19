import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { pool } from '../db/pool.js';

const route = { method: 'POST' as const, url: '/api/auth/logout/installation' };
const fixture = {
  device_id: 'fixture-installation',
  refresh_fingerprint: 'a1'.repeat(32),
  installation_credential: 'c2'.repeat(32)
};

test('installation logout is strict, no-store, and confirms only on service success', async t => {
  const revoke = t.mock.method(authService, 'logoutInstallation',
    async (_input: Parameters<typeof authService.logoutInstallation>[0]) => {});
  const app = await buildApp();
  try {
    for (const payload of [
      { ...fixture, installation_credential: 'invalid' },
      { ...fixture, refresh_fingerprint: undefined },
      { ...fixture, refresh_token: 'must-not-be-carried' },
      { ...fixture, token_family_id: 'must-not-be-client-selected' }
    ]) {
      const rejected = await app.inject({ ...route, payload });
      assert.equal(rejected.statusCode, 400);
      assert.equal(rejected.headers['cache-control'], 'no-store');
      assert.equal(rejected.headers['x-kryno-logout-receipt'], undefined);
    }
    assert.equal(revoke.mock.callCount(), 0);
    const response = await app.inject({ ...route, payload: fixture });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-kryno-logout-receipt'], '1');
    assert.equal(response.body, '');
    assert.deepEqual(revoke.mock.calls[0].arguments[0], {
      deviceId: fixture.device_id, refreshFingerprint: fixture.refresh_fingerprint,
      installationCredential: fixture.installation_credential
    });
  } finally { await app.close(); }
});

test('default-off installation route has no effect on the legacy logout contract', async t => {
  const previous = env.AUTH_DURABLE_LOGOUT_ENABLED;
  env.AUTH_DURABLE_LOGOUT_ENABLED = false;
  t.after(() => { env.AUTH_DURABLE_LOGOUT_ENABLED = previous; });
  t.mock.method(pool, 'connect', async () => { throw new Error('Disabled route must not open a connection'); });
  const legacy = t.mock.method(authService, 'logout', async () => ({ success: true }));
  const app = await buildApp();
  try {
    const disabled = await app.inject({ ...route, payload: fixture });
    assert.equal(disabled.statusCode, 503);
    assert.equal(disabled.headers['x-kryno-logout-receipt'], undefined);
    assert.equal(disabled.json().error, 'INSTALLATION_LOGOUT_UNAVAILABLE');
    const old = await app.inject({ method: 'POST', url: '/api/auth/logout',
      payload: { refreshToken: 'legacy-sign-out-fixture'.repeat(2) } });
    assert.equal(old.statusCode, 200);
    assert.deepEqual(old.json(), { success: true });
    assert.equal(legacy.mock.callCount(), 1);
  } finally { await app.close(); }
});
