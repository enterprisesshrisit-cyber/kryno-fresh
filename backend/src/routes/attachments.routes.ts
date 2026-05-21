import { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { downloadAttachmentController, uploadAttachmentController } from '../controllers/attachments.controller.js';

export async function attachmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.post('/upload', uploadAttachmentController);
  app.get('/:attachmentId', downloadAttachmentController);
}
