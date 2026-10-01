import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { couplesService } from '../src/services/couples.service.js';
import { coupleLiveService } from '../src/services/coupleLive.service.js';
import { coupleEventSchema } from '../src/routes/couples.routes.js';
import { relayService } from '../src/services/relay.service.js';

test('couple authorization, RLS, ephemeral relay and revocation in isolated Postgres schema', async (t) => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.DATABASE_URL).hostname));
  assert.notEqual(env.APP_ENV, 'production');
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  const schema = `couple_test_${randomUUID().replaceAll('-', '')}`;
  const role = `${schema}_client`;
  const a = randomUUID(), b = randomUUID(), outsider = randomUUID(), da = randomUUID(), db = randomUUID();
  await client.connect();
  try {
    await client.query(`create schema ${schema}`);
    await client.query(`set search_path to ${schema}, public`);
    await client.query(`
      create table users(id uuid primary key, username text, password_hash text);
      create table device_sessions(id uuid primary key, user_id uuid references users, trusted boolean default true, last_seen_at timestamptz default now());
      create table refresh_tokens(id uuid primary key, user_id uuid, revoked_at timestamptz, expires_at timestamptz);
      create table blocked_users(blocker_user_id uuid, blocked_user_id uuid);
      create table direct_messages(message_id uuid primary key, expires_at timestamptz);
    `);
    await client.query(await readFile(new URL('../db/migrations/20261001_add_couple_tools.sql', import.meta.url), 'utf8'));
    await client.query('insert into users values ($1,$2,$3),($4,$5,$3),($6,$7,$3)', [a, 'qa_alice', 'fixture', b, 'qa_bob', outsider, 'qa_eve']);
    await client.query('insert into device_sessions(id,user_id) values ($1,$2),($3,$4)', [da, a, db, b]);
    t.mock.method(pool, 'query', client.query.bind(client));
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));
    const relayed: unknown[] = [];
    t.mock.method(relayService, 'sendEventToSession', (_id, event) => { relayed.push(event); });
    t.mock.method(relayService, 'sendEventToUser', () => undefined);

    await t.test('pairing requires an invitation accepted by its exact recipient', async () => {
      await assert.rejects(couplesService.invite(a, 'qa_alice'));
      const invitation = await couplesService.invite(a, 'qa_bob');
      await assert.rejects(couplesService.respond(outsider, invitation.invitationId, true));
      await couplesService.respond(b, invitation.invitationId, true);
      assert.equal((await couplesService.current(a)).couple?.partnerId, b);
      await assert.rejects(couplesService.invite(outsider, 'qa_bob'));
    });
    const pair = (await couplesService.current(a)).couple!;
    await t.test('default-off permissions and device binding prevent unauthorized live access', async () => {
      await assert.rejects(coupleLiveService.create({ userId: a, sessionId: da }, 'typing'));
      await coupleLiveService.updatePermission(a, { liveTyping: true });
      const live = await coupleLiveService.create({ userId: a, sessionId: da }, 'typing');
      await assert.rejects(coupleLiveService.get({ userId: outsider, sessionId: db }, live.id));
      await assert.rejects(coupleLiveService.get({ userId: a, sessionId: db }, live.id));
      await coupleLiveService.heartbeat({ userId: a, sessionId: da }, live.id);
      await coupleLiveService.heartbeat({ userId: b, sessionId: db }, live.id);
      await coupleLiveService.snapshot({ userId: a, sessionId: da }, live.id, 1, 'opaque-encrypted-draft');
      assert.equal(relayed.length, 1);
      await assert.rejects(coupleLiveService.snapshot({ userId: a, sessionId: da }, live.id, 1, 'replay'));
      await assert.rejects(coupleLiveService.snapshot({ userId: b, sessionId: db }, live.id, 2, 'wrong-owner'));
      const columns = await client.query("select column_name from information_schema.columns where table_schema=$1 and table_name='couple_live_sessions'", [schema]);
      assert.equal(columns.rows.some((row) => /draft|ciphertext|body|key/.test(row.column_name)), false);
      await coupleLiveService.updatePermission(a, { liveTyping: false });
      await assert.rejects(coupleLiveService.snapshot({ userId: a, sessionId: da }, live.id, 2, 'revoked'));
      assert.equal(relayed.length, 1);
    });
    await t.test('usage charges server elapsed time, preserves fractions and enforces exhaustion', async () => {
      await coupleLiveService.updatePermission(a, { liveTyping: true });
      const live = await coupleLiveService.create({ userId: a, sessionId: da }, 'typing');
      await coupleLiveService.heartbeat({ userId: a, sessionId: da }, live.id);
      await coupleLiveService.heartbeat({ userId: b, sessionId: db }, live.id);
      await client.query("update couple_live_sessions set last_billed_at = now() - interval '5.7 seconds' where id=$1", [live.id]);
      const result = await coupleLiveService.heartbeat({ userId: a, sessionId: da }, live.id);
      assert.equal(result.remainingSeconds, env.LIVE_TYPING_FREE_SECONDS_PER_DAY - 5);
      const again = await coupleLiveService.heartbeat({ userId: b, sessionId: db }, live.id);
      assert.equal(again.remainingSeconds, result.remainingSeconds);
      await client.query("update couple_feature_usage set seconds_used=$2 where user_id=$1 and feature='typing'", [a, env.LIVE_TYPING_FREE_SECONDS_PER_DAY]);
      assert.equal((await coupleLiveService.heartbeat({ userId: a, sessionId: da }, live.id)).session.status, 'ended');
      await assert.rejects(coupleLiveService.create({ userId: a, sessionId: da }, 'typing'));
      await client.query('delete from couple_feature_usage');
    });
    await t.test('client cannot write plaintext or private keys through the encrypted event route', () => {
      const body = { coupleId: pair.id, messageId: randomUUID(), recipientDeviceSessionId: db, encryptedContentType: 'signal', clientCreatedAt: new Date().toISOString(), ciphertext: JSON.stringify({ type: 3, body: 'opaque-ciphertext-fixture', registrationId: 1 }) };
      assert.ok(coupleEventSchema.safeParse(body).success);
      assert.equal(coupleEventSchema.safeParse({ ...body, privateKey: 'secret' }).success, false);
      assert.equal(coupleEventSchema.safeParse({ ...body, text: 'plaintext' }).success, false);
      assert.equal(coupleEventSchema.safeParse({ ...body, ciphertext: 'plaintext' }).success, false);
    });
    await t.test('RLS actually denies unprivileged SELECT even with a temporary SELECT grant', async () => {
      await client.query(`create role ${role} nologin`);
      await client.query(`grant usage on schema ${schema} to ${role}`);
      await client.query(`grant select on all tables in schema ${schema} to ${role}`);
      await client.query(`set role ${role}`);
      try {
        for (const table of ['couple_members', 'couple_relationships', 'couple_permissions', 'couple_invitations', 'couple_live_sessions', 'couple_feature_usage', 'couple_message_links', 'couple_rtc_cleanup']) {
          assert.equal((await client.query(`select * from ${schema}.${table}`)).rowCount, 0, table);
        }
      } finally { await client.query('reset role'); }
    });
    await t.test('security reset revokes standing permission and live sessions', async () => {
      await coupleLiveService.updatePermission(a, { liveTyping: true, trustedScreen: true });
      const live = await coupleLiveService.create({ userId: a, sessionId: da }, 'typing');
      await client.query("update users set password_hash='reset-fixture' where id=$1", [a]);
      const grants = await coupleLiveService.permissions(a);
      assert.equal(grants.permissions.find((row) => row.ownerId === a).trustedScreen, false);
      assert.equal((await coupleLiveService.get({ userId: a, sessionId: da }, live.id)).status, 'ended');
    });
    await t.test('unlink ends sessions and deletes queued couple ciphertext without transferring permission', async () => {
      await coupleLiveService.updatePermission(a, { liveTyping: true });
      const live = await coupleLiveService.create({ userId: a, sessionId: da }, 'typing');
      const message = randomUUID();
      await client.query('insert into direct_messages values ($1, now())', [message]);
      await client.query('insert into couple_message_links values ($1,$2)', [message, pair.id]);
      await couplesService.unlink(b);
      assert.equal((await couplesService.current(a)).couple, null);
      assert.equal((await client.query('select * from direct_messages')).rowCount, 0);
      assert.equal((await client.query('select * from couple_permissions')).rowCount, 0);
      assert.equal((await client.query('select status from couple_live_sessions where id=$1', [live.id])).rows[0].status, 'ended');
      const invite = await couplesService.invite(a, 'qa_eve');
      await couplesService.respond(outsider, invite.invitationId, true);
      assert.equal((await coupleLiveService.permissions(a)).permissions.every((row) => !row.trustedScreen && !row.liveTyping), true);
      await client.query('insert into blocked_users values ($1,$2)', [a, outsider]);
      assert.equal((await couplesService.current(a)).couple, null);
    });
  } finally {
    await client.query('reset role').catch(() => undefined);
    await client.query('set search_path to public');
    await client.query(`drop schema if exists ${schema} cascade`);
    await client.query(`drop role if exists ${role}`);
    await client.end();
  }
});
