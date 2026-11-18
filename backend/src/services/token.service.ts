import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { generateOpaqueToken } from '../utils/crypto.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

type TokenSubject = {
  userId: string;
  sessionId: string;
  deviceId: string;
  tokenFamilyId?: string;
  refreshRecoveryVersion?: 1;
};

export class TokenService {
  async signAccessToken(subject: TokenSubject): Promise<string> {
    return new SignJWT({ sid: subject.sessionId, did: subject.deviceId, family: subject.tokenFamilyId, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setSubject(subject.userId)
      .setIssuedAt()
      .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
      .sign(accessSecret);
  }

  async signRefreshToken(subject: TokenSubject, tokenId: string, familyId: string,
    fixed?: { opaque: string; issuedAt: number; expiresAt: number }): Promise<string> {
    const opaque = fixed?.opaque ?? generateOpaqueToken(48);
    return new SignJWT({ sid: subject.sessionId, did: subject.deviceId, jti: tokenId, family: familyId, type: 'refresh', opaque,
      ...(subject.refreshRecoveryVersion === 1 ? { rrv: 1 } : {}) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setSubject(subject.userId)
      .setIssuedAt(fixed?.issuedAt)
      .setExpirationTime(fixed?.expiresAt ?? `${env.REFRESH_TOKEN_TTL_DAYS}d`)
      .sign(refreshSecret);
  }

  async verifyRefreshToken(token: string) {
    const { payload } = await jwtVerify(token, refreshSecret, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });
    return payload as {
      sub: string;
      sid: string;
      did: string;
      jti: string;
      family: string;
      type: 'refresh';
      rrv?: 1;
      exp: number;
    };
  }

  async verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });

    return payload as {
      sub: string;
      sid: string;
      did: string;
      type: 'access';
      family?: string;
      exp: number;
    };
  }
}

export const tokenService = new TokenService();
