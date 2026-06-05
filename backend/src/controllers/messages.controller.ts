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

const peerParamsSchema = z.object({
  username: z.string().trim().min(3).max(128)
});

const updateConversationSettingsSchema = z.object({
  themeId: z.string().trim().min(1).max(48).optional(),
  muted: z.boolean().optional(),
  focusMode: z.boolean().optional(),
  privateMode: z.boolean().optional()
}).strict();

const reportUserSchema = z.object({
  category: z.string().trim().min(1).max(64).default('other'),
  description: z.string().trim().max(1000).optional()
}).strict();

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

export async function getConversationSettingsController(request: FastifyRequest, reply: FastifyReply) {
  const params = peerParamsSchema.parse(request.params);
  const result = await messagesService.getConversationSettings(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function updateConversationSettingsController(request: FastifyRequest, reply: FastifyReply) {
  const params = peerParamsSchema.parse(request.params);
  const body = updateConversationSettingsSchema.parse(request.body ?? {});
  const result = await messagesService.updateConversationSettings({
    currentUserId: request.auth.userId,
    peerLookup: params.username,
    themeId: body.themeId,
    muted: body.muted,
    focusMode: body.focusMode,
    privateMode: body.privateMode
  });
  return reply.code(200).send(result);
}

export async function blockUserController(request: FastifyRequest, reply: FastifyReply) {
  const params = peerParamsSchema.parse(request.params);
  const result = await messagesService.blockUser(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function unblockUserController(request: FastifyRequest, reply: FastifyReply) {
  const params = peerParamsSchema.parse(request.params);
  const result = await messagesService.unblockUser(request.auth.userId, params.username);
  return reply.code(200).send(result);
}

export async function reportUserController(request: FastifyRequest, reply: FastifyReply) {
  const params = peerParamsSchema.parse(request.params);
  const body = reportUserSchema.parse(request.body ?? {});
  const result = await messagesService.reportUser({
    currentUserId: request.auth.userId,
    peerLookup: params.username,
    category: body.category,
    description: body.description
  });
  return reply.code(201).send(result);
}
