import { FastifyReply, FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { attachmentsService } from '../services/attachments.service.js';
import { AppError } from '../utils/errors.js';
import { sanitizeDownloadFileName } from '../utils/security.js';

const uploadFieldsSchema = z.object({
  recipientLookup: z.string().min(3).max(128),
  recipientDeviceSessionId: z.uuid().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  encryptedSize: z.coerce.number().int().positive(),
  ttlHours: z.coerce.number().int().positive().max(24).optional()
});

const uploadJsonSchema = uploadFieldsSchema.extend({
  encryptedBytesBase64: z.string().min(1)
});

const attachmentParamsSchema = z.object({
  attachmentId: z.uuid()
});

type UploadFieldMap = Record<string, string | MultipartFile | undefined>;

function getFieldString(fields: UploadFieldMap, key: string) {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

export async function uploadAttachmentController(request: FastifyRequest, reply: FastifyReply) {
  if (!request.isMultipart()) {
    const fields = uploadJsonSchema.parse(request.body ?? {});
    let encryptedBytes: Buffer;

    try {
      encryptedBytes = Buffer.from(fields.encryptedBytesBase64, 'base64');
    } catch {
      throw new AppError(400, 'Encrypted attachment payload is not valid base64.', 'INVALID_ATTACHMENT_PAYLOAD');
    }

    if (encryptedBytes.byteLength === 0) {
      throw new AppError(400, 'Encrypted attachment payload is empty.', 'EMPTY_ATTACHMENT_PAYLOAD');
    }

    const result = await attachmentsService.uploadAttachment({
      senderUserId: request.auth.userId,
      senderSessionId: request.auth.sessionId,
      recipientLookup: fields.recipientLookup,
      recipientDeviceSessionId: fields.recipientDeviceSessionId,
      fileName: fields.fileName,
      mimeType: fields.mimeType,
      encryptedSize: fields.encryptedSize,
      ttlHours: fields.ttlHours,
      encryptedBytes
    });

    return reply.code(201).send(result);
  }

  const parts = request.parts();
  const values: UploadFieldMap = {};

  for await (const part of parts) {
    if (part.type === 'file') {
      values[part.fieldname] = part;
    } else {
      values[part.fieldname] = String(part.value ?? '');
    }
  }

  const blob = values.blob;

  if (!blob || typeof blob === 'string') {
    throw new AppError(400, 'Encrypted blob file is required.', 'MISSING_ATTACHMENT_BLOB');
  }

  const fields = uploadFieldsSchema.parse({
    recipientLookup: getFieldString(values, 'recipientLookup'),
    recipientDeviceSessionId: getFieldString(values, 'recipientDeviceSessionId'),
    fileName: getFieldString(values, 'fileName'),
    mimeType: getFieldString(values, 'mimeType'),
    encryptedSize: getFieldString(values, 'encryptedSize'),
    ttlHours: getFieldString(values, 'ttlHours')
  });

  const encryptedBytes = await blob.toBuffer();

  const result = await attachmentsService.uploadAttachment({
    senderUserId: request.auth.userId,
    senderSessionId: request.auth.sessionId,
    recipientLookup: fields.recipientLookup,
    recipientDeviceSessionId: fields.recipientDeviceSessionId,
    fileName: fields.fileName,
    mimeType: fields.mimeType,
    encryptedSize: fields.encryptedSize,
    ttlHours: fields.ttlHours,
    encryptedBytes
  });

  return reply.code(201).send(result);
}

export async function downloadAttachmentController(request: FastifyRequest, reply: FastifyReply) {
  const params = attachmentParamsSchema.parse(request.params);
  const result = await attachmentsService.downloadAttachment(request.auth.userId, request.auth.sessionId, params.attachmentId);
  const safeFileName = sanitizeDownloadFileName(result.fileName);

  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(safeFileName)}.enc"`);
  reply.header('X-Kryno-File-Name', encodeURIComponent(safeFileName));
  reply.header('X-Kryno-Original-Mime', result.mimeType);
  reply.header('X-Kryno-Encrypted-Size', String(result.encryptedSize));

  return reply.send(result.encryptedBytes);
}
