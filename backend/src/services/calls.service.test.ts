import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { decodeJwt } from 'jose';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { callsService } from './calls.service.js';
import { relayService } from './relay.service.js';

const callId = '11111111-1111-4111-8111-111111111111';
const caller = { userId: 'caller-id', sessionId: 'caller-device' };
const recipient = { userId: 'recipient-id', sessionId: 'recipient-device' };

function liveKitFixture(t: TestContext, overrides: Record<string, unknown> = {}) {
  const original = {
    url: env.LIVEKIT_URL,
    key: env.LIVEKIT_API_KEY,
    secret: env.LIVEKIT_API_SECRET
  };
  env.LIVEKIT_URL = 'wss://livekit.example.invalid';
  env.LIVEKIT_API_KEY = 'test-key';
  env.LIVEKIT_API_SECRET = 'test-secret-with-enough-length-for-jwt-signing';
  t.after(() => {
    env.LIVEKIT_URL = original.url;
    env.LIVEKIT_API_KEY = original.key;
    env.LIVEKIT_API_SECRET = original.secret;
  });

  const call = {
    call_id: callId,
    mode: 'video',
    caller_user_id: caller.userId,
    caller_device_session_id: caller.sessionId,
    recipient_user_id: recipient.userId,
    accepted_device_session_id: recipient.sessionId,
    room_name: `kryno-video-${callId}`,
    state: 'connecting',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides
  };
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('from call_sessions')) return { rows: [call] };
    if (sql.includes('from users')) return { rows: [{ username: 'test-user' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

test('LiveKit token is scoped to the server-side call room', async (t) => {
  liveKitFixture(t);
  const result = await callsService.createLiveKitToken(caller, { callId });
  const claims = decodeJwt(result.token);
  const grants = claims.video as { room: string; roomJoin: boolean };
  assert.equal(result.roomName, `kryno-video-${callId}`);
  assert.equal(grants.room, result.roomName);
  assert.equal(grants.roomJoin, true);
  assert.equal(claims.sub, `${caller.userId}:${caller.sessionId}`);
  assert.equal(result.e2eeRequired, false);
});

test('LiveKit token rejects a third-party user', async (t) => {
  liveKitFixture(t);
  await assert.rejects(
    callsService.createLiveKitToken({ userId: 'outsider', sessionId: 'outsider-device' }, { callId }),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  );
});

test('LiveKit token rejects another device of the caller', async (t) => {
  liveKitFixture(t);
  await assert.rejects(
    callsService.createLiveKitToken({ ...caller, sessionId: 'other-device' }, { callId }),
    (error: unknown) => error instanceof AppError && error.code === 'CALL_DEVICE_MISMATCH'
  );
});

test('LiveKit token rejects recipient until this device has accepted', async (t) => {
  liveKitFixture(t, { accepted_device_session_id: null, state: 'ringing' });
  await assert.rejects(
    callsService.createLiveKitToken(recipient, { callId }),
    (error: unknown) => error instanceof AppError && error.code === 'CALL_NOT_ACCEPTED'
  );
});

test('LiveKit token keeps the caller out until the recipient accepts', async (t) => {
  liveKitFixture(t, { accepted_device_session_id: null, state: 'ringing' });
  await assert.rejects(
    callsService.createLiveKitToken(caller, { callId }),
    (error: unknown) => error instanceof AppError && error.code === 'CALL_NOT_ACCEPTED'
  );
});

test('LiveKit token rejects a call that has already ended', async (t) => {
  liveKitFixture(t, { state: 'ended' });
  await assert.rejects(
    callsService.createLiveKitToken(caller, { callId }),
    (error: unknown) => error instanceof AppError && error.code === 'CALL_ENDED'
  );
});

test('call invitation fails immediately when LiveKit is not configured', async (t) => {
  const original = {
    url: env.LIVEKIT_URL,
    key: env.LIVEKIT_API_KEY,
    secret: env.LIVEKIT_API_SECRET
  };
  env.LIVEKIT_URL = undefined;
  env.LIVEKIT_API_KEY = undefined;
  env.LIVEKIT_API_SECRET = undefined;
  t.after(() => {
    env.LIVEKIT_URL = original.url;
    env.LIVEKIT_API_KEY = original.key;
    env.LIVEKIT_API_SECRET = original.secret;
  });
  const events: unknown[] = [];
  t.mock.method(relayService, 'sendEventToSession', (_sessionId: string, event: unknown) => {
    events.push(event);
    return true;
  });
  await callsService.handleCommand(caller, {
    type: 'call_invite',
    callId,
    mode: 'audio',
    recipientLookup: recipient.userId,
    mediaProvider: 'livekit'
  });
  assert.deepEqual(events, [{
    type: 'call_unavailable',
    callId,
    reason: 'Calling is temporarily unavailable.'
  }]);
});

test('LiveKit acceptance atomically binds the recipient device and returns its room token', async (t) => {
  const original = {
    url: env.LIVEKIT_URL,
    key: env.LIVEKIT_API_KEY,
    secret: env.LIVEKIT_API_SECRET
  };
  env.LIVEKIT_URL = 'wss://livekit.example.invalid';
  env.LIVEKIT_API_KEY = 'test-key';
  env.LIVEKIT_API_SECRET = 'test-secret-with-enough-length-for-jwt-signing';
  t.after(() => {
    env.LIVEKIT_URL = original.url;
    env.LIVEKIT_API_KEY = original.key;
    env.LIVEKIT_API_SECRET = original.secret;
  });

  const acceptedCall = {
    call_id: callId,
    mode: 'audio' as const,
    caller_user_id: caller.userId,
    caller_device_session_id: caller.sessionId,
    recipient_user_id: recipient.userId,
    accepted_device_session_id: recipient.sessionId,
    media_provider: 'livekit' as const,
    room_name: `kryno-audio-${callId}`,
    state: 'connecting',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  };
  const events: Array<{ sessionId: string; event: Record<string, unknown> }> = [];
  t.mock.method(relayService, 'listUserSessionIds', () => [recipient.sessionId]);
  t.mock.method(relayService, 'sendEventToSession', (sessionId: string, event: Record<string, unknown>) => {
    events.push({ sessionId, event });
    return true;
  });
  t.mock.method(pool, 'query', async (sql: string, params?: unknown[]) => {
    if (sql.includes('update call_sessions')) {
      assert.deepEqual(params, [callId, recipient.userId, recipient.sessionId]);
      return { rows: [acceptedCall], rowCount: 1 };
    }
    if (sql.includes('from call_sessions')) return { rows: [acceptedCall], rowCount: 1 };
    if (sql.includes('from users')) return { rows: [{ username: 'recipient-user' }], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await callsService.acceptLiveKitCall(recipient, { callId });
  const claims = decodeJwt(result.token);
  assert.equal(result.roomName, acceptedCall.room_name);
  assert.equal(claims.sub, `${recipient.userId}:${recipient.sessionId}`);
  assert.equal(events.some(({ sessionId, event }) =>
    sessionId === caller.sessionId && event.type === 'call_accepted'), true);
  assert.equal(events.some(({ sessionId, event }) =>
    sessionId === recipient.sessionId && event.type === 'call_join'), true);
});

test('LiveKit acceptance is idempotent for the same recipient device', async (t) => {
  const original = {
    url: env.LIVEKIT_URL,
    key: env.LIVEKIT_API_KEY,
    secret: env.LIVEKIT_API_SECRET
  };
  env.LIVEKIT_URL = 'wss://livekit.example.invalid';
  env.LIVEKIT_API_KEY = 'test-key';
  env.LIVEKIT_API_SECRET = 'test-secret-with-enough-length-for-jwt-signing';
  t.after(() => {
    env.LIVEKIT_URL = original.url;
    env.LIVEKIT_API_KEY = original.key;
    env.LIVEKIT_API_SECRET = original.secret;
  });

  const acceptedCall = {
    call_id: callId,
    mode: 'video' as const,
    caller_user_id: caller.userId,
    caller_device_session_id: caller.sessionId,
    recipient_user_id: recipient.userId,
    accepted_device_session_id: recipient.sessionId,
    media_provider: 'livekit' as const,
    room_name: `kryno-video-${callId}`,
    state: 'connecting',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  };
  const events: unknown[] = [];
  t.mock.method(relayService, 'sendEventToSession', (_sessionId: string, event: unknown) => {
    events.push(event);
    return true;
  });
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('update call_sessions')) return { rows: [], rowCount: 0 };
    if (sql.includes('from call_sessions')) return { rows: [acceptedCall], rowCount: 1 };
    if (sql.includes('from users')) return { rows: [{ username: 'recipient-user' }], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await callsService.acceptLiveKitCall(recipient, { callId });
  assert.equal(result.roomName, acceptedCall.room_name);
  assert.deepEqual(events, []);
});

test('LiveKit acceptance rejects a user who is not the recipient', async (t) => {
  const existingCall = {
    call_id: callId,
    mode: 'audio' as const,
    caller_user_id: caller.userId,
    caller_device_session_id: caller.sessionId,
    recipient_user_id: recipient.userId,
    accepted_device_session_id: null,
    media_provider: 'livekit' as const,
    room_name: `kryno-audio-${callId}`,
    state: 'ringing',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  };
  t.mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('update call_sessions')) return { rows: [], rowCount: 0 };
    if (sql.includes('from call_sessions')) return { rows: [existingCall], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  await assert.rejects(
    callsService.acceptLiveKitCall({ userId: 'outsider', sessionId: 'outsider-device' }, { callId }),
    (error: unknown) => error instanceof AppError && error.code === 'CALL_ACCESS_DENIED'
  );
});
