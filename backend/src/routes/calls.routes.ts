import { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  acceptLiveKitCallController,
  endLiveKitCallController,
  getLiveKitCallStatusController,
  createLiveKitTokenController,
  getIceConfigController
} from '../controllers/calls.controller.js';

export async function callsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/ice-config', getIceConfigController);
  app.post('/accept', acceptLiveKitCallController);
  app.post('/end', endLiveKitCallController);
  app.get('/:callId/status', getLiveKitCallStatusController);
  app.post('/livekit-token', createLiveKitTokenController);
}
