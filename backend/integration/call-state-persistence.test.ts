import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { CallsService } from '../src/services/calls.service.js';

test('call state persistence uses real isolated Postgres', { timeout: 20000 }, async t => {
  const url = new URL(env.DATABASE_URL);
  assert.equal(env.APP_ENV, 'test');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(env.DATABASE_SSL, false);
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("set statement_timeout = '5s'");
    // A session-local table shadows the fixture database; no persistent rows are touched.
    await client.query(`create temporary table call_sessions (
      call_id text primary key, state varchar(24) not null,
      accepted_device_session_id uuid, accepted_at timestamptz,
      connected_at timestamptz, ended_at timestamptz, end_reason text,
      expires_at timestamptz not null, updated_at timestamptz not null default now()
    )`);
    const queryErrors: Array<{ code?: string; message: string }> = [];
    t.mock.method(pool, 'query', async (sql: string, params?: unknown[]) => {
      try { return await client.query(sql, params); }
      catch (error) {
        const failure = error as Error & { code?: string };
        queryErrors.push({ code: failure.code, message: failure.message });
        throw error;
      }
    });
    const recipient = { userId: 'fixture-recipient', sessionId: '11111111-1111-4111-8111-111111111111' };
    const service = new CallsService();
    const activeCalls = (service as unknown as {
      callsById: Map<string, { callId: string; callerSessionId: string; acceptedSessionId: string;
        state: string; mediaProvider: string; roomName: string }>;
    }).callsById;

    await t.test('connected is durably stored with its timestamp', async () => {
      const callId = '22222222-2222-4222-8222-222222222222';
      const active = { callId, callerSessionId: 'fixture-caller', acceptedSessionId: recipient.sessionId,
        state: 'connecting', mediaProvider: 'livekit', roomName: 'fixture-room' };
      activeCalls.set(callId, active);
      await client.query("insert into call_sessions(call_id,state,expires_at) values ($1,'connecting',now()+interval '1 minute')", [callId]);
      await service.handleCommand(recipient, { type: 'call_connected', callId });
      assert.deepEqual(queryErrors, [], 'call persistence must not swallow a database failure');
      const row = (await client.query('select state,connected_at from call_sessions where call_id=$1', [callId])).rows[0];
      assert.equal(row.state, 'connected');
      assert.ok(row.connected_at instanceof Date);
      assert.equal(active.state, 'connected');
    });

    await t.test('a rejected terminal transition is not reported as connected in memory', async () => {
      const callId = '33333333-3333-4333-8333-333333333333';
      const active = { callId, callerSessionId: 'fixture-caller', acceptedSessionId: recipient.sessionId,
        state: 'connecting', mediaProvider: 'livekit', roomName: 'fixture-room' };
      activeCalls.set(callId, active);
      await client.query("insert into call_sessions(call_id,state,expires_at) values ($1,'ended',now())", [callId]);
      await service.handleCommand(recipient, { type: 'call_connected', callId });
      const row = (await client.query('select state,connected_at from call_sessions where call_id=$1', [callId])).rows[0];
      assert.equal(row.state, 'ended');
      assert.equal(row.connected_at, null);
      assert.equal(active.state, 'connecting');
    });

    const persistence = service as unknown as {
      persistCallState(call: { callId: string }, state: string,
        options?: { acceptedSessionId?: string; endReason?: string }): Promise<boolean>;
    };
    for (const state of ['connecting', 'ended', 'missed', 'declined', 'cancelled', 'expired', 'unavailable', 'failed']) {
      await t.test(`${state} transition stores its exact lifecycle fields`, async () => {
        const callId = `fixture-${state}`;
        await client.query("insert into call_sessions(call_id,state,expires_at) values ($1,'ringing',now()+interval '1 minute')", [callId]);
        assert.equal(await persistence.persistCallState({ callId }, state,
          { acceptedSessionId: recipient.sessionId, endReason: state === 'connecting' ? undefined : state }), true);
        const row = (await client.query('select * from call_sessions where call_id=$1', [callId])).rows[0];
        assert.equal(row.state, state);
        assert.equal(row.accepted_device_session_id, recipient.sessionId);
        assert.equal(row.connected_at, null);
        if (state === 'connecting') {
          assert.ok(row.accepted_at instanceof Date);
          assert.equal(row.ended_at, null);
          assert.equal(row.end_reason, null);
        } else {
          assert.equal(row.accepted_at, null);
          assert.ok(row.ended_at instanceof Date);
          assert.equal(row.end_reason, state);
          assert.equal(await persistence.persistCallState({ callId }, 'connected'), false);
        }
      });
    }
    assert.deepEqual(queryErrors, []);
  } finally {
    await client.end();
  }
});
