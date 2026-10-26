import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { devicesService } from './devices.service.js';
import { registerPushTokenController } from '../controllers/devices.controller.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const input = {
  userId: 'fixture-user', sessionId: 'fixture-session', deviceId: 'fixture-installation',
  tokenFamilyId: 'fixture-family', provider: 'expo' as const, platform: 'android' as const,
  pushToken: 'ExpoPushToken[fixture-only-not-a-real-token]'
};

function databaseFixture(t: TestContext, options: { owner?: boolean; collision?: boolean; failUpdate?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  t.mock.method(pool, 'connect', async () => ({
    release() {},
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('select o.generation')) return { rows: options.owner === false ? [] : [{ generation: 'fixture-generation' }] };
      if (sql.includes('select id from device_sessions')) return { rows: options.collision ? [{ id: 'other-session' }] : [] };
      if (sql.includes('update device_sessions')) {
        if (options.failUpdate) throw new Error('fixture update failure');
        return { rows: [{ push_provider: input.provider, push_platform: input.platform,
          push_token_updated_at: 'fixture-time', push_owner_generation: 'fixture-generation', push_scope_version: params[7],
          message_notification_version: params[8] }] };
      }
      return { rows: [] };
    }
  }));
  return calls;
}

test('push registration uses the authenticated family and server generation', async (t) => {
  const calls = databaseFixture(t);
  const result = await devicesService.registerPushToken(input);
  assert.equal(result.ok, true);
  assert.equal(result.pushGeneration, 'fixture-generation');
  const owner = calls.find((call) => call.sql.includes('select o.generation'))!;
  assert.deepEqual(owner.params, [input.deviceId, input.sessionId, input.tokenFamilyId, input.userId]);
  assert.match(owner.sql, /revoked_at is null and r.expires_at > now\(\)/);
  assert.equal(calls.find((call) => call.sql.includes('update device_sessions'))!.params[6], 'fixture-generation');
  assert.equal(calls.at(-1)!.sql, 'commit');
});

test('native scoped capability is persisted and echoed, legacy registration stays version zero', async (t) => {
  const calls = databaseFixture(t);
  assert.equal((await devicesService.registerPushToken(input)).pushScopeVersion, 0);
  assert.equal((await devicesService.registerPushToken({ ...input, provider: 'fcm', pushScopeVersion: 1,
    installationCredential: 'ab'.repeat(32) })).pushScopeVersion, 1);
  assert.match(calls.find((call) => call.sql.includes('update device_sessions'))!.sql, /push_scope_version = \$8/);
});

test('legacy access token must refresh instead of adopting the current family', async (t) => {
  const calls = databaseFixture(t);
  await assert.rejects(devicesService.registerPushToken({ ...input, tokenFamilyId: undefined }),
    (error: unknown) => error instanceof AppError && error.code === 'ACCESS_TOKEN_EXPIRED');
  assert.equal(calls.length, 0);
});

test('late old-account registration is rejected without modifying another binding', async (t) => {
  const calls = databaseFixture(t, { owner: false });
  await assert.rejects(devicesService.registerPushToken(input),
    (error: unknown) => error instanceof AppError && error.code === 'PUSH_OWNER_CHANGED');
  assert.equal(calls.some((call) => call.sql.includes('update device_sessions')), false);
  assert.equal(calls.at(-1)!.sql, 'rollback');
});

test('a token already owned by another installation cannot be stolen', async (t) => {
  const calls = databaseFixture(t, { collision: true });
  await assert.rejects(devicesService.registerPushToken(input),
    (error: unknown) => error instanceof AppError && error.code === 'PUSH_TOKEN_ALREADY_BOUND');
  assert.equal(calls.some((call) => call.sql.includes('update device_sessions')), false);
  assert.equal(calls.at(-1)!.sql, 'rollback');
});

test('failed push write rolls back and returns no success', async (t) => {
  const calls = databaseFixture(t, { failUpdate: true });
  await assert.rejects(devicesService.registerPushToken(input), /fixture update failure/);
  assert.equal(calls.at(-1)!.sql, 'rollback');
});

test('message capability persists and omission resets the current registration', async t => {
  const calls = databaseFixture(t);
  const capable = { ...input, provider: 'fcm' as const, pushScopeVersion: 1 as const,
    messageNotificationVersion: 1 as const, installationCredential: 'ab'.repeat(32) };
  assert.equal((await devicesService.registerPushToken(capable)).messageNotificationVersion, 1);
  assert.equal((await devicesService.registerPushToken({ ...capable, messageNotificationVersion: undefined })).messageNotificationVersion, 0);
  const writes = calls.filter(call => call.sql.includes('update device_sessions'));
  assert.equal(writes[0].params[8], 1);
  assert.equal(writes[1].params[8], 0);
  assert.equal(writes[0].params[6], writes[1].params[6]);
});

test('unsupported message capabilities cannot change an existing registration', async t => {
  const calls = databaseFixture(t);
  const valid = { ...input, provider: 'fcm' as const, pushScopeVersion: 1 as const,
    messageNotificationVersion: 1 as const, installationCredential: 'ab'.repeat(32) };
  for (const change of [{ provider: 'expo' }, { platform: 'ios' }, { pushScopeVersion: undefined },
    { installationCredential: undefined }, { messageNotificationVersion: 2 }, { messageNotificationVersion: 0 }]) {
    await assert.rejects(devicesService.registerPushToken({ ...valid, ...change } as typeof valid),
      (error: unknown) => error instanceof AppError && error.code === 'MESSAGE_NOTIFICATION_UNSUPPORTED');
  }
  assert.equal(calls.length, 0);
});

test('HTTP controller validates the independent capability and authenticated authority', async t => {
  const accepted: unknown[] = [];
  t.mock.method(devicesService, 'registerPushToken', async (value: unknown) => { accepted.push(value); return { ok: true }; });
  const auth = { userId: 'fixture-user', sessionId: 'fixture-session', deviceId: input.deviceId, tokenFamilyId: 'fixture-family' };
  const body = { deviceId: input.deviceId, provider: 'fcm', platform: 'android', pushToken: input.pushToken,
    pushScopeVersion: 1, messageNotificationVersion: 1, installationCredential: 'ab'.repeat(32) };
  const reply = { code() { return this; }, send(value: unknown) { return value; } } as unknown as FastifyReply;
  const request = (value: unknown) => ({ body: value, auth }) as FastifyRequest;
  await registerPushTokenController(request(body), reply);
  assert.deepEqual(accepted[0], { ...body, userId: auth.userId, sessionId: auth.sessionId, tokenFamilyId: auth.tokenFamilyId });
  for (const change of [{ provider: 'expo' }, { platform: 'ios' }, { pushScopeVersion: undefined },
    { installationCredential: undefined }, { messageNotificationVersion: 2 }, { messageNotificationVersion: 0 },
    { userId: 'other' }, { pushGeneration: 'invented' }]) {
    await assert.rejects(registerPushTokenController(request({ ...body, ...change }), reply),
      (error: unknown) => (error as Error).name === 'ZodError');
  }
  assert.equal(accepted.length, 1);
});
