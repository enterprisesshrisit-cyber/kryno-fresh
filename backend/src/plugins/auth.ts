import { FastifyReply, FastifyRequest } from 'fastify';
import { errors as joseErrors } from 'jose';
import { pool } from '../db/pool.js';
import { tokenService } from '../services/token.service.js';
import { AppError } from '../utils/errors.js';

type AuthContext = {
  userId: string;
  sessionId: string;
  deviceId: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

function parseBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing bearer access token.', 'MISSING_ACCESS_TOKEN');
  }

  return header.slice('Bearer '.length).trim();
}

export async function authenticateAccessToken(token: string) {
  let payload: Awaited<ReturnType<typeof tokenService.verifyAccessToken>>;

  try {
    payload = await tokenService.verifyAccessToken(token);
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired || (error instanceof Error && error.name === 'JWTExpired')) {
      throw new AppError(401, 'Access token expired. Please refresh your session.', 'ACCESS_TOKEN_EXPIRED');
    }

    if (error instanceof joseErrors.JOSEError) {
      throw new AppError(401, 'Invalid access token.', 'INVALID_ACCESS_TOKEN');
    }

    throw error;
  }

  const sessionResult = await pool.query<{
    user_id: string;
    device_id: string;
    trusted: boolean;
  }>(
    `
      select user_id, device_id, trusted
      from device_sessions
      where id = $1
      limit 1
    `,
    [payload.sid]
  );

  const session = sessionResult.rows[0];

  if (!session || session.user_id !== payload.sub || session.device_id !== payload.did || !session.trusted) {
    throw new AppError(401, 'Invalid device session.', 'INVALID_DEVICE_SESSION');
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    deviceId: payload.did
  };
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const token = parseBearerToken(request);
  request.auth = await authenticateAccessToken(token);
}
