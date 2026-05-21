import { FastifyInstance } from 'fastify';
import { myEntitlementController, revenueCatWebhookController } from '../controllers/billing.controller.js';
import { requireAuth } from '../plugins/auth.js';

export async function billingRoutes(app: FastifyInstance) {
  app.post('/revenuecat/webhook', revenueCatWebhookController);
  app.get('/me', { preHandler: requireAuth }, myEntitlementController);
}
