import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { tokenService } from '../services/token.service.js';
import { callsService } from '../services/calls.service.js';
import { relayService } from '../services/relay.service.js';
import { relayRoutes } from './relay.routes.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t: TestContext) {
  const claims = { type: 'access' as const, sub: 'A', sid: 'session', did: 'installation', family: 'family',
    exp: Math.floor(Date.now() / 1000) + 600 };
  const session = { user_id: 'A', device_id: 'installation', trusted: true, active_family: true };
  const timers: Array<() => void> = [];
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => {
    timers.push(callback); return { unref() {} } as unknown as ReturnType<typeof setTimeout>;
  });
  t.mock.method(globalThis, 'clearTimeout', () => undefined);
  t.mock.method(tokenService, 'verifyAccessToken', async () => claims);
  t.mock.method(pool, 'query', async () => ({ rows: [session] }));
  t.mock.method(callsService, 'handleSessionReconnect', async () => undefined);
  const disconnect = t.mock.method(callsService, 'handleSessionDisconnect', () => undefined);
  const command = t.mock.method(callsService, 'handleCommand', async () => undefined);
  let handler!: (socket: unknown, request: unknown) => Promise<void>;
  await relayRoutes({ get(_path: string, _options: unknown, callback: typeof handler) { handler = callback; } } as unknown as FastifyInstance);
  const listeners = new Map<string, (...args: any[]) => unknown>();
  let closes = 0;
  const socket = { readyState: 1, sent: [] as string[],
    send(value: string) { this.sent.push(value); },
    close() { closes++; this.readyState = 3; listeners.get('close')?.(); },
    on(event: string, callback: (...args: any[]) => unknown) { listeners.set(event, callback); } };
  await handler(socket, {});
  t.after(() => { relayService.unregisterConnection(claims.sid); });
  return { claims, session, timers, socket, disconnect, command, listeners, get closes() { return closes; },
    message: (payload: unknown) => listeners.get('message')!(JSON.stringify(payload)) as Promise<void>,
    auth: () => listeners.get('message')!(JSON.stringify({ type: 'auth', accessToken: 'synthetic-access-token-123' })) as Promise<void> };
}

test('handshake timeout fences a late successful authentication even when send and close fail', async t => {
  const f = await fixture(t); const query = deferred<{ rows: typeof f.session[] }>();
  t.mock.method(pool, 'query', () => query.promise);
  const pending = f.auth();
  await Promise.resolve();
  f.socket.send = () => { throw new Error('synthetic send failure'); };
  f.socket.close = () => { throw new Error('synthetic close failure'); };
  assert.doesNotThrow(f.timers[0]);
  query.resolve({ rows: [f.session] }); await pending;
  assert.equal(relayService.isCurrentConnection(f.claims.sid, f.socket), false);
});

test('expiry timer removes authority and tears down once even when its error frame cannot be sent', async t => {
  const f = await fixture(t); await f.auth();
  assert.equal(relayService.isCurrentConnection(f.claims.sid, f.socket), true);
  f.socket.send = () => { throw new Error('synthetic send failure'); };
  assert.doesNotThrow(f.timers[1]);
  assert.equal(relayService.isCurrentConnection(f.claims.sid, f.socket), false);
  assert.equal(f.disconnect.mock.callCount(), 1);
  assert.equal(f.closes, 1);
  f.listeners.get('error')!();
  assert.equal(f.disconnect.mock.callCount(), 1);
});

test('old authority query completion cannot execute commands on a replaced relay', async t => {
  const f = await fixture(t); await f.auth(); const query = deferred<{ rows: Array<{ id: string }> }>();
  t.mock.method(pool, 'query', () => query.promise);
  const pending = f.message({ type: 'call_end', callId: 'old-call' });
  const replacement = { ...f.socket, sent: [] as string[] };
  relayService.registerConnection({ userId: 'A', sessionId: f.claims.sid, deviceId: f.claims.did,
    tokenFamilyId: 'new-family' }, replacement);
  query.resolve({ rows: [{ id: f.claims.sid }] }); await pending;
  assert.equal(f.command.mock.callCount(), 0);
  assert.equal(relayService.isCurrentConnection(f.claims.sid, replacement), true);
  f.timers[1](); // The old expiry callback cannot revoke this replacement.
  assert.equal(relayService.isCurrentConnection(f.claims.sid, replacement), true);
});

test('closed socket cannot send relay_ready after delayed reconnect preparation', async t => {
  const f = await fixture(t); const gate = deferred<void>(); const entered = deferred<void>();
  t.mock.method(callsService, 'handleSessionReconnect', async () => { entered.resolve(); await gate.promise; });
  const pending = f.auth(); await entered.promise;
  f.socket.close(); gate.resolve(); await pending;
  assert.equal(f.socket.sent.some(value => JSON.parse(value).type === 'relay_ready'), false);
  assert.equal(f.disconnect.mock.callCount(), 1);
});
