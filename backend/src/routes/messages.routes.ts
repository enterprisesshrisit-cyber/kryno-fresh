import { FastifyInstance } from 'fastify';
import { acknowledgeMessagesController, fetchInboxController, sendMessageController } from '../controllers/messages.controller.js';
import { requireAuth } from '../plugins/auth.js';

export async function messagesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/send', sendMessageController);
  app.get('/inbox', fetchInboxController);
  app.post('/ack', acknowledgeMessagesController);
}
