import { FastifyReply, FastifyRequest } from 'fastify';
import { errors as joseErrors } from 'jose';
import { pool } from '../db/pool.js';
import { tokenService } from '../services/token.service.js';
import { AppError } from '../utils/errors.js';

export type AuthContext = {
  userId: string;
  sessionId: string;
  deviceId: string;
  tokenFamilyId?: string;
  accessExpiresAt?: number;
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

  if (payload.type !== 'access' || !payload.family || !Number.isFinite(payload.exp)) {
    throw new AppError(401, 'Please refresh your session.', 'ACCESS_TOKEN_EXPIRED');
  }

  const sessionResult = await pool.query<{
    user_id: string;
    device_id: string;
    trusted: boolean;
    active_family: boolean;
  }>(
    `
      select d.user_id, d.device_id, d.trusted,
        exists (select 1 from refresh_tokens r where r.device_session_id = d.id
          and r.user_id = d.user_id and r.token_family_id = $2
          and r.revoked_at is null and r.expires_at > now()) as active_family
      from device_sessions d
      where d.id = $1
      limit 1
    `,
    [payload.sid, payload.family]
  );

  const session = sessionResult.rows[0];

  if (!session || session.user_id !== payload.sub || session.device_id !== payload.did || !session.trusted) {
    throw new AppError(401, 'Invalid device session.', 'INVALID_DEVICE_SESSION');
  }
  if (!session.active_family) {
    throw new AppError(401, 'Session expired, please login again.', 'ACCESS_TOKEN_EXPIRED');
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    deviceId: payload.did,
    tokenFamilyId: payload.family,
    accessExpiresAt: payload.exp * 1000
  };
}

export async function assertActiveRelayAuthority(auth: AuthContext) {
  if (!auth.tokenFamilyId || !auth.accessExpiresAt || auth.accessExpiresAt <= Date.now()) {
    throw new AppError(401, 'Please refresh your session.', 'ACCESS_TOKEN_EXPIRED');
  }
  const active = await pool.query(`select d.id from device_sessions d
    where d.id = $1 and d.user_id = $2 and d.device_id = $3 and d.trusted = true
      and exists (select 1 from refresh_tokens r where r.device_session_id = d.id
        and r.user_id = d.user_id and r.token_family_id = $4
        and r.revoked_at is null and r.expires_at > now())`,
  [auth.sessionId, auth.userId, auth.deviceId, auth.tokenFamilyId]);
  if (active.rows.length !== 1) {
    throw new AppError(401, 'Session expired, please login again.', 'ACCESS_TOKEN_EXPIRED');
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const token = parseBearerToken(request);
  request.auth = await authenticateAccessToken(token);
}
