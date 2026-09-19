import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { pool } from '../db/pool.js';
import { MessagesService } from './messages.service.js';
import { relayService } from './relay.service.js';

const originalConnect = pool.connect.bind(pool);
const originalPoolQuery = pool.query.bind(pool);
const originalDeliver = relayService.deliverDirectMessage.bind(relayService);

afterEach(() => {
  pool.connect = originalConnect as typeof pool.connect;
  pool.query = originalPoolQuery as typeof pool.query;
  relayService.deliverDirectMessage = originalDeliver;
});

test('direct message ciphertext commits before realtime relay', async () => {
  const events: string[] = [];
  const recipientUserId = '22222222-2222-4222-8222-222222222222';
  const recipientSessionId = '33333333-3333-4333-8333-333333333333';
  const senderUserId = '44444444-4444-4444-8444-444444444444';
  const senderSessionId = '55555555-5555-4555-8555-555555555555';
  const messageId = '66666666-6666-4666-8666-666666666666';

  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        events.push(normalized);
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('select id from users')) {
        return { rows: [{ id: recipientUserId }], rowCount: 1 };
      }
      if (normalized.includes('select username from users')) {
        return { rows: [{ username: 'sender' }], rowCount: 1 };
      }
      if (normalized.includes('select id, user_id, trusted from device_sessions')) {
        return {
          rows: [{ id: recipientSessionId, user_id: recipientUserId, trusted: true }],
          rowCount: 1
        };
      }
      if (normalized.startsWith('insert into direct_messages')) {
        events.push('persist-message');
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('select message_id, sender_user_id')) {
        return {
          rows: [{
            message_id: messageId,
            sender_user_id: senderUserId,
            recipient_user_id: recipientUserId,
            recipient_device_session_id: recipientSessionId,
            server_received_at: '2026-09-19T00:00:00.000Z',
            expires_at: '2026-09-20T00:00:00.000Z'
          }],
          rowCount: 1
        };
      }
      if (normalized.startsWith('insert into direct_message_deliveries')) {
        events.push('persist-delivery');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected transaction query: ${normalized}`);
    },
    release() {
      events.push('release');
    }
  };

  pool.connect = (async () => client) as unknown as typeof pool.connect;
  pool.query = (async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from blocked_users')) {
      return {
        rows: [{ blocked: false, message_visibility: 'public', current_user_follows_peer: false }],
        rowCount: 1
      };
    }
    if (normalized.includes('from direct_conversation_settings')) {
      return { rows: [{ muted: true, focus_mode: false, private_mode: false }], rowCount: 1 };
    }
    throw new Error(`Unexpected pool query: ${normalized}`);
  }) as typeof pool.query;
  relayService.deliverDirectMessage = ((target) => {
    events.push('relay');
    assert.equal(target.payload.ciphertext, 'encrypted-ciphertext');
    return { delivered: true, deliveredCount: 1, deliveredSessionIds: [recipientSessionId] };
  }) as typeof relayService.deliverDirectMessage;

  const service = new MessagesService();
  const result = await service.sendMessage({
    messageId,
    senderUserId,
    senderSessionId,
    recipientLookup: 'recipient',
    recipientDeviceSessionId: recipientSessionId,
    messageType: 'text',
    ciphertext: 'encrypted-ciphertext',
    encryptedContentType: 'signal',
    clientCreatedAt: '2026-09-19T00:00:00.000Z'
  });

  assert.equal(result.deliveryMode, 'live');
  assert.ok(events.indexOf('persist-message') < events.indexOf('commit'));
  assert.ok(events.indexOf('persist-delivery') < events.indexOf('commit'));
  assert.ok(events.indexOf('commit') < events.indexOf('relay'));
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
