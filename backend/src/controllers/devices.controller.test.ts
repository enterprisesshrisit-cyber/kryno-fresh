import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { devicesService } from '../services/devices.service.js';
import { AppError } from '../utils/errors.js';
import { registerPushTokenController } from './devices.controller.js';

const auth = { userId: 'fixture-user', sessionId: 'fixture-session', deviceId: 'fixture-device', tokenFamilyId: 'fixture-family' };
const body = { deviceId: auth.deviceId, provider: 'expo', platform: 'android', pushToken: 'ExpoPushToken[fixture-not-real]' };
const request = (value: unknown) => ({ body: value, auth }) as FastifyRequest;
const reply = { code() { return this; }, send(value: unknown) { return value; } } as unknown as FastifyReply;

test('push controller takes account/session/family from verified auth, not request body', async (t) => {
  let supplied: unknown;
  t.mock.method(devicesService, 'registerPushToken', async (input: unknown) => { supplied = input; return { ok: true }; });
  await registerPushTokenController(request(body), reply);
  assert.deepEqual(supplied, { ...body, userId: auth.userId, sessionId: auth.sessionId, tokenFamilyId: auth.tokenFamilyId });
});

test('push controller rejects a different device before invoking registration', async (t) => {
  t.mock.method(devicesService, 'registerPushToken', async () => { throw new Error('Must not register'); });
  await assert.rejects(registerPushTokenController(request({ ...body, deviceId: 'another-device' }), reply),
    (error: unknown) => error instanceof AppError && error.code === 'DEVICE_MISMATCH');
});

test('push controller rejects client-supplied account, family or generation authority', async (t) => {
  t.mock.method(devicesService, 'registerPushToken', async () => { throw new Error('Must not register'); });
  for (const extra of [{ userId: 'other-account' }, { tokenFamilyId: 'other-family' }, { pushGeneration: 'invented-generation' }]) {
    await assert.rejects(registerPushTokenController(request({ ...body, ...extra }), reply),
      (error: unknown) => (error as Error).name === 'ZodError');
  }
});

test('only Android FCM can opt into scoped data-only push', async (t) => {
  let input: unknown;
  t.mock.method(devicesService, 'registerPushToken', async (value: unknown) => { input = value; return { ok: true }; });
  await registerPushTokenController(request({ ...body, provider: 'fcm', pushScopeVersion: 1, installationCredential: 'ab'.repeat(32) }), reply);
  assert.equal((input as { pushScopeVersion: number }).pushScopeVersion, 1);
  for (const extra of [{ provider: 'expo', pushScopeVersion: 1 }, { provider: 'fcm', platform: 'ios', pushScopeVersion: 1 }, { pushScopeVersion: 2 }]) {
    await assert.rejects(registerPushTokenController(request({ ...body, ...extra }), reply),
      (error: unknown) => (error as Error).name === 'ZodError');
  }
});
