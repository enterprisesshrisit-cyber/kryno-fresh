import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { devicesService } from '../services/devices.service.js';
import { AppError } from '../utils/errors.js';

const pushTokenSchema = z
  .object({
    provider: z.enum(['expo', 'fcm']),
    pushToken: z.string().min(20).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
    deviceId: z.string().min(3).max(128),
    pushScopeVersion: z.literal(1).optional(),
    messageNotificationVersion: z.literal(1).optional(),
    installationCredential: z.string().regex(/^[0-9a-f]{64}$/).optional()
  })
  .strict()
  .refine((value) => !value.pushScopeVersion || (value.provider === 'fcm' && value.platform === 'android'),
    'Scoped push requires native Android FCM.')
  .refine((value) => !value.messageNotificationVersion || (value.provider === 'fcm'
    && value.platform === 'android' && value.pushScopeVersion === 1 && !!value.installationCredential),
  'Message notifications require verified scoped Android FCM.');

export async function registerPushTokenController(request: FastifyRequest, reply: FastifyReply) {
  const body = pushTokenSchema.parse(request.body);
  if (body.deviceId !== request.auth.deviceId) {
    throw new AppError(403, 'Push registration does not match this device.', 'DEVICE_MISMATCH');
  }
  const result = await devicesService.registerPushToken({
    userId: request.auth.userId,
    sessionId: request.auth.sessionId,
    tokenFamilyId: request.auth.tokenFamilyId,
    deviceId: body.deviceId,
    provider: body.provider,
    pushToken: body.pushToken,
    platform: body.platform,
    ...(body.installationCredential ? { installationCredential: body.installationCredential } : {}),
    ...(body.pushScopeVersion ? { pushScopeVersion: body.pushScopeVersion } : {}),
    ...(body.messageNotificationVersion ? { messageNotificationVersion: body.messageNotificationVersion } : {})
  });

  request.log?.info({ provider: body.provider, platform: body.platform,
    scopeVersion: result.ok ? result.pushScopeVersion : null, registered: result.ok, requestId: request.id },
  'Push registration completed');

  return reply.code(200).send(result);
}
