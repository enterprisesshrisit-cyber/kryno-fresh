import { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { searchUsersController } from '../controllers/users.controller.js';

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/search', searchUsersController);
}
