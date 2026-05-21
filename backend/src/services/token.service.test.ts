import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenService } from './token.service.js';

test('signAccessToken and verifyAccessToken round-trip session claims', async () => {
  const token = await tokenService.signAccessToken({
    userId: 'user-123',
    sessionId: 'session-abc',
    deviceId: 'device-xyz'
  });

  const payload = await tokenService.verifyAccessToken(token);

  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.sid, 'session-abc');
  assert.equal(payload.did, 'device-xyz');
  assert.equal(payload.type, 'access');
});

test('signRefreshToken and verifyRefreshToken round-trip family claims', async () => {
  const token = await tokenService.signRefreshToken(
    {
      userId: 'user-123',
      sessionId: 'session-abc',
      deviceId: 'device-xyz'
    },
    'token-id-1',
    'family-id-1'
  );

  const payload = await tokenService.verifyRefreshToken(token);

  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.sid, 'session-abc');
  assert.equal(payload.did, 'device-xyz');
  assert.equal(payload.jti, 'token-id-1');
  assert.equal(payload.family, 'family-id-1');
  assert.equal(payload.type, 'refresh');
});
