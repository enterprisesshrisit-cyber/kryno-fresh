import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { canAccessDirectAttachment } from '../utils/access-control.js';
import { attachmentStorage } from './object-storage.service.js';

const DEFAULT_ATTACHMENT_TTL_HOURS = 24 * 365;
const MAX_TTL_HOURS = 24 * 365;

type UploadAttachmentInput = {
  senderUserId: string;
  senderSessionId: string;
  recipientLookup: string;
  recipientDeviceSessionId?: string | null;
  fileName: string;
  mimeType: string;
  encryptedSize: number;
  ttlHours?: number | null;
  encryptedBytes: Buffer;
};

export class AttachmentsService {
  async uploadAttachment(input: UploadAttachmentInput) {
    if (input.encryptedBytes.byteLength > env.MAX_ATTACHMENT_BYTES) {
      throw new AppError(413, 'Encrypted attachment exceeds the maximum allowed size.', 'ATTACHMENT_TOO_LARGE');
    }

    return withTransaction(async (client) => {
      const recipientResult = await client.query<{ id: string }>(
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
        throw new AppError(400, 'Cannot send an attachment to the same account.', 'SELF_ATTACHMENT_NOT_ALLOWED');
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

      const attachmentId = randomUUID();
      const ttlHours = Math.min(Math.max(input.ttlHours ?? DEFAULT_ATTACHMENT_TTL_HOURS, 1), MAX_TTL_HOURS);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      const storageKey = `${attachmentId}.bin`;
      await attachmentStorage.putObject({
        key: storageKey,
        bytes: input.encryptedBytes,
        contentType: 'application/octet-stream',
        cacheControl: 'private, max-age=0, no-store'
      });

      await client.query(
        `
          insert into direct_attachments (
            id,
            sender_user_id,
            sender_device_session_id,
            recipient_user_id,
            recipient_device_session_id,
            storage_key,
            original_file_name,
            original_mime_type,
            encrypted_size,
            expires_at
          )
          values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
        `,
        [
          attachmentId,
          input.senderUserId,
          input.senderSessionId,
          recipient.id,
          input.recipientDeviceSessionId ?? null,
          storageKey,
          input.fileName,
          input.mimeType,
          input.encryptedSize,
          expiresAt.toISOString()
        ]
      );

      return {
        attachmentId,
        recipientUserId: recipient.id,
        recipientDeviceSessionId: input.recipientDeviceSessionId ?? null,
        expiresAt: expiresAt.toISOString()
      };
    });
  }

  async downloadAttachment(currentUserId: string, currentSessionId: string, attachmentId: string) {
    const result = await pool.query<{
      id: string;
      sender_user_id: string;
      recipient_user_id: string;
      recipient_device_session_id: string | null;
      storage_key: string;
      original_file_name: string;
      original_mime_type: string;
      encrypted_size: number;
      expires_at: string;
    }>(
      `
        select
          id,
          sender_user_id,
          recipient_user_id,
          recipient_device_session_id,
          storage_key,
          original_file_name,
          original_mime_type,
          encrypted_size,
          expires_at
        from direct_attachments
        where id = $1::uuid
        limit 1
      `,
      [attachmentId]
    );

    const row = result.rows[0];

    if (!row) {
      throw new AppError(404, 'Encrypted attachment not found.', 'ATTACHMENT_NOT_FOUND');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AppError(410, 'Encrypted attachment expired.', 'ATTACHMENT_EXPIRED');
    }

    if (
      !canAccessDirectAttachment({
        currentUserId,
        currentSessionId,
        senderUserId: row.sender_user_id,
        recipientUserId: row.recipient_user_id,
        recipientDeviceSessionId: row.recipient_device_session_id
      })
    ) {
      throw new AppError(403, 'You do not have access to this attachment.', 'ATTACHMENT_ACCESS_DENIED');
    }

    const encryptedBytes = await attachmentStorage.getObject(row.storage_key);

    if (row.recipient_user_id === currentUserId) {
      await pool.query(
        `
          update direct_attachments
          set recipient_downloaded_at = coalesce(recipient_downloaded_at, now())
          where id = $1::uuid
        `,
        [attachmentId]
      );
    }

    return {
      attachmentId: row.id,
      fileName: row.original_file_name,
      mimeType: row.original_mime_type,
      encryptedSize: row.encrypted_size,
      encryptedBytes
    };
  }
}

export const attachmentsService = new AttachmentsService();
