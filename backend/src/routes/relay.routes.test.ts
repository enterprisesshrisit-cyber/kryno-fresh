import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelayAuthMessage } from './relay.routes.js';

test('isRelayAuthMessage accepts a valid relay auth payload', () => {
  assert.equal(
    isRelayAuthMessage({
      type: 'auth',
      accessToken: 'x'.repeat(32)
    }),
    true
  );
});

test('isRelayAuthMessage rejects non-auth relay payloads', () => {
  assert.equal(
    isRelayAuthMessage({
      type: 'call_invite',
      accessToken: 'x'.repeat(32)
    }),
    false
  );
});

test('isRelayAuthMessage rejects short or missing tokens', () => {
  assert.equal(
    isRelayAuthMessage({
      type: 'auth',
      accessToken: 'short'
    }),
    false
  );
  assert.equal(
    isRelayAuthMessage({
      type: 'auth'
    }),
    false
  );
});
