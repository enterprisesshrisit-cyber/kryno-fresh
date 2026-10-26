import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { pool } from '../db/pool.js';
import { pushService, buildFcmMessage } from './push.service.js';
import { env } from '../config/env.js';
import { generateKeyPairSync } from 'node:crypto';

const target = { session_id: 'fixture-session', push_provider: 'expo',
  push_token: 'ExpoPushToken[fixture-only-not-a-real-token]', push_platform: 'android', push_generation: 'fixture-generation',
  push_scope_version: 0, message_notification_version: 0 };
const messageId = '11111111-2222-4333-8444-555555555555';
const directInput = { messageId, recipientUserId: 'fixture-recipient', senderUserId: 'fixture-sender',
  intendedSessionIds: [target.session_id] };

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
  const result = await pushService.sendDirectMessageNotification(directInput);
  assert.equal(result.sent, 1);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /o.generation = d.push_owner_generation/);
  assert.match(queries[0], /r.token_family_id = o.token_family_id/);
  assert.match(queries[1], /active.push_generation = \$6/);
  assert.deepEqual((sent as unknown as { data: unknown }).data,
    { type: 'direct_message', messageId, recipientUserId: 'fixture-recipient', pushGeneration: 'fixture-generation' });
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
    { title: 'fixture', body: 'fixture', channelId: 'kryno-messages', data: { type: 'direct_message', messageId } });
  assert.equal('notification' in result, true);
  assert.equal(result.data.pushScopeVersion, '0');
  assert.equal(result.data.messageId, messageId);
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
  assert.deepEqual(await pushService.sendDirectMessageNotification(directInput),
    { attempted: 0, sent: 0, intendedTargetCount: 1, eligibleTargetCount: 0,
      matchedRelayExclusionCount: 0, revalidatedOutCount: 0 });
});

const fixtureKey = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;

function fcmFixture(t: TestContext) {
  const old = { project: env.FIREBASE_PROJECT_ID, email: env.FIREBASE_CLIENT_EMAIL, key: env.FIREBASE_PRIVATE_KEY,
    enabled: env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED };
  env.FIREBASE_PROJECT_ID = 'fixture-no-real-project';
  env.FIREBASE_CLIENT_EMAIL = 'fixture@example.invalid';
  env.FIREBASE_PRIVATE_KEY = fixtureKey;
  t.after(() => { env.FIREBASE_PROJECT_ID = old.project; env.FIREBASE_CLIENT_EMAIL = old.email;
    env.FIREBASE_PRIVATE_KEY = old.key; env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = old.enabled; });
  const requests: Record<string, any>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'fixture-oauth-not-real', expires_in: 3600 }));
    assert.ok(url.includes('fixture-no-real-project') || url === 'https://exp.host/--/api/v2/push/send');
    requests.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  });
  return requests;
}

test('empty or missing intended targets fail closed without querying or submitting', async t => {
  t.mock.method(pool, 'query', async () => { throw new Error('Empty targets cannot query user-wide routing'); });
  for (const intendedSessionIds of [[], undefined]) {
    const result = await pushService.sendDirectMessageNotification({ ...directInput, intendedSessionIds } as typeof directInput);
    assert.equal(result.attempted, 0);
    assert.equal(result.intendedTargetCount, 0);
  }
});

test('default relay-wake policy is OFF', () => {
  assert.equal(env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED, false);
});

test('relay/capability/scope/provider/gate cross-product preserves legacy exclusion', async t => {
  const requests = fcmFixture(t);
  for (const enabled of [false, true]) for (const cap of [0, 1]) for (const scope of [0, 1])
    for (const provider of ['fcm', 'expo']) for (const relay of [false, true]) {
      await t.test(JSON.stringify({ enabled, cap, scope, provider, relay }), async child => {
        env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = enabled;
        const row = { ...target, push_provider: provider, push_scope_version: scope,
          message_notification_version: cap, push_token: provider === 'expo' ? target.push_token : 'fixture-fcm-token-with-no-real-device' };
        child.mock.method(pool, 'query', async () => ({ rows: [row] }));
        const before = requests.length;
        const result = await pushService.sendDirectMessageNotification({ ...directInput,
          senderUsername: 'SENSITIVE-SENDER', excludeSessionIds: relay ? [target.session_id] : [] });
        const compatible = cap === 1 && scope === 1 && provider === 'fcm';
        const expected = (cap === 0 || compatible) && (!relay || (enabled && compatible));
        assert.equal(result.attempted, Number(expected));
        assert.equal(requests.length - before, Number(expected));
        if (expected && compatible) {
          const wire = JSON.stringify(requests.at(-1));
          assert.equal(wire.includes('SENSITIVE-SENDER'), false);
          assert.equal('notification' in requests.at(-1)!.message, false);
          assert.equal('notification' in requests.at(-1)!.message.android, false);
        }
      });
    }
});

test('discovery and submission require original message, target intersection and current policy', async t => {
  fcmFixture(t);
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const row = { ...target, push_provider: 'fcm', push_scope_version: 1, message_notification_version: 1,
    push_token: 'fixture-fcm-token-with-no-real-device' };
  t.mock.method(pool, 'query', async (sql: string, params: unknown[]) => { queries.push({ sql, params }); return { rows: [row] }; });
  env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = true;
  await pushService.sendDirectMessageNotification({ ...directInput, excludeSessionIds: [target.session_id] });
  for (const query of queries) {
    assert.match(query.sql, /active.session_id = any\(\$2::uuid\[\]\)/);
    assert.match(query.sql, /active.session_id = any\(dm.notification_target_session_ids\)/);
    assert.match(query.sql, /dm.sender_user_id = \$4/);
    assert.match(query.sql, /dm.notification_is_control = false/);
    assert.match(query.sql, /not coalesce\(prefs.muted, false\)/);
    assert.match(query.sql, /blocked_users/);
    assert.equal(query.sql.includes('limit 10'), false);
  }
  assert.match(queries[1].sql, /active.push_scope_version = \$9/);
  assert.match(queries[1].sql, /active.message_notification_version = \$10/);
  assert.deepEqual(queries[0].params, [directInput.recipientUserId, [target.session_id], messageId, directInput.senderUserId]);
});

test('same-generation downgrade, token rotation, owner change and policy flip suppress stale submissions', async t => {
  const requests = fcmFixture(t);
  const row = { ...target, push_provider: 'fcm', push_scope_version: 1, message_notification_version: 1,
    push_token: 'fixture-fcm-token-with-no-real-device' };
  for (const kind of ['capability', 'scope', 'token', 'owner', 'gate', 'mute', 'block', 'expiry']) {
    let query = 0;
    env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = true;
    t.mock.method(pool, 'query', async () => {
      if (++query === 1) return { rows: [row] };
      if (kind === 'gate') { env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = false; return { rows: [row] }; }
      return { rows: [] };
    });
    const result = await pushService.sendDirectMessageNotification({ ...directInput, excludeSessionIds: [row.session_id] });
    assert.equal(result.attempted, 0, kind);
    assert.equal(result.revalidatedOutCount, 1, kind);
  }
  assert.equal(requests.length, 0);
});

test('private preference enabled after discovery removes legacy sender metadata before submission', async t => {
  const requests = fcmFixture(t);
  let query = 0;
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...target, message_private: ++query > 1 }] }));
  await pushService.sendDirectMessageNotification({ ...directInput, senderUsername: 'SENSITIVE-SENDER' });
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(requests).includes('SENSITIVE-SENDER'), false);
});
