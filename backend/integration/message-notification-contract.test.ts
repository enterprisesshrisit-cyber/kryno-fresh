import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { MessagesService } from '../src/services/messages.service.js';
import { devicesService } from '../src/services/devices.service.js';
import { pushService, DIRECT_MESSAGE_PUSH_TARGETS_SQL } from '../src/services/push.service.js';
import { activatePushOwner, retirePushOwner } from '../src/services/push-ownership.service.js';
import { relayService } from '../src/services/relay.service.js';
import { sha256 } from '../src/utils/crypto.js';

test('isolated localhost notification contract: migration, canonical retries, targeting and registration races', { timeout: 120000 }, async t => {
  // Reject URI options as well: pg query parameters can override connection fields.
  const url = new URL(env.DATABASE_URL);
  assert.equal(env.APP_ENV, 'test');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(env.DATABASE_SSL, false);
  const schema = `qa_notification_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^qa_notification_[a-f0-9]{32}$/);
  const clients = new Set<pg.Client>();
  const releases: Promise<void>[] = [];
  const open = async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query(`set search_path to "${schema}"`);
    await client.query("set statement_timeout = '10s'");
    clients.add(client);
    return client;
  };
  const admin = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await admin.connect();
  let created = false;
  const migration = await readFile(new URL('../db/migrations/20261018_add_message_notification_contract.sql', import.meta.url), 'utf8');
  const apply = async (sql: string) => {
    await admin.query('begin');
    try { await admin.query(sql); await admin.query('commit'); }
    catch (error) { await admin.query('rollback'); throw error; }
  };
  try {
    await admin.query(`create schema "${schema}"`);
    created = true;
    await admin.query(`set search_path to "${schema}"`);
    await apply(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    for (const name of ['20261008_add_native_push_scope.sql', '20261008_add_push_installation_owners.sql', '20261008_add_push_installation_credentials.sql']) {
      await apply(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const sender = randomUUID(); const recipient = randomUUID(); const other = randomUUID();
    const senderSession = randomUUID(); const d1 = randomUUID(); const d2 = randomUUID(); const dc = randomUUID();
    for (const [id, username] of [[sender, 'fixture_sender'], [recipient, 'fixture_recipient'], [other, 'fixture_other']]) {
      await admin.query('insert into users(id,username,email,password_hash) values ($1,$2,$3,$4)',
        [id, username, `${username}@example.invalid`, 'fixture-not-a-real-password-hash']);
    }
    for (const [id, user] of [[senderSession, sender], [d1, recipient], [d2, recipient], [dc, other]]) {
      await admin.query('insert into device_sessions(id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
        [id, user, `fixture-${id}`, 'fixture-public-key']);
    }
    const legacyId = randomUUID();
    const createdAt = '2026-10-18T00:00:00.000Z';
    await admin.query(`insert into direct_messages(message_id,sender_user_id,sender_device_session_id,
      recipient_user_id,recipient_device_session_id,message_type,ciphertext,client_created_at,expires_at)
      values ($1,$2,$3,$4,$5,'text','fixture-ciphertext-retained',$6,now()+interval '1 day')`,
    [legacyId, sender, senderSession, recipient, d1, createdAt]);
    await admin.query('insert into direct_message_deliveries(message_id,device_session_id) values ($1,$2)', [legacyId, d1]);

    await t.test('populated migration and replay retain legacy bytes, default OFF and validate schema', async () => {
      await apply(migration); await apply(migration);
      const legacy = (await admin.query('select * from direct_messages where message_id=$1', [legacyId])).rows[0];
      assert.equal(legacy.ciphertext, 'fixture-ciphertext-retained');
      assert.equal(legacy.notification_target_session_ids, null);
      assert.equal(legacy.notification_is_control, null);
      assert.equal((await admin.query('select message_notification_version from device_sessions where id=$1', [d1])).rows[0].message_notification_version, 0);
      await assert.rejects(admin.query('update device_sessions set message_notification_version=2 where id=$1', [d1]),
        (error: unknown) => (error as { code?: string }).code === '23514');
    });

    await t.test('wrong existing type, default or named constraint fails closed transactionally', async () => {
      for (const definition of ["message_notification_version text not null default '0'",
        'message_notification_version smallint not null default 1',
        'message_notification_version smallint not null default 0 constraint device_sessions_message_notification_version_check check (message_notification_version >= 0)']) {
        const wrong = `qa_notification_${randomUUID().replaceAll('-', '')}`;
        await admin.query('begin');
        try {
          await admin.query(`create schema "${wrong}"`);
          await admin.query(`set local search_path to "${wrong}"`);
          await admin.query(`create table device_sessions(id uuid primary key, ${definition}); create table direct_messages(message_id uuid primary key)`);
          await assert.rejects(admin.query(migration), /Incompatible/);
        } finally { await admin.query('rollback'); }
        assert.equal((await admin.query('select 1 from pg_namespace where nspname=$1', [wrong])).rowCount, 0);
      }
    });

    t.mock.method(pool, 'connect', async () => {
      const client = await open();
      return { query: (sql: string, params?: unknown[]) => client.query(sql, params),
        release() { releases.push(client.end().finally(() => { clients.delete(client); })); } };
    });
    const realQuery = async (sql: string, params?: unknown[]) => {
      const client = await open();
      try { return await client.query(sql, params); }
      finally { await client.end(); clients.delete(client); }
    };
    t.mock.method(pool, 'query', realQuery);
    const families = new Map<string, string>();
    for (const [session, user] of [[d1, recipient], [d2, recipient], [dc, other]]) {
      const family = randomUUID(); families.set(session, family);
      await admin.query(`insert into refresh_tokens(user_id,device_session_id,token_family_id,token_hash,expires_at)
        values ($1,$2,$3,$4,now()+interval '1 day')`, [user, session, family, sha256(randomUUID())]);
      await admin.query('begin');
      await activatePushOwner(admin as unknown as pg.PoolClient, session, `fixture-${session}`, family);
      await admin.query('commit');
    }
    const proof = 'ab'.repeat(32);
    const register = (session: string, version?: 1, scope: 0 | 1 = 1) => devicesService.registerPushToken({
      userId: session === dc ? other : recipient, sessionId: session, deviceId: `fixture-${session}`,
      tokenFamilyId: families.get(session), installationCredential: proof, provider: 'fcm', platform: 'android',
      pushToken: `fixture-fcm-token-${session}`, pushScopeVersion: scope === 1 ? 1 : undefined, messageNotificationVersion: version
    });
    for (const session of [d1, d2, dc]) await register(session, 1);

    const relays: Parameters<typeof relayService.deliverDirectMessage>[0][] = [];
    t.mock.method(relayService, 'deliverDirectMessage', (target: Parameters<typeof relayService.deliverDirectMessage>[0]) => {
      relays.push(target);
      return { delivered: true, deliveredCount: 1, deliveredSessionIds: [target.recipientDeviceSessionId!] };
    });
    const service = new MessagesService();
    const input = { messageId: randomUUID(), senderUserId: sender, senderSessionId: senderSession,
      recipientLookup: recipient, recipientDeviceSessionId: d1, messageType: 'text',
      ciphertext: 'fixture-canonical-ciphertext', encryptedContentType: 'signal', clientCreatedAt: createdAt };
    await t.test('first acceptance and retries preserve original envelope and targets', async child => {
      const captured: Parameters<typeof pushService.sendDirectMessageNotification>[0][] = [];
      let notify!: () => void;
      let done = new Promise<void>(resolve => { notify = resolve; });
      child.mock.method(pushService, 'sendDirectMessageNotification', async (value: Parameters<typeof pushService.sendDirectMessageNotification>[0]) => {
        captured.push(value); notify();
        return { attempted: 0, sent: 0, intendedTargetCount: value.intendedSessionIds.length,
          eligibleTargetCount: 0, matchedRelayExclusionCount: 0, revalidatedOutCount: 0 };
      });
      await service.sendMessage(input); await done;
      assert.deepEqual(captured[0].intendedSessionIds, [d1]);
      await admin.query('insert into direct_message_deliveries(message_id,device_session_id) values ($1,$2)', [input.messageId, d2]);
      done = new Promise<void>(resolve => { notify = resolve; });
      await service.sendMessage(input); await done;
      assert.deepEqual(captured[1].intendedSessionIds, [d1]);
      assert.deepEqual(relays.map(target => target.recipientDeviceSessionId), [d1, d1]);
      for (const change of [{ recipientDeviceSessionId: d2 }, { recipientDeviceSessionId: undefined },
        { ciphertext: 'different-ciphertext' }, { messageType: 'attachment' }, { temporaryControl: true }]) {
        await assert.rejects(service.sendMessage({ ...input, ...change }), { code: 'MESSAGE_ID_CONFLICT' });
      }
      assert.equal(relays.length, 2);
      const canonical = (await admin.query('select * from direct_messages where message_id=$1', [input.messageId])).rows[0];
      assert.deepEqual(canonical.notification_target_session_ids, [d1]);
      assert.equal(canonical.ciphertext, input.ciphertext);
    });

    await t.test('uppercase UUID first acceptance and retry use canonical identity without modifying ciphertext', async child => {
      let notified!: () => void;
      let done = new Promise<void>(resolve => { notified = resolve; });
      child.mock.method(pushService, 'sendDirectMessageNotification', async () => {
        notified(); return { attempted: 0, sent: 0 };
      });
      const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
      const mixed = { ...input, messageId: id.toUpperCase(), senderUserId: sender.toUpperCase(),
        senderSessionId: senderSession.toUpperCase(), recipientDeviceSessionId: d1.toUpperCase(),
        ciphertext: 'OpaqueCaseSensitiveCiphertext' };
      assert.equal((await service.sendMessage(mixed)).messageId, id); await done;
      done = new Promise<void>(resolve => { notified = resolve; });
      assert.equal((await service.sendMessage({ ...mixed, messageId: id })).messageId, id); await done;
      const row = (await admin.query('select * from direct_messages where message_id=$1', [id])).rows[0];
      assert.equal(row.ciphertext, mixed.ciphertext);
      assert.deepEqual(row.notification_target_session_ids, [d1]);
      await assert.rejects(service.sendMessage({ ...mixed, ciphertext: mixed.ciphertext.toLowerCase() }),
        { code: 'MESSAGE_ID_CONFLICT' });
    });

    await t.test('pre-contract retry stays fetchable and never widens or rewrites original rows', async () => {
      const before = relays.length;
      const result = await service.sendMessage({ ...input, messageId: legacyId, ciphertext: 'fixture-ciphertext-retained' });
      assert.equal(result.deliveryMode, 'queued');
      assert.equal(relays.length, before);
      assert.equal(result.pushNotification.scheduled, false);
      const rows = (await admin.query('select device_session_id from direct_message_deliveries where message_id=$1', [legacyId])).rows;
      assert.deepEqual(rows.map(row => row.device_session_id), [d1]);
      const inbox = await service.fetchInbox(recipient, d1);
      assert.ok(inbox.messages.some(message => message.messageId === legacyId && message.ciphertext === 'fixture-ciphertext-retained'));
    });

    await t.test('concurrent conflicting first acceptance commits exactly one original target', async child => {
      let finished!: () => void;
      const dispatch = new Promise<void>(resolve => { finished = resolve; });
      child.mock.method(pushService, 'sendDirectMessageNotification', async (value: Parameters<typeof pushService.sendDirectMessageNotification>[0]) => {
        finished(); return { attempted: 0, sent: 0, intendedTargetCount: value.intendedSessionIds.length,
          eligibleTargetCount: 0, matchedRelayExclusionCount: 0, revalidatedOutCount: 0 };
      });
      const messageId = randomUUID();
      const results = await Promise.allSettled([service.sendMessage({ ...input, messageId }),
        service.sendMessage({ ...input, messageId, recipientDeviceSessionId: d2 })]);
      await dispatch;
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.equal(failed.reason.code, 'MESSAGE_ID_CONFLICT');
      const stored = (await admin.query('select notification_target_session_ids from direct_messages where message_id=$1', [messageId])).rows[0];
      const deliveries = (await admin.query('select device_session_id from direct_message_deliveries where message_id=$1', [messageId])).rows;
      assert.deepEqual(deliveries.map(row => row.device_session_id), stored.notification_target_session_ids);
      assert.equal(deliveries.length, 1);
    });

    const key = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
    env.FIREBASE_PROJECT_ID = 'fixture-project'; env.FIREBASE_CLIENT_EMAIL = 'fixture@example.invalid'; env.FIREBASE_PRIVATE_KEY = key;
    const wires: string[] = [];
    t.mock.method(globalThis, 'fetch', async (endpoint: string, init: RequestInit) => {
      if (endpoint === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'fixture-not-real', expires_in: 3600 }));
      assert.equal(endpoint, 'https://fcm.googleapis.com/v1/projects/fixture-project/messages:send');
      wires.push(String(init.body)); return new Response('{}');
    });
    const pushInput = { messageId: input.messageId, recipientUserId: recipient, senderUserId: sender,
      intendedSessionIds: [d1, d2, dc], senderUsername: 'SENSITIVE-LABEL', excludeSessionIds: [d1] };
    await t.test('actual SQL excludes unrelated installations even if delivery rows were appended', async () => {
      const rows = (await realQuery(DIRECT_MESSAGE_PUSH_TARGETS_SQL, [recipient, [d1, d2, dc], input.messageId, sender])).rows;
      assert.deepEqual(rows.map(row => row.session_id), [d1]);
      env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = false;
      assert.equal((await pushService.sendDirectMessageNotification(pushInput)).attempted, 0);
      env.MESSAGE_NOTIFICATION_RELAY_WAKE_ENABLED = true;
      const result = await pushService.sendDirectMessageNotification(pushInput);
      assert.equal(result.attempted, 1); assert.equal(result.sent, 1);
      assert.equal(wires.at(-1)!.includes('SENSITIVE-LABEL'), false);
    });

    await t.test('same-generation capability omission and scope downgrade suppress in-flight discovery', async child => {
      for (const downgrade of ['capability', 'scope']) {
        const before = await register(d1, 1);
        let discover = true;
        child.mock.method(pool, 'query', async (sql: string, params?: unknown[]) => {
          const result = await realQuery(sql, params);
          if (discover && sql === DIRECT_MESSAGE_PUSH_TARGETS_SQL) {
            discover = false;
            const after = downgrade === 'capability' ? await register(d1) : await register(d1, undefined, 0);
            assert.equal(after.pushGeneration, before.pushGeneration);
            assert.equal(after.messageNotificationVersion, 0);
            assert.equal(after.pushScopeVersion, downgrade === 'scope' ? 0 : 1);
          }
          return result;
        });
        const result = await pushService.sendDirectMessageNotification(pushInput);
        assert.equal(result.attempted, 0); assert.equal(result.revalidatedOutCount, 1);
      }
    });

    await t.test('account target snapshot handles more than ten registrations and excludes a later installation', async child => {
      await register(d1, 1);
      const addInstallation = async () => {
        const session = randomUUID(); const family = randomUUID(); families.set(session, family);
        await admin.query('insert into device_sessions(id,user_id,device_id,device_public_key) values ($1,$2,$3,$4)',
          [session, recipient, `fixture-${session}`, 'fixture-public-key']);
        await admin.query(`insert into refresh_tokens(user_id,device_session_id,token_family_id,token_hash,expires_at)
          values ($1,$2,$3,$4,now()+interval '1 day')`, [recipient, session, family, sha256(randomUUID())]);
        await admin.query('begin');
        await activatePushOwner(admin as unknown as pg.PoolClient, session, `fixture-${session}`, family);
        await admin.query('commit'); await register(session, 1);
        return session;
      };
      const original = [d1, d2];
      for (let i = 0; i < 11; i++) original.push(await addInstallation());
      const captured: Parameters<typeof pushService.sendDirectMessageNotification>[0][] = [];
      let done!: () => void;
      let ready = new Promise<void>(resolve => { done = resolve; });
      const realPush = pushService.sendDirectMessageNotification.bind(pushService);
      child.mock.method(pushService, 'sendDirectMessageNotification', async (value: Parameters<typeof pushService.sendDirectMessageNotification>[0]) => {
        captured.push(value); done(); return { attempted: 0, sent: 0, intendedTargetCount: value.intendedSessionIds.length,
          eligibleTargetCount: 0, matchedRelayExclusionCount: 0, revalidatedOutCount: 0 };
      });
      const messageId = randomUUID();
      const accountInput = { ...input, messageId, recipientDeviceSessionId: undefined };
      await service.sendMessage(accountInput); await ready;
      assert.deepEqual([...captured[0].intendedSessionIds].sort(), [...original].sort());
      const later = await addInstallation();
      await admin.query('insert into direct_message_deliveries(message_id,device_session_id) values ($1,$2)', [messageId, later]);
      ready = new Promise<void>(resolve => { done = resolve; });
      await service.sendMessage(accountInput); await ready;
      assert.deepEqual([...captured[1].intendedSessionIds].sort(), [...original].sort());
      const before = wires.length;
      const result = await realPush({ ...pushInput, messageId, intendedSessionIds: [...original, later], excludeSessionIds: [] });
      assert.equal(result.attempted, 13); assert.equal(result.sent, 13);
      assert.equal(wires.length - before, 13);
      assert.equal(wires.slice(before).some(wire => wire.includes(later)), false);
    });

    await t.test('wrong proof and stale family preserve prior capability and token binding', async () => {
      const before = (await admin.query('select push_token,push_owner_generation,message_notification_version from device_sessions where id=$1', [d1])).rows[0];
      for (const change of [{ installationCredential: 'cd'.repeat(32) }, { tokenFamilyId: randomUUID() }]) {
        await assert.rejects(devicesService.registerPushToken({ userId: recipient, sessionId: d1,
          deviceId: `fixture-${d1}`, tokenFamilyId: families.get(d1), provider: 'fcm', platform: 'android',
          pushToken: 'fixture-token-that-must-not-replace-binding', pushScopeVersion: 1,
          messageNotificationVersion: 1, installationCredential: proof, ...change }));
      }
      const after = (await admin.query('select push_token,push_owner_generation,message_notification_version from device_sessions where id=$1', [d1])).rows[0];
      assert.deepEqual(after, before);
    });

    await t.test('mute, focus, block, invalid account, expiry and empty inputs fail closed', async () => {
      await register(d1, 1);
      for (const column of ['muted', 'focus_mode']) {
        await admin.query(`insert into direct_conversation_settings(user_id,peer_user_id,${column}) values ($1,$2,true)
          on conflict (user_id,peer_user_id) do update set ${column}=true`, [recipient, sender]);
        assert.equal((await pushService.sendDirectMessageNotification(pushInput)).attempted, 0);
        await admin.query(`update direct_conversation_settings set ${column}=false where user_id=$1`, [recipient]);
      }
      await admin.query('insert into blocked_users(blocker_user_id,blocked_user_id) values ($1,$2)', [recipient, sender]);
      assert.equal((await pushService.sendDirectMessageNotification(pushInput)).attempted, 0);
      await admin.query('delete from blocked_users where blocker_user_id=$1', [recipient]);
      assert.equal((await pushService.sendDirectMessageNotification({ ...pushInput, recipientUserId: other })).attempted, 0);
      assert.equal((await pushService.sendDirectMessageNotification({ ...pushInput, intendedSessionIds: [] })).attempted, 0);
      await admin.query("update direct_messages set expires_at=now()-interval '1 second' where message_id=$1", [input.messageId]);
      assert.equal((await pushService.sendDirectMessageNotification(pushInput)).attempted, 0);
    });

    await t.test('owner lifecycle resets capability and late retirement cannot clear current owner', async () => {
      await register(d1, 1);
      await admin.query('begin');
      await retirePushOwner(admin as unknown as pg.PoolClient, d1, `fixture-${d1}`, randomUUID());
      await admin.query('commit');
      assert.equal((await admin.query('select message_notification_version from device_sessions where id=$1', [d1])).rows[0].message_notification_version, 1);
      await admin.query('begin');
      await retirePushOwner(admin as unknown as pg.PoolClient, d1, `fixture-${d1}`, families.get(d1)!);
      await admin.query('commit');
      assert.equal((await admin.query('select message_notification_version from device_sessions where id=$1', [d1])).rows[0].message_notification_version, 0);
      await admin.query('begin');
      await activatePushOwner(admin as unknown as pg.PoolClient, d2, `fixture-${d2}`, families.get(d2)!);
      await admin.query('commit');
      assert.equal((await admin.query('select message_notification_version from device_sessions where id=$1', [d2])).rows[0].message_notification_version, 0);
    });
  } finally {
    await Promise.allSettled(releases);
    await Promise.allSettled([...clients].map(client => client.end()));
    if (created) {
      assert.match(schema, /^qa_notification_[a-f0-9]{32}$/);
      await admin.query('set search_path to pg_catalog');
      await admin.query(`drop schema "${schema}" cascade`);
    }
    await admin.end();
  }
});
