import { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { createLiveKitTokenController, getIceConfigController } from '../controllers/calls.controller.js';

export async function callsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/ice-config', getIceConfigController);
  app.post('/livekit-token', createLiveKitTokenController);
}
