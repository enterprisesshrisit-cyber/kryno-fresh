import { FastifyInstance } from 'fastify';
import {
  acknowledgeMessagesController,
  blockUserController,
  fetchInboxController,
  getConversationSettingsController,
  reportUserController,
  sendMessageController,
  unblockUserController,
  updateConversationSettingsController
} from '../controllers/messages.controller.js';
import { requireAuth } from '../plugins/auth.js';

export async function messagesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/send', sendMessageController);
  app.get('/inbox', fetchInboxController);
  app.post('/ack', acknowledgeMessagesController);
  app.get('/settings/:username', getConversationSettingsController);
  app.put('/settings/:username', updateConversationSettingsController);
  app.post('/block/:username', blockUserController);
  app.post('/unblock/:username', unblockUserController);
  app.post('/report/:username', reportUserController);
}
