import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';

const recoverable = '/api/auth/refresh/recoverable';
const payload = {
  refresh_token: 'fixture-only'.repeat(4),
  device_id: 'fixture-installation',
  installation_credential: 'be'.repeat(32),
  attempt_id: '2f669cf5-6330-4a57-9ee6-4af4d23f14c5'
};

test('HTTP refresh routes keep strict recovery input separate from the legacy contract', async t => {
  const tokens = { accessToken: 'fixture-access', refreshToken: 'fixture-successor' };
  const exchange = t.mock.method(authService, 'refresh', async () => tokens);
  const app = await buildApp();
  try {
    for (const invalid of [
      { ...payload, installation_credential: undefined },
      { ...payload, attempt_id: 'not-a-v4-uuid' },
      { ...payload, unexpected: true }
    ]) {
      const response = await app.inject({ method: 'POST', url: recoverable, payload: invalid });
      assert.equal(response.statusCode, 400);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.deepEqual(response.json(), { error: 'VALIDATION_ERROR', message: 'Invalid sign-in recovery request.' });
    }
    assert.equal(exchange.mock.callCount(), 0);

    const success = await app.inject({ method: 'POST', url: recoverable, payload });
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers['cache-control'], 'no-store');
    assert.deepEqual(success.json(), tokens);
    assert.deepEqual(exchange.mock.calls[0].arguments[0], {
      refreshToken: payload.refresh_token,
      deviceId: payload.device_id,
      recovery: { attemptId: payload.attempt_id, installationCredential: payload.installation_credential }
    });

    const legacy = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: {
      refreshToken: payload.refresh_token, device_id: payload.device_id
    } });
    assert.equal(legacy.statusCode, 200);
    assert.deepEqual(exchange.mock.calls[1].arguments[0], {
      refreshToken: payload.refresh_token, deviceId: payload.device_id
    });
  } finally { await app.close(); }
});

test('HTTP recoverable refresh stays unavailable when not enabled', async t => {
  const enabled = env.AUTH_REFRESH_RECOVERY_ENABLED;
  env.AUTH_REFRESH_RECOVERY_ENABLED = false;
  t.after(() => { env.AUTH_REFRESH_RECOVERY_ENABLED = enabled; });
  const app = await buildApp();
  try {
    const response = await app.inject({ method: 'POST', url: recoverable, payload });
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.json().error, 'REFRESH_RECOVERY_UNAVAILABLE');
  } finally { await app.close(); }
});

test('HTTP login passes only an explicit version-1 opt-in, not a default capability', async t => {
  const login = t.mock.method(authService, 'login', async (_input: Parameters<typeof authService.login>[0]) => ({
    accessToken: 'fake', refreshToken: 'fake', securityAlert: { newDevice: false },
    user: { id: 'fixture', username: 'fixture-user', email: 'fixture@example.invalid' }
  }));
  const app = await buildApp();
  const body = { identifier: 'fixture-user', password: 'fixture-only-password', device_id: payload.device_id,
    device_public_key: 'fixture-public-profile'.repeat(4) };
  try {
    const route = { method: 'POST' as const, url: '/api/auth/login' };
    assert.equal((await app.inject({ ...route, payload: body })).statusCode, 200);
    assert.equal((await app.inject({ ...route, payload: { ...body, refresh_recovery_version: 1 } })).statusCode, 200);
    assert.equal((await app.inject({ ...route, payload: { ...body, refresh_recovery_version: 2 } })).statusCode, 400);
    assert.deepEqual(login.mock.calls.map(call => call.arguments[0].refreshRecoveryVersion), [undefined, 1]);
  } finally { await app.close(); }
});
