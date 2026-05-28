import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { messagesService } from '../services/messages.service.js';
import { isSignalCiphertextEnvelope } from '../utils/signal-message.js';

export const sendMessageSchema = z
  .object({
    messageId: z.uuid(),
    recipientLookup: z.string().min(3).max(128),
    recipientDeviceSessionId: z.uuid().optional(),
    messageType: z.string().min(1).max(32),
    ciphertext: z.string().min(16),
    encryptedContentType: z.string().min(1).max(32).default('signal'),
    clientCreatedAt: z.iso.datetime(),
    ttlHours: z.number().int().positive().max(24 * 365).optional()
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.encryptedContentType === 'signal' && !isSignalCiphertextEnvelope(body.ciphertext)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ciphertext'],
        message: 'Signal messages must contain a valid encrypted ciphertext envelope.'
      });
    }
  });

const fetchInboxQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional()
});

const acknowledgeSchema = z.object({
  messageIds: z.array(z.uuid()).min(1).max(200)
});

export async function sendMessageController(request: FastifyRequest, reply: FastifyReply) {
  const body = sendMessageSchema.parse(request.body);
  const result = await messagesService.sendMessage({
    messageId: body.messageId,
    senderUserId: request.auth.userId,
    senderSessionId: request.auth.sessionId,
    recipientLookup: body.recipientLookup,
    recipientDeviceSessionId: body.recipientDeviceSessionId,
    messageType: body.messageType,
    ciphertext: body.ciphertext,
    encryptedContentType: body.encryptedContentType,
    clientCreatedAt: body.clientCreatedAt,
    ttlHours: body.ttlHours
  });

  return reply.code(202).send(result);
}

export async function fetchInboxController(request: FastifyRequest, reply: FastifyReply) {
  const query = fetchInboxQuerySchema.parse(request.query);
  const result = await messagesService.fetchInbox(request.auth.userId, request.auth.sessionId, query.limit);
  return reply.code(200).send(result);
}

export async function acknowledgeMessagesController(request: FastifyRequest, reply: FastifyReply) {
  const body = acknowledgeSchema.parse(request.body);
  const result = await messagesService.acknowledgeMessages({
    currentUserId: request.auth.userId,
    recipientSessionId: request.auth.sessionId,
    messageIds: body.messageIds
  });

  return reply.code(200).send(result);
}
