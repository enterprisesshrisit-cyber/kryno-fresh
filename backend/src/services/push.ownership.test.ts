import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../db/pool.js';
import { pushService, buildFcmMessage } from './push.service.js';

const target = { session_id: 'fixture-session', push_provider: 'expo',
  push_token: 'ExpoPushToken[fixture-only-not-a-real-token]', push_platform: 'android', push_generation: 'fixture-generation' };

test('dispatch rechecks current generation and supplies the native account binding', async (t) => {
  const queries: string[] = [];
  let sent: Record<string, unknown> | null = null;
  t.mock.method(pool, 'query', async (sql: string) => {
    queries.push(sql);
    return { rows: [target] };
  });
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response('{}', { status: 200 });
  });
  const result = await pushService.sendDirectMessageNotification({ recipientUserId: 'fixture-recipient' });
  assert.equal(result.sent, 1);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /o.generation = d.push_owner_generation/);
  assert.match(queries[0], /r.token_family_id = o.token_family_id/);
  assert.match(queries[1], /o.generation = \$3/);
  assert.deepEqual((sent as unknown as { data: unknown }).data,
    { type: 'direct_message', recipientUserId: 'fixture-recipient', pushGeneration: 'fixture-generation' });
});

test('scoped Android push never uses an OS auto-display notification payload', () => {
  const scoped = { ...target, push_provider: 'fcm', push_scope_version: 1 };
  for (const type of ['direct_message', 'call_invite', 'call_ended', 'couple_screen_request']) {
    const result = buildFcmMessage(scoped, { title: 'fixture', body: 'fixture', channelId: 'kryno-messages',
      data: { type, recipientUserId: 'fixture-recipient' } });
    assert.equal('notification' in result, false);
    assert.equal('notification' in result.android, false);
    assert.equal(result.data.pushScopeVersion, '1');
    assert.equal(result.data.recipientUserId, 'fixture-recipient');
    assert.equal(result.data.pushGeneration, scoped.push_generation);
  }
});

test('unupgraded Android registrations retain their compatible message format', () => {
  const result = buildFcmMessage({ ...target, push_provider: 'fcm', push_scope_version: 0 },
    { title: 'fixture', body: 'fixture', channelId: 'kryno-messages', data: { type: 'direct_message' } });
  assert.equal('notification' in result, true);
  assert.equal(result.data.pushScopeVersion, '0');
});

test('logout or account switch after discovery suppresses the obsolete provider request', async (t) => {
  let queries = 0;
  let requests = 0;
  t.mock.method(pool, 'query', async () => ({ rows: ++queries === 1 ? [target] : [] }));
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Obsolete push must not reach a provider');
  });
  const result = await pushService.sendCallInviteNotification({ recipientUserId: 'fixture-recipient',
    callerUsername: 'fixture-caller', callId: 'fixture-call', mode: 'audio' });
  assert.equal(result.sent, 0);
  assert.equal(requests, 0);
});

test('an inactive installation has no dispatch targets', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No provider request allowed'); });
  assert.deepEqual(await pushService.sendDirectMessageNotification({ recipientUserId: 'fixture-recipient' }),
    { attempted: 0, sent: 0 });
});
