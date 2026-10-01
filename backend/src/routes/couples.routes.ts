import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { couplesService, requireCouple } from '../services/couples.service.js';
import { coupleLiveService } from '../services/coupleLive.service.js';
import { messagesService } from '../services/messages.service.js';
import { isSignalCiphertextEnvelope } from '../utils/signal-message.js';
import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { pushService } from '../services/push.service.js';

export const coupleEventSchema = z.object({
  coupleId: z.uuid(), messageId: z.uuid(), recipientDeviceSessionId: z.uuid(),
  ciphertext: z.string().min(16).max(262_144).refine(isSignalCiphertextEnvelope),
  encryptedContentType: z.literal('signal'), clientCreatedAt: z.iso.datetime(),
  liveSessionId: z.uuid().optional()
}).strict();
const idParams = z.object({ id: z.uuid() });
const permissionsSchema = z.object({ trustedScreen: z.boolean().optional(), liveTyping: z.boolean().optional(), screenRequests: z.boolean().optional() }).strict();

export async function couplesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  let sweeping = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    timer = setInterval(() => {
      if (sweeping) return;
      sweeping = true;
      void coupleLiveService.sweep().catch(() => app.log.error({ event: 'couple_cleanup_failed' }, 'Couple session cleanup needs attention')).finally(() => { sweeping = false; });
    }, 5000);
    timer.unref();
  });
  app.addHook('onClose', async () => { if (timer) clearInterval(timer); });
  app.get('/', async (request) => couplesService.current(request.auth.userId));
  app.post('/invitations', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const body = z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/) }).strict().parse(request.body);
    return couplesService.invite(request.auth.userId, body.username);
  });
  app.post('/invitations/:id/respond', async (request) => {
    const body = z.object({ accept: z.boolean() }).strict().parse(request.body);
    return couplesService.respond(request.auth.userId, idParams.parse(request.params).id, body.accept);
  });
  app.delete('/invitations/:id', async (request) => couplesService.cancel(request.auth.userId, idParams.parse(request.params).id));
  app.delete('/', async (request) => couplesService.unlink(request.auth.userId));
  app.post('/events', async (request, reply) => {
    const body = coupleEventSchema.parse(request.body);
    const pair = await requireCouple(pool, request.auth.userId, body.coupleId);
    if (body.liveSessionId) {
      const live = await coupleLiveService.get(request.auth, body.liveSessionId);
      if (live.owner_user_id !== request.auth.userId || live.couple_id !== pair.id || live.status === 'ended' || live.viewer_device_id !== body.recipientDeviceSessionId) throw new AppError(403, 'Sharing session unavailable.', 'LIVE_ACCESS_DENIED');
    }
    return reply.code(202).send(await messagesService.sendMessage({ ...body,
      senderUserId: request.auth.userId, senderSessionId: request.auth.sessionId,
      recipientLookup: pair.partnerId, messageType: 'couple_tool', ttlHours: 24 * 7,
      temporaryControl: !!body.liveSessionId
    }));
  });
  app.get('/permissions', async (request) => coupleLiveService.permissions(request.auth.userId));
  app.patch('/permissions', async (request) => {
    const input = permissionsSchema.parse(request.body);
    const result = await coupleLiveService.updatePermission(request.auth.userId, input);
    app.log.info({ event: 'couple_permissions_changed', userId: request.auth.userId, coupleId: result.coupleId, ...input }, 'Couple permission changed');
    return result;
  });
  app.get('/usage', async (request) => coupleLiveService.usage(request.auth.userId));
  app.get('/live', async (request) => coupleLiveService.list(request.auth));
  app.post('/live', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const body = z.object({ feature: z.enum(['screen', 'typing']) }).strict().parse(request.body);
    const session = await coupleLiveService.create(request.auth, body.feature);
    if (session.feature === 'screen') {
      const grants = await coupleLiveService.permissions(request.auth.userId);
      if (grants.permissions.find((permission) => permission.ownerId === session.owner_user_id)?.screenRequests) {
        void pushService.sendCoupleScreenRequest(session.owner_user_id, session.id)
          .catch(() => app.log.warn({ event: 'couple_screen_push_failed', sessionId: session.id }, 'Screen request notification could not be delivered'));
      }
    }
    app.log.info({ event: 'couple_live_requested', sessionId: session.id, feature: session.feature }, 'Couple live session requested');
    return session;
  });
  app.get('/live/:id', async (request) => coupleLiveService.get(request.auth, idParams.parse(request.params).id));
  app.post('/live/:id/heartbeat', async (request) => coupleLiveService.heartbeat(request.auth, idParams.parse(request.params).id));
  app.post('/live/:id/token', async (request) => coupleLiveService.screenToken(request.auth, idParams.parse(request.params).id));
  app.delete('/live/:id', async (request) => coupleLiveService.end(request.auth, idParams.parse(request.params).id));
  app.post('/live/:id/draft', { bodyLimit: 12_000, config: { rateLimit: { max: 8, timeWindow: '1 second' } } }, async (request) => {
    const body = z.object({ sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), ciphertext: z.string().min(16).max(8000) }).strict().parse(request.body);
    return coupleLiveService.snapshot(request.auth, idParams.parse(request.params).id, body.sequence, body.ciphertext);
  });
}
