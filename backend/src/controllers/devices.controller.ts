import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { devicesService } from '../services/devices.service.js';

const pushTokenSchema = z
  .object({
    provider: z.enum(['expo', 'fcm']),
    pushToken: z.string().min(20).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
    deviceId: z.string().min(3).max(128)
  })
  .strict();

export async function registerPushTokenController(request: FastifyRequest, reply: FastifyReply) {
  const body = pushTokenSchema.parse(request.body);
  const result = await devicesService.registerPushToken({
    userId: request.auth.userId,
    sessionId: request.auth.sessionId,
    deviceId: body.deviceId,
    provider: body.provider,
    pushToken: body.pushToken,
    platform: body.platform
  });

  return reply.code(200).send(result);
}
