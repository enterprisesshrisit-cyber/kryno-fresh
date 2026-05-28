import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { pushService } from './push.service.js';
import { relayService } from './relay.service.js';

const DEFAULT_QUEUE_TTL_HOURS = 24 * 365;
const MAX_TTL_HOURS = 24 * 365;

type SendMessageInput = {
  messageId: string;
  senderUserId: string;
  senderSessionId: string;
  recipientLookup: string;
  recipientDeviceSessionId?: string | null;
  messageType: string;
  ciphertext: string;
  encryptedContentType: string;
  clientCreatedAt: string;
  ttlHours?: number | null;
};

type AckMessageInput = {
  currentUserId: string;
  recipientSessionId: string;
  messageIds: string[];
};

export class MessagesService {
  async sendMessage(input: SendMessageInput) {
    return withTransaction(async (client) => {
      const recipientResult = await client.query<{
        id: string;
      }>(
        `
          select id
          from users
          where id::text = $1 or lower(username) = lower($1)
          limit 1
        `,
        [input.recipientLookup]
      );

      const recipient = recipientResult.rows[0];

      if (!recipient) {
        throw new AppError(404, 'Recipient not found.', 'RECIPIENT_NOT_FOUND');
      }

      if (recipient.id === input.senderUserId) {
        throw new AppError(400, 'Cannot send a direct message to the same account.', 'SELF_MESSAGE_NOT_ALLOWED');
      }

      if (input.recipientDeviceSessionId) {
        const deviceResult = await client.query<{ id: string; user_id: string; trusted: boolean }>(
          `
            select id, user_id, trusted
            from device_sessions
            where id = $1
            limit 1
          `,
          [input.recipientDeviceSessionId]
        );

        const recipientDevice = deviceResult.rows[0];

        if (!recipientDevice || recipientDevice.user_id !== recipient.id || !recipientDevice.trusted) {
          throw new AppError(400, 'Recipient device session is invalid.', 'INVALID_RECIPIENT_DEVICE');
        }
      }

      const ttlHours = Math.min(Math.max(input.ttlHours ?? DEFAULT_QUEUE_TTL_HOURS, 1), MAX_TTL_HOURS);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      const serverReceivedAt = new Date().toISOString();

      const relayResult = relayService.deliverDirectMessage({
        recipientUserId: recipient.id,
        recipientDeviceSessionId: input.recipientDeviceSessionId ?? null,
        payload: {
          messageId: input.messageId,
          senderUserId: input.senderUserId,
          senderDeviceSessionId: input.senderSessionId,
          recipientDeviceSessionId: input.recipientDeviceSessionId ?? null,
          messageType: input.messageType,
          ciphertext: input.ciphertext,
          encryptedContentType: input.encryptedContentType,
          clientCreatedAt: input.clientCreatedAt,
          serverReceivedAt,
          expiresAt: null
        }
      });

      if (relayResult.delivered) {
        const pushResult = await pushService.sendDirectMessageNotification({
          recipientUserId: recipient.id
        });

        return {
          messageId: input.messageId,
          recipientUserId: recipient.id,
          recipientDeviceSessionId: relayResult.deliveredSessionIds[0] ?? input.recipientDeviceSessionId ?? null,
          serverReceivedAt,
          expiresAt: null,
          deliveryMode: 'live',
          pushNotification: pushResult
        };
      }

      await client.query(
        `
          insert into direct_messages (
            message_id,
            sender_user_id,
            sender_device_session_id,
            recipient_user_id,
            recipient_device_session_id,
            message_type,
            ciphertext,
            encrypted_content_type,
            client_created_at,
            expires_at
          )
          values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
          on conflict (message_id)
          do nothing
        `,
        [
          input.messageId,
          input.senderUserId,
          input.senderSessionId,
          recipient.id,
          input.recipientDeviceSessionId ?? null,
          input.messageType,
          input.ciphertext,
          input.encryptedContentType,
          input.clientCreatedAt,
          expiresAt.toISOString()
        ]
      );

      const inserted = await client.query<{
        message_id: string;
        recipient_user_id: string;
        recipient_device_session_id: string | null;
        server_received_at: string;
        expires_at: string;
      }>(
        `
          select message_id, recipient_user_id, recipient_device_session_id, server_received_at, expires_at
          from direct_messages
          where message_id = $1::uuid
          limit 1
        `,
        [input.messageId]
      );

      const row = inserted.rows[0];
      const pushResult = await pushService.sendDirectMessageNotification({
        recipientUserId: row.recipient_user_id
      });

      return {
        messageId: row.message_id,
        recipientUserId: row.recipient_user_id,
        recipientDeviceSessionId: row.recipient_device_session_id,
        serverReceivedAt: row.server_received_at,
        expiresAt: row.expires_at,
        deliveryMode: 'queued',
        pushNotification: pushResult
      };
    });
  }

  async fetchInbox(currentUserId: string, sessionId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);

    const result = await pool.query<{
      message_id: string;
      sender_user_id: string;
      sender_device_session_id: string;
      recipient_device_session_id: string | null;
      message_type: string;
      ciphertext: string;
      encrypted_content_type: string;
      client_created_at: string;
      server_received_at: string;
      expires_at: string;
    }>(
      `
        select
          message_id,
          sender_user_id,
          sender_device_session_id,
          recipient_device_session_id,
          message_type,
          ciphertext,
          encrypted_content_type,
          client_created_at,
          server_received_at,
          expires_at
        from direct_messages
        where recipient_user_id = $1
          and expires_at > now()
          and (recipient_device_session_id is null or recipient_device_session_id = $2)
        order by server_received_at asc
        limit $3
      `,
      [currentUserId, sessionId, safeLimit]
    );

    return {
      messages: result.rows.map((row) => ({
        messageId: row.message_id,
        senderUserId: row.sender_user_id,
        senderDeviceSessionId: row.sender_device_session_id,
        recipientDeviceSessionId: row.recipient_device_session_id,
        messageType: row.message_type,
        ciphertext: row.ciphertext,
        encryptedContentType: row.encrypted_content_type,
        clientCreatedAt: row.client_created_at,
        serverReceivedAt: row.server_received_at,
        expiresAt: row.expires_at
      }))
    };
  }

  async acknowledgeMessages(input: AckMessageInput) {
    if (input.messageIds.length === 0) {
      return { deletedCount: 0 };
    }

    const result = await pool.query<{ message_id: string }>(
      `
        delete from direct_messages
        where recipient_user_id = $1
          and (recipient_device_session_id is null or recipient_device_session_id = $2)
          and message_id = any($3::uuid[])
        returning message_id
      `,
      [input.currentUserId, input.recipientSessionId, input.messageIds]
    );

    return {
      deletedCount: result.rowCount ?? 0,
      deletedMessageIds: result.rows.map((row) => row.message_id)
    };
  }
}

export const messagesService = new MessagesService();
