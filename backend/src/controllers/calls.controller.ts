import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { callsService } from '../services/calls.service.js';

const liveKitTokenSchema = z.object({
  mode: z.enum(['audio', 'video']),
  recipient_lookup: z.string().trim().min(1).max(128).optional(),
  room_name: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/).optional()
});

function parseUrls(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function getIceConfigController(_request: FastifyRequest, reply: FastifyReply) {
  const stunUrls = parseUrls(env.KRYNO_STUN_URLS);
  const turnUrls = parseUrls(env.KRYNO_TURN_URLS);
  const turnUsername = env.KRYNO_TURN_USERNAME?.trim();
  const turnCredential = env.KRYNO_TURN_CREDENTIAL?.trim();

  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = [];

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  } else {
    iceServers.push({ urls: ['stun:stun.l.google.com:19302'] });
  }

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential
    });
  }

  return reply.code(200).send({
    iceServers,
    hasDedicatedTurn: turnUrls.length > 0 && Boolean(turnUsername && turnCredential),
    hasDedicatedStun: stunUrls.length > 0
  });
}

export async function createLiveKitTokenController(request: FastifyRequest, reply: FastifyReply) {
  const body = liveKitTokenSchema.parse(request.body);
  const token = await callsService.createLiveKitToken(
    {
      userId: request.auth.userId,
      sessionId: request.auth.sessionId
    },
    {
      mode: body.mode,
      recipientLookup: body.recipient_lookup,
      roomName: body.room_name
    }
  );

  return reply.code(200).send(token);
}
