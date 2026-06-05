import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { captureException } from './observability.service.js';
import { pushService } from './push.service.js';
import { relayService } from './relay.service.js';

const DEFAULT_QUEUE_TTL_HOURS = 24 * 365;
const MAX_TTL_HOURS = 24 * 365;

async function trySendMessagePush(
  recipientUserId: string,
  senderUsername: string | undefined,
  excludeSessionIds: string[] | undefined,
  senderPrivate: boolean
) {
  try {
    return await pushService.sendDirectMessageNotification({
      recipientUserId,
      senderUsername,
      senderPrivate,
      excludeSessionIds
    });
  } catch (error) {
    captureException(error, {
      surface: 'MessagesService',
      reason: 'push_notification_failed'
    });
    return { attempted: 0, sent: 0, failed: true };
  }
}

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

type UpdateConversationSettingsInput = {
  currentUserId: string;
  peerLookup: string;
  themeId?: string;
  muted?: boolean;
  focusMode?: boolean;
  privateMode?: boolean;
};

type ReportUserInput = {
  currentUserId: string;
  peerLookup: string;
  category: string;
  description?: string;
};

export class MessagesService {
  private async resolveUserByLookup(lookup: string) {
    const result = await pool.query<{ id: string; username: string }>(
      `
        select id, username
        from users
        where id::text = $1 or lower(username) = lower($1)
        limit 1
      `,
      [lookup]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    }

    return row;
  }

  private async assertNotBlocked(currentUserId: string, peerUserId: string) {
    const result = await pool.query<{
      blocked: boolean;
      message_visibility: string;
      current_user_follows_peer: boolean;
    }>(
      `
        select
          exists(
            select 1
            from blocked_users
            where (blocker_user_id = $1 and blocked_user_id = $2)
               or (blocker_user_id = $2 and blocked_user_id = $1)
          ) as blocked,
          coalesce(up.message_visibility, 'public') as message_visibility,
          exists(
            select 1
            from follows f
            where f.follower_user_id = $1
              and f.followee_user_id = $2
          ) as current_user_follows_peer
        from users u
        left join user_profiles up on up.user_id = u.id
        where u.id = $2
        limit 1
      `,
      [currentUserId, peerUserId]
    );

    const row = result.rows[0];
    if (row?.blocked) {
      throw new AppError(403, 'You cannot message this account.', 'USER_BLOCKED');
    }

    if (
      row &&
      (row.message_visibility === 'none' ||
        (row.message_visibility === 'followers' && !row.current_user_follows_peer))
    ) {
      throw new AppError(403, 'This user is not accepting messages right now.', 'MESSAGE_NOT_ALLOWED');
    }
  }

  private async getRecipientNotificationPrefs(recipientUserId: string, senderUserId: string) {
    const result = await pool.query<{ muted: boolean; focus_mode: boolean; private_mode: boolean }>(
      `
        select muted, focus_mode, private_mode
        from direct_conversation_settings
        where user_id = $1
          and peer_user_id = $2
        limit 1
      `,
      [recipientUserId, senderUserId]
    );

    return {
      muted: Boolean(result.rows[0]?.muted),
      focusMode: Boolean(result.rows[0]?.focus_mode),
      privateMode: Boolean(result.rows[0]?.private_mode)
    };
  }

  async getConversationSettings(currentUserId: string, peerLookup: string) {
    const peer = await this.resolveUserByLookup(peerLookup);
    if (peer.id === currentUserId) {
      throw new AppError(400, 'Conversation settings need another user.', 'INVALID_PEER');
    }

    const result = await pool.query<{
      theme_id: string;
      muted: boolean;
      focus_mode: boolean;
      private_mode: boolean;
      blocked_by_me: boolean;
      reported_by_me: boolean;
    }>(
      `
        select
          coalesce(dcs.theme_id, 'dark_glass') as theme_id,
          coalesce(dcs.muted, false) as muted,
          coalesce(dcs.focus_mode, false) as focus_mode,
          coalesce(dcs.private_mode, false) as private_mode,
          exists(
            select 1 from blocked_users bu
            where bu.blocker_user_id = $1 and bu.blocked_user_id = $2
          ) as blocked_by_me,
          exists(
            select 1 from user_reports ur
            where ur.reporter_user_id = $1
              and ur.reported_user_id = $2
              and ur.status in ('open', 'reviewing')
          ) as reported_by_me
        from (select $1::uuid as user_id, $2::uuid as peer_user_id) base
        left join direct_conversation_settings dcs
          on dcs.user_id = base.user_id
         and dcs.peer_user_id = base.peer_user_id
      `,
      [currentUserId, peer.id]
    );

    const row = result.rows[0];
    return {
      peerUserId: peer.id,
      peerUsername: peer.username,
      themeId: row?.theme_id ?? 'dark_glass',
      muted: Boolean(row?.muted),
      focusMode: Boolean(row?.focus_mode),
      privateMode: Boolean(row?.private_mode),
      blockedByMe: Boolean(row?.blocked_by_me),
      reportedByMe: Boolean(row?.reported_by_me)
    };
  }

  async updateConversationSettings(input: UpdateConversationSettingsInput) {
    const peer = await this.resolveUserByLookup(input.peerLookup);
    if (peer.id === input.currentUserId) {
      throw new AppError(400, 'Conversation settings need another user.', 'INVALID_PEER');
    }

    await pool.query(
      `
        insert into direct_conversation_settings (
          user_id,
          peer_user_id,
          theme_id,
          muted,
          focus_mode,
          private_mode,
          updated_at
        )
        values ($1, $2, coalesce($3, 'dark_glass'), coalesce($4, false), coalesce($5, false), coalesce($6, false), now())
        on conflict (user_id, peer_user_id) do update set
          theme_id = coalesce($3, direct_conversation_settings.theme_id),
          muted = coalesce($4, direct_conversation_settings.muted),
          focus_mode = coalesce($5, direct_conversation_settings.focus_mode),
          private_mode = coalesce($6, direct_conversation_settings.private_mode),
          updated_at = now()
      `,
      [
        input.currentUserId,
        peer.id,
        input.themeId ?? null,
        input.muted ?? null,
        input.focusMode ?? null,
        input.privateMode ?? null
      ]
    );

    return this.getConversationSettings(input.currentUserId, peer.username);
  }

  async blockUser(currentUserId: string, peerLookup: string) {
    const peer = await this.resolveUserByLookup(peerLookup);
    if (peer.id === currentUserId) {
      throw new AppError(400, 'You cannot block yourself.', 'INVALID_BLOCK_TARGET');
    }

    await pool.query(
      `
        insert into blocked_users (blocker_user_id, blocked_user_id)
        values ($1, $2)
        on conflict do nothing
      `,
      [currentUserId, peer.id]
    );

    return this.getConversationSettings(currentUserId, peer.username);
  }

  async unblockUser(currentUserId: string, peerLookup: string) {
    const peer = await this.resolveUserByLookup(peerLookup);
    if (peer.id === currentUserId) {
      throw new AppError(400, 'You cannot unblock yourself.', 'INVALID_BLOCK_TARGET');
    }

    await pool.query(
      `
        delete from blocked_users
        where blocker_user_id = $1
          and blocked_user_id = $2
      `,
      [currentUserId, peer.id]
    );

    return this.getConversationSettings(currentUserId, peer.username);
  }

  async reportUser(input: ReportUserInput) {
    const peer = await this.resolveUserByLookup(input.peerLookup);
    if (peer.id === input.currentUserId) {
      throw new AppError(400, 'You cannot report yourself.', 'INVALID_REPORT_TARGET');
    }

    const result = await pool.query<{ id: string; created_at: string }>(
      `
        insert into user_reports (
          reporter_user_id,
          reported_user_id,
          category,
          description
        )
        values ($1, $2, $3, $4)
        returning id, created_at
      `,
      [
        input.currentUserId,
        peer.id,
        input.category.trim().slice(0, 64) || 'other',
        (input.description ?? '').trim().slice(0, 1000)
      ]
    );

    return {
      reportId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      reportedUserId: peer.id,
      reportedUsername: peer.username
    };
  }

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
      const senderResult = await client.query<{ username: string }>(
        `
          select username
          from users
          where id = $1
          limit 1
        `,
        [input.senderUserId]
      );
      const senderUsername = senderResult.rows[0]?.username;

      if (!recipient) {
        throw new AppError(404, 'Recipient not found.', 'RECIPIENT_NOT_FOUND');
      }

      if (recipient.id === input.senderUserId) {
        throw new AppError(400, 'Cannot send a direct message to the same account.', 'SELF_MESSAGE_NOT_ALLOWED');
      }

      await this.assertNotBlocked(input.senderUserId, recipient.id);

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
        const notificationPrefs = await this.getRecipientNotificationPrefs(recipient.id, input.senderUserId);
        const pushResult = notificationPrefs.muted || notificationPrefs.focusMode
          ? { attempted: 0, sent: 0, muted: true }
          : await trySendMessagePush(
              recipient.id,
              senderUsername,
              relayResult.deliveredSessionIds,
              notificationPrefs.privateMode
            );

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
      const notificationPrefs = await this.getRecipientNotificationPrefs(row.recipient_user_id, input.senderUserId);
      const pushResult = notificationPrefs.muted || notificationPrefs.focusMode
        ? { attempted: 0, sent: 0, muted: true }
        : await trySendMessagePush(row.recipient_user_id, senderUsername, undefined, notificationPrefs.privateMode);

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
