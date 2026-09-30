import { FastifyInstance } from 'fastify';
import { fetchActiveRecipientDeviceController, fetchRecipientBundlesController, uploadBundleController } from '../controllers/keys.controller.js';
import { requireAuth } from '../plugins/auth.js';

export async function keysRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/bundle', uploadBundleController);
  app.get('/:lookup/active', fetchActiveRecipientDeviceController);
  app.get('/:lookup', fetchRecipientBundlesController);
}
