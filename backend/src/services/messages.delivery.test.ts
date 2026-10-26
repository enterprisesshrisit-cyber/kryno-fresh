import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { pool } from '../db/pool.js';
import { MessagesService } from './messages.service.js';
import { relayService } from './relay.service.js';
import { pushService } from './push.service.js';

const originalConnect = pool.connect.bind(pool);
const originalPoolQuery = pool.query.bind(pool);
const originalDeliver = relayService.deliverDirectMessage.bind(relayService);
const originalPush = pushService.sendDirectMessageNotification.bind(pushService);

afterEach(() => {
  pool.connect = originalConnect as typeof pool.connect;
  pool.query = originalPoolQuery as typeof pool.query;
  relayService.deliverDirectMessage = originalDeliver;
  pushService.sendDirectMessageNotification = originalPush;
});

const sendInput = {
  messageId: '66666666-6666-4666-8666-666666666666',
  senderUserId: '44444444-4444-4444-8444-444444444444',
  senderSessionId: '55555555-5555-4555-8555-555555555555',
  recipientLookup: 'recipient', recipientDeviceSessionId: '33333333-3333-4333-8333-333333333333',
  messageType: 'text', ciphertext: 'encrypted-ciphertext', encryptedContentType: 'signal',
  clientCreatedAt: '2026-09-19T00:00:00.000Z'
};
const recipientUserId = '22222222-2222-4222-8222-222222222222';

function messageFixture(existing = false, originalTargets = [sendInput.recipientDeviceSessionId]) {
  const events: string[] = [];
  const relayTargets: Parameters<typeof relayService.deliverDirectMessage>[0][] = [];
  const pushes: Parameters<typeof pushService.sendDirectMessageNotification>[0][] = [];
  const row = {
    message_id: sendInput.messageId, sender_user_id: sendInput.senderUserId,
    sender_device_session_id: sendInput.senderSessionId, recipient_user_id: recipientUserId,
    recipient_device_session_id: sendInput.recipientDeviceSessionId as string | null,
    message_type: sendInput.messageType, ciphertext: sendInput.ciphertext,
    encrypted_content_type: sendInput.encryptedContentType, client_created_at: sendInput.clientCreatedAt,
    server_received_at: '2026-09-19T00:00:01.000Z', expires_at: '2035-09-20T00:00:00.000Z',
    notification_target_session_ids: originalTargets as string[] | null,
    notification_is_control: false as boolean | null
  };
  let stored = existing;
  let prefs = { muted: false, focus_mode: false, private_mode: false };
  let waitPrefs: Promise<void> = Promise.resolve();
  pool.connect = (async () => ({
    release() {},
    async query(sql: string, params: unknown[] = []) {
      const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (['begin', 'commit', 'rollback'].includes(query)) { events.push(query); return { rows: [], rowCount: 0 }; }
      if (query.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (query.startsWith('select id from users')) return { rows: [{ id: recipientUserId }] };
      if (query.startsWith('select username')) return { rows: [{ username: 'sender' }] };
      if (query.startsWith('select message_id')) return { rows: stored ? [row] : [] };
      if (query.startsWith('select id, user_id')) return { rows: [{ id: String(params[0]).toLowerCase(), user_id: recipientUserId, trusted: true }] };
      if (query.startsWith('select id from device_sessions')) return { rows: originalTargets.map(id => ({ id })) };
      if (query.startsWith('insert into direct_messages')) {
        events.push('persist-message'); stored = true;
        row.recipient_device_session_id = params[4] as string | null;
        row.notification_target_session_ids = params[10] as string[];
        row.notification_is_control = params[11] as boolean;
        row.message_type = params[5] as string;
        return { rows: [{ message_id: row.message_id }], rowCount: 1 };
      }
      if (query.startsWith('insert into direct_message_deliveries')) { events.push('persist-delivery'); return { rows: [], rowCount: 1 }; }
      if (query.startsWith('select dmd.device_session_id')) return { rows: (params[2] as string[]).map(device_session_id => ({ device_session_id })) };
      throw new Error(`Unexpected fixture transaction query: ${query}`);
    }
  })) as unknown as typeof pool.connect;
  pool.query = (async (sql: string) => {
    if (sql.includes('from blocked_users')) return { rows: [{ blocked: false, message_visibility: 'public' }] };
    if (sql.includes('from direct_conversation_settings')) { await waitPrefs; return { rows: [prefs] }; }
    throw new Error('Unexpected fixture pool query');
  }) as typeof pool.query;
  relayService.deliverDirectMessage = target => {
    events.push('relay'); relayTargets.push(target);
    return { delivered: true, deliveredCount: 1, deliveredSessionIds: [target.recipientDeviceSessionId!] };
  };
  pushService.sendDirectMessageNotification = async input => {
    pushes.push(input);
    return { attempted: 0, sent: 0, intendedTargetCount: input.intendedSessionIds.length,
      eligibleTargetCount: 0, matchedRelayExclusionCount: 0, revalidatedOutCount: 0 };
  };
  return { events, row, pushes, relayTargets,
    waitForPrefs(value: Promise<void>) { waitPrefs = value; },
    setPrefs(value: typeof prefs) { prefs = value; }
  };
}

test('ciphertext and original targets commit before relay; notification work does not delay HTTP', async () => {
  const fixture = messageFixture();
  let release!: () => void;
  fixture.waitForPrefs(new Promise<void>(resolve => { release = resolve; }));
  try {
    const result = await new MessagesService().sendMessage(sendInput);
    assert.equal(result.deliveryMode, 'live');
    assert.deepEqual(result.pushNotification, { scheduled: true });
    for (const event of ['persist-message', 'persist-delivery']) {
      assert.ok(fixture.events.indexOf(event) < fixture.events.indexOf('commit'));
    }
    assert.ok(fixture.events.indexOf('commit') < fixture.events.indexOf('relay'));
    assert.equal(fixture.pushes.length, 0);
  } finally { release(); }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.pushes[0].intendedSessionIds, [sendInput.recipientDeviceSessionId]);
  assert.equal(fixture.pushes[0].senderUserId, sendInput.senderUserId);
  assert.deepEqual(fixture.pushes[0].excludeSessionIds, [sendInput.recipientDeviceSessionId]);
});

test('identical retry uses canonical data and never inserts or rediscovers targets', async () => {
  const fixture = messageFixture(true);
  await new MessagesService().sendMessage(sendInput);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.events.includes('persist-message'), false);
  assert.equal(fixture.events.includes('persist-delivery'), false);
  assert.equal(fixture.relayTargets[0].payload.ciphertext, fixture.row.ciphertext);
  assert.equal(fixture.relayTargets[0].payload.clientCreatedAt, fixture.row.client_created_at);
  assert.deepEqual(fixture.pushes[0].intendedSessionIds, fixture.row.notification_target_session_ids);
});

test('UUID case cannot reject first acceptance or retry, and ciphertext is never case folded', async () => {
  for (const existing of [false, true]) {
    const fixture = messageFixture(existing);
    fixture.row.message_id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    fixture.row.sender_user_id = 'abcdefab-aaaa-4abc-8def-abcdefabcdef';
    fixture.row.sender_device_session_id = 'abcdefab-bbbb-4abc-8def-abcdefabcdef';
    fixture.row.recipient_device_session_id = 'abcdefab-cccc-4abc-8def-abcdefabcdef';
    fixture.row.notification_target_session_ids = [fixture.row.recipient_device_session_id];
    fixture.row.ciphertext = 'OpaqueCaseSensitiveCiphertext';
    const input = { ...sendInput, messageId: fixture.row.message_id.toUpperCase(),
      senderUserId: fixture.row.sender_user_id.toUpperCase(), senderSessionId: fixture.row.sender_device_session_id.toUpperCase(),
      recipientDeviceSessionId: fixture.row.recipient_device_session_id.toUpperCase(), ciphertext: fixture.row.ciphertext };
    const result = await new MessagesService().sendMessage(input);
    assert.equal(result.messageId, fixture.row.message_id);
    assert.equal(fixture.relayTargets[0].recipientDeviceSessionId, fixture.row.recipient_device_session_id);
    assert.equal(fixture.relayTargets[0].payload.ciphertext, 'OpaqueCaseSensitiveCiphertext');
    assert.equal(input.messageId, input.messageId.toUpperCase()); // caller input unchanged
    await assert.rejects(new MessagesService().sendMessage({ ...input, ciphertext: input.ciphertext.toLowerCase() }),
      { code: 'MESSAGE_ID_CONFLICT' });
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('conflicting retries reject target, ciphertext, type, session, timestamp and control changes', async () => {
  for (const change of [
    { recipientDeviceSessionId: undefined }, { recipientDeviceSessionId: '77777777-7777-4777-8777-777777777777' },
    { ciphertext: 'changed-encrypted-content' }, { messageType: 'attachment' }, { encryptedContentType: 'changed' },
    { senderSessionId: '77777777-7777-4777-8777-777777777777' }, { clientCreatedAt: '2026-09-20T00:00:00Z' },
    { temporaryControl: true }
  ]) {
    const fixture = messageFixture(true);
    await assert.rejects(new MessagesService().sendMessage({ ...sendInput, ...change }), { code: 'MESSAGE_ID_CONFLICT' });
    assert.equal(fixture.events.includes('persist-delivery'), false);
    assert.equal(fixture.relayTargets.length, 0);
    assert.equal(fixture.events.at(-1), 'rollback');
  }
});

test('account-targeted retry relays only original session snapshot, never all current sockets', async () => {
  const fixture = messageFixture(true);
  fixture.row.recipient_device_session_id = null;
  await new MessagesService().sendMessage({ ...sendInput, recipientDeviceSessionId: undefined });
  assert.deepEqual(fixture.relayTargets.map(target => target.recipientDeviceSessionId), [sendInput.recipientDeviceSessionId]);
  assert.equal(fixture.relayTargets[0].payload.recipientDeviceSessionId, null);
});

test('empty, unknown and expired original targets never fall back to account-wide relay or push', async () => {
  for (const kind of ['empty', 'unknown', 'expired']) {
    const fixture = messageFixture(true, []);
    if (kind === 'unknown') fixture.row.notification_target_session_ids = null;
    if (kind === 'expired') fixture.row.expires_at = '2020-01-01T00:00:00Z';
    const result = await new MessagesService().sendMessage(sendInput);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.deliveryMode, 'queued');
    assert.equal(fixture.relayTargets.length, 0);
    assert.deepEqual(fixture.pushes[0]?.intendedSessionIds ?? [], []);
  }
});

test('muted/focused and canonical control messages do not dispatch direct-message pushes', async () => {
  for (const kind of ['muted', 'focus', 'media', 'temporary']) {
    const fixture = messageFixture();
    fixture.setPrefs({ muted: kind === 'muted', focus_mode: kind === 'focus', private_mode: false });
    await new MessagesService().sendMessage({ ...sendInput,
      messageType: kind === 'media' ? 'call_media_key' : 'text', temporaryControl: kind === 'temporary' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.pushes.length, 0);
  }
});

test('acknowledgement is scoped to one device and deletes only after all devices ack', async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const messageId = '66666666-6666-4666-8666-666666666666';
  const recipientUserId = '22222222-2222-4222-8222-222222222222';
  const recipientSessionId = '33333333-3333-4333-8333-333333333333';

  const client = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      queries.push({ sql: normalized, values });
      if (normalized.startsWith('update direct_message_deliveries')) {
        return { rows: [{ message_id: messageId }], rowCount: 1 };
      }
      if (normalized.startsWith('delete from direct_messages')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  pool.connect = (async () => client) as unknown as typeof pool.connect;

  const result = await new MessagesService().acknowledgeMessages({
    currentUserId: recipientUserId,
    recipientSessionId,
    messageIds: [messageId]
  });

  const ackQuery = queries.find((entry) => entry.sql.startsWith('update direct_message_deliveries'));
  const deleteQuery = queries.find((entry) => entry.sql.startsWith('delete from direct_messages'));
  assert.ok(ackQuery?.sql.includes('dmd.device_session_id = $2'));
  assert.equal(ackQuery?.values?.[1], recipientSessionId);
  assert.ok(deleteQuery?.sql.includes('not exists'));
  assert.equal(result.acknowledgedCount, 1);
  assert.equal(result.deletedCount, 0);
});
