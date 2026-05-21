import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { usersService } from '../services/users.service.js';

const searchUsersSchema = z.object({
  q: z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}_@.\-\s]+$/u, 'Search contains unsupported characters.')
});

export async function searchUsersController(request: FastifyRequest, reply: FastifyReply) {
  const query = searchUsersSchema.parse(request.query);
  const result = await usersService.searchUsers(request.auth.userId, query.q);
  return reply.code(200).send(result);
}
