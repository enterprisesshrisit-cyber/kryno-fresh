import { FastifyInstance } from 'fastify';
import { registerPushTokenController } from '../controllers/devices.controller.js';
import { requireAuth } from '../plugins/auth.js';

export async function devicesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/push-token', registerPushTokenController);
}
