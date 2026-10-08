import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { devicesService } from '../services/devices.service.js';
import { tokenService } from '../services/token.service.js';
import { AppError } from '../utils/errors.js';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';

test('legacy handler registration after awaited child plugins reproduces the live Zod HTTP 500', async () => {
  const app = Fastify();
  await app.register(async child => { child.post('/fixture', async request => z.object({ known: z.string() }).strict().parse(request.body)); });
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: 'fixture' }));
  try { assert.equal((await app.inject({ method: 'POST', url: '/fixture', payload: { known: 'fixture', pushScopeVersion: 1 } })).statusCode, 500); }
  finally { await app.close(); }
});

test('real app HTTP push route: auth, scoped contract and safe inherited errors', async (t) => {
  const redis = env.REDIS_URL;
  env.REDIS_URL = undefined;
  t.mock.method(tokenService, 'verifyAccessToken', async () => ({ sub: 'fixture-user', sid: 'fixture-session',
    did: 'fixture-device', family: 'fixture-family' }));
  t.mock.method(pool, 'query', async () => ({ rows: [{ user_id: 'fixture-user', device_id: 'fixture-device', trusted: true }] }));
  let failure: Error | undefined;
  let accepted: unknown;
  t.mock.method(devicesService, 'registerPushToken', async (input: unknown) => {
    if (failure) throw failure;
    accepted = input;
    return { ok: true, provider: 'fcm', platform: 'android', tokenUpdatedAt: 'fixture-time', pushGeneration: 'fixture-generation', pushScopeVersion: 1 };
  });
  const app = await buildApp();
  const payload = { provider: 'fcm', platform: 'android', deviceId: 'fixture-device',
    pushToken: 'fixture-not-a-real-fcm-token', pushScopeVersion: 1, installationCredential: 'ab'.repeat(32) };
  const inject = (body: unknown, authenticated = true) => app.inject({ method: 'POST', url: '/api/devices/push-token',
    headers: authenticated ? { authorization: 'Bearer fixture-not-real' } : {}, payload: body as object });
  try {
    await t.test('matching contract reaches service and responds 200 with correlation header', async () => {
      const response = await inject(payload);
      assert.equal(response.statusCode, 200);
      assert.ok(response.headers['x-request-id']);
      assert.equal(response.json().pushScopeVersion, 1);
      assert.equal((accepted as { installationCredential: string }).installationCredential, payload.installationCredential);
      assert.equal(response.body.includes(payload.installationCredential), false);
    });
    await t.test('unknown client fields yield clean 400, never leaked Zod stack or 500', async () => {
      const response = await inject({ ...payload, userId: 'attacker-authority' });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error: 'VALIDATION_ERROR', message: 'Invalid request body.' });
      assert.equal(response.body.includes('stack'), false);
    });
    await t.test('missing authentication is 401 and device mismatch is 403', async () => {
      assert.equal((await inject(payload, false)).statusCode, 401);
      assert.equal((await inject({ ...payload, deviceId: 'another-device' })).statusCode, 403);
    });
    await t.test('proof rejection preserves status and safe code', async () => {
      failure = new AppError(403, 'This installation could not be verified.', 'INSTALLATION_PROOF_MISMATCH');
      const response = await inject(payload);
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error, 'INSTALLATION_PROOF_MISMATCH');
    });
    await t.test('unexpected provider/database failure returns generic 500, not secret-bearing exception', async () => {
      failure = new Error('fixture secret must not escape');
      const response = await inject(payload);
      assert.equal(response.statusCode, 500);
      assert.equal(response.body.includes('fixture secret'), false);
    });
  } finally { await app.close(); env.REDIS_URL = redis; }
});
