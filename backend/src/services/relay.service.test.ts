import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { RelayService } from './relay.service.js';

function socket() {
  return { readyState: 1, sent: [] as string[], send(data: string) { this.sent.push(data); }, close() {}, on() {} };
}
const auth = { userId: 'test-user', sessionId: 'test-session', deviceId: 'test-device' };

test('late close of a replaced socket cannot unregister its authenticated successor', () => {
  const relay = new RelayService();
  const original = socket();
  const successor = socket();
  relay.registerConnection(auth, original);
  relay.registerConnection(auth, successor);
  relay.unregisterConnection(auth.sessionId, original);
  assert.equal(relay.sendEventToSession(auth.sessionId, { type: 'probe' }), true);
  assert.equal(successor.sent.length, 1);
  assert.deepEqual(relay.listUserSessionIds(auth.userId), [auth.sessionId]);
});

test('matching close removes a connection once; duplicate error/close callbacks do not disconnect twice', () => {
  const relay = new RelayService();
  const current = socket();
  relay.registerConnection(auth, current);
  assert.equal(relay.unregisterConnection(auth.sessionId, current), true);
  assert.equal(relay.unregisterConnection(auth.sessionId, current), false);
  assert.equal(relay.sendEventToSession(auth.sessionId, { type: 'probe' }), false);
});

test('closed transport is not reported as a live delivery', () => {
  const relay = new RelayService();
  const current = socket();
  relay.registerConnection(auth, current);
  current.readyState = 3;
  assert.equal(relay.sendEventToSession(auth.sessionId, { type: 'probe' }), false);
  assert.equal(current.sent.length, 0);
  assert.deepEqual(relay.listUserSessionIds(auth.userId), []);
});

const payload = {
  messageId: 'test-message', senderUserId: 'test-sender', senderDeviceSessionId: 'test-sender-session',
  recipientDeviceSessionId: auth.sessionId, messageType: 'text', ciphertext: 'test-ciphertext',
  encryptedContentType: 'signal', clientCreatedAt: '2026-10-17T00:00:00Z',
  serverReceivedAt: '2026-10-17T00:00:01Z', expiresAt: null
};

for (const readyState of [2, 3]) {
  test(`transport state ${readyState} cannot exclude a direct-message target from push`, () => {
    const relay = new RelayService();
    const current = socket();
    relay.registerConnection(auth, current);
    current.readyState = readyState;
    const result = relay.deliverDirectMessage({ recipientUserId: auth.userId,
      recipientDeviceSessionId: auth.sessionId, payload });
    assert.deepEqual(result, { delivered: false, deliveredCount: 0, deliveredSessionIds: [] });
    assert.deepEqual(current.sent, []);
    assert.deepEqual(relay.listUserSessionIds(auth.userId), []);
  });
}

test('an open transport keeps the existing direct-message relay contract', () => {
  const relay = new RelayService();
  const current = socket();
  relay.registerConnection(auth, current);
  const result = relay.deliverDirectMessage({ recipientUserId: auth.userId,
    recipientDeviceSessionId: auth.sessionId, payload });
  assert.deepEqual(result, { delivered: true, deliveredCount: 1, deliveredSessionIds: [auth.sessionId] });
  assert.deepEqual(current.sent.map(value => JSON.parse(value)), [{ type: 'direct_message', message: payload }]);
});

test('a throwing transport stays eligible for push and is removed from the relay map', () => {
  const relay = new RelayService();
  const current = socket();
  current.send = () => { throw new Error('synthetic closed transport'); };
  relay.registerConnection(auth, current);
  const result = relay.deliverDirectMessage({ recipientUserId: auth.userId,
    recipientDeviceSessionId: auth.sessionId, payload });
  assert.deepEqual(result, { delivered: false, deliveredCount: 0, deliveredSessionIds: [] });
  assert.deepEqual(relay.listUserSessionIds(auth.userId), []);
});

test('both close and error handlers guard call teardown with matching-socket removal', () => {
  const source = readFileSync(new URL('../routes/relay.routes.ts', import.meta.url), 'utf8');
  assert.equal(source.match(/auth && relayService\.unregisterConnection\(auth.sessionId, socket\)/g)?.length, 2);
});

test('family revocation closes only the matching connection and tears down once', () => {
  const relay = new RelayService();
  const current = socket();
  let closes = 0, disconnects = 0;
  current.close = () => { closes++; };
  relay.registerConnection({ ...auth, tokenFamilyId: 'family-A' }, current, () => { disconnects++; });
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'family-B'), false);
  assert.equal(relay.isCurrentConnection(auth.sessionId, current), true);
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'family-A'), true);
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'family-A'), false);
  assert.deepEqual([closes, disconnects], [1, 1]);
  assert.equal(relay.sendEventToSession(auth.sessionId, {}), false);
});

test('late old-family logout cannot close the replacement connection', () => {
  const relay = new RelayService();
  const old = socket(), next = socket();
  let closed = false;
  next.close = () => { closed = true; };
  relay.registerConnection({ ...auth, tokenFamilyId: 'old' }, old);
  relay.registerConnection({ ...auth, tokenFamilyId: 'next' }, next);
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'old'), false);
  assert.equal(closed, false);
  assert.equal(relay.sendEventToSession(auth.sessionId, {}), true);
});

test('expired outbound authority is removed before sending and tears down once', () => {
  const relay = new RelayService();
  const current = socket();
  let disconnects = 0;
  relay.registerConnection({ ...auth, tokenFamilyId: 'family', accessExpiresAt: Date.now() - 1 }, current,
    () => { disconnects++; });
  assert.equal(relay.sendEventToSession(auth.sessionId, {}), false);
  assert.equal(current.sent.length, 0);
  assert.equal(disconnects, 1);
  assert.equal(relay.unregisterConnection(auth.sessionId, current), false);
});

test('revocation remains successful when call cleanup and transport close throw', () => {
  const relay = new RelayService(); const current = socket();
  current.close = () => { throw new Error('synthetic close failure'); };
  relay.registerConnection({ ...auth, tokenFamilyId: 'family' }, current,
    () => { throw new Error('synthetic cleanup failure'); });
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'family'), true);
  assert.equal(relay.sendEventToSession(auth.sessionId, {}), false);
  assert.equal(relay.revokeLoginFamily(auth.sessionId, 'family'), false);
});
