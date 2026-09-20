import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { connectAuthenticatedRelay, type RelaySocket } from './relayConnection';

class Socket implements RelaySocket {
  readyState = 0;
  sent: string[] = [];
  onopen: RelaySocket['onopen'] = null;
  onmessage: RelaySocket['onmessage'] = null;
  onclose: RelaySocket['onclose'] = null;
  onerror: RelaySocket['onerror'] = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
function setup() {
  const sockets: Socket[] = [];
  let session: { accessToken: string } | null = { accessToken: 'test-access' };
  const relay = connectAuthenticatedRelay({
    url: 'wss://example.invalid/api/messages/ws',
    getSession: () => session,
    async onPayload() {},
    createSocket: () => { const socket = new Socket(); sockets.push(socket); return socket; },
    reconnectMs: 1,
    authTimeoutMs: 500
  });
  return { relay, sockets, setSession(value: typeof session) { session = value; } };
}

test('call commands wait for relay_ready, not just an open socket', async () => {
  const f = setup();
  try {
    const s = f.sockets[0];
    s.open();
    assert.equal(f.relay.send({ type: 'call_invite' }), false);
    const ready = f.relay.waitUntilConnected();
    s.receive({ type: 'relay_ready' });
    assert.equal(await ready, true);
    assert.equal(f.relay.send({ type: 'call_invite' }), true);
  } finally { f.relay.disconnect(); }
});

test('reconnect uses the latest access token', async () => {
  const f = setup();
  try {
    f.sockets[0].close();
    f.setSession({ accessToken: 'rotated-token' });
    await delay(15);
    const next = f.sockets[1];
    assert.ok(next);
    next.open();
    assert.equal(JSON.parse(next.sent[0]).accessToken, 'rotated-token');
  } finally { f.relay.disconnect(); }
});

test('logged-out sessions do not reconnect using the original token', async () => {
  const f = setup();
  f.setSession(null);
  f.sockets[0].close();
  await delay(15);
  assert.equal(f.sockets.length, 1);
  assert.equal(await f.relay.waitUntilConnected(), false);
  f.relay.disconnect();
});

test('disconnect settles pending call connection waits immediately', async () => {
  const f = setup();
  const ready = f.relay.waitUntilConnected(10000);
  f.relay.disconnect();
  assert.equal(await ready, false);
});

test('socket constructor failures retry rather than aborting relay initialization', async () => {
  let attempts = 0;
  const relay = connectAuthenticatedRelay({
    url: 'wss://example.invalid',
    getSession: () => ({ accessToken: 'test' }),
    async onPayload() {},
    reconnectMs: 1,
    createSocket: () => { attempts++; if (attempts === 1) throw new Error('network'); return new Socket(); }
  });
  try { await delay(15); assert.equal(attempts, 2); }
  finally { relay.disconnect(); }
});

test('a timed-out handshake reconnects without leaving the call waiter stuck', async () => {
  let attempts = 0;
  const relay = connectAuthenticatedRelay({
    url: 'wss://example.invalid',
    getSession: () => ({ accessToken: 'test' }),
    async onPayload() {},
    reconnectMs: 1,
    authTimeoutMs: 5,
    createSocket: () => { attempts++; return new Socket(); }
  });
  try { assert.equal(await relay.waitUntilConnected(30), false); assert.ok(attempts > 1); }
  finally { relay.disconnect(); }
});
