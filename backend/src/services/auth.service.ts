import argon2 from 'argon2';
import pg from 'pg';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { emailService } from './email.service.js';
import { tokenService } from './token.service.js';
import { generateOtpCode, hmacSha256, sha256 } from '../utils/crypto.js';
import { SlidingWindowRateLimiter } from '../utils/security.js';

type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
};

type DeviceInput = {
  deviceId: string;
  deviceName?: string | null;
  devicePublicKey: string;
};

type SignupInput = {
  username: string;
  email: string;
  password: string;
} & DeviceInput;

type LoginInput = {
  identifier: string;
  password: string;
} & DeviceInput;

type RefreshInput = {
  refreshToken: string;
  deviceId: string;
};

type LogoutInput = {
  refreshToken: string;
};

type ResendVerificationInput = {
  email: string;
};

type RequestPasswordResetInput = {
  email: string;
};

type ResetPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
};

const OTP_PEPPER = env.OTP_PEPPER ?? env.JWT_REFRESH_SECRET;
const OTP_SEND_WINDOW_MINUTES = 15;
const OTP_SEND_WINDOW_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 8;
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const RESET_REQUEST_LIMIT = 5;
const loginFailureLimiter = new SlidingWindowRateLimiter(LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS);
const passwordResetRequestLimiter = new SlidingWindowRateLimiter(RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW_MS);

function hashOtpCode(purpose: 'verify' | 'reset', userId: string, code: string) {
  return hmacSha256(`${purpose}:${userId}:${code.trim()}`, OTP_PEPPER);
}

function loginLimitKey(identifier: string, ip: string | null) {
  return `login:${identifier}:${ip ?? 'unknown'}`;
}

function resetLimitKey(email: string, ip: string | null) {
  return `reset:${email}:${ip ?? 'unknown'}`;
}

function mapDbError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }

  if (error instanceof pg.DatabaseError) {
    if (error.code === '23505') {
      throw new AppError(409, 'Username or email already exists.', 'CONFLICT');
    }
  }

  throw error;
}

async function upsertDeviceSession(
  client: pg.PoolClient,
  userId: string,
  device: DeviceInput,
  meta: RequestMeta
) {
  const existingSession = await client.query<{ id: string }>(
    `
      select id
      from device_sessions
      where user_id = $1
        and device_id = $2
      limit 1
    `,
    [userId, device.deviceId]
  );

  const result = await client.query<{
    id: string;
  }>(
    `
      insert into device_sessions (
        user_id,
        device_id,
        device_name,
        device_public_key,
        trusted,
        last_seen_at,
        last_seen_ip,
        last_seen_user_agent,
        updated_at
      )
      values ($1, $2, $3, $4, true, now(), $5::inet, $6, now())
      on conflict (user_id, device_id)
      do update set
        device_name = excluded.device_name,
        device_public_key = excluded.device_public_key,
        trusted = true,
        last_seen_at = now(),
        last_seen_ip = excluded.last_seen_ip,
        last_seen_user_agent = excluded.last_seen_user_agent,
        updated_at = now()
      returning id
    `,
    [userId, device.deviceId, device.deviceName ?? null, device.devicePublicKey, meta.ip, meta.userAgent]
  );

  return {
    sessionId: result.rows[0].id,
    isNewDevice: !existingSession.rows[0]
  };
}

async function createRefreshSession(
  client: pg.PoolClient,
  userId: string,
  sessionId: string,
  deviceId: string,
  meta: RequestMeta
) {
  const tokenId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const refreshToken = await tokenService.signRefreshToken({ userId, sessionId, deviceId }, tokenId, familyId);
  const refreshHash = sha256(refreshToken);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await client.query(
    `
      insert into refresh_tokens (
        id,
        user_id,
        device_session_id,
        token_family_id,
        token_hash,
        expires_at,
        created_by_ip,
        user_agent
      )
      values ($1, $2, $3, $4, $5, $6, $7::inet, $8)
    `,
    [tokenId, userId, sessionId, familyId, refreshHash, expiresAt.toISOString(), meta.ip, meta.userAgent]
  );

  const accessToken = await tokenService.signAccessToken({ userId, sessionId, deviceId });

  return { accessToken, refreshToken };
}

async function createEmailVerificationCode(client: pg.PoolClient, userId: string) {
  const verificationCode = generateOtpCode(6);
  const verificationCodeHash = hashOtpCode('verify', userId, verificationCode);
  const verificationExpiresAt = new Date(Date.now() + env.EMAIL_OTP_TTL_MINUTES * 60 * 1000);

  const throttleLookup = await client.query<{ send_count: string }>(
    `
      select count(*)::text as send_count
      from email_verification_tokens
      where user_id = $1
        and created_at > now() - ($2::text || ' minutes')::interval
    `,
    [userId, OTP_SEND_WINDOW_MINUTES]
  );

  if (Number(throttleLookup.rows[0]?.send_count ?? 0) >= OTP_SEND_WINDOW_LIMIT) {
    throw new AppError(429, 'Too many verification codes requested. Please wait a few minutes.', 'VERIFICATION_RATE_LIMITED');
  }

  await client.query(
    `
      update email_verification_tokens
      set consumed_at = coalesce(consumed_at, now())
      where user_id = $1
        and consumed_at is null
        and expires_at > now()
    `,
    [userId]
  );

  await client.query(
    `
      insert into email_verification_tokens (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [userId, verificationCodeHash, verificationExpiresAt.toISOString()]
  );

  return verificationCode;
}

async function createPasswordResetCode(client: pg.PoolClient, userId: string) {
  const resetCode = generateOtpCode(6);
  const resetCodeHash = hashOtpCode('reset', userId, resetCode);
  const resetExpiresAt = new Date(Date.now() + env.RESET_PASSWORD_OTP_TTL_MINUTES * 60 * 1000);

  const throttleLookup = await client.query<{ send_count: string }>(
    `
      select count(*)::text as send_count
      from password_reset_tokens
      where user_id = $1
        and created_at > now() - ($2::text || ' minutes')::interval
    `,
    [userId, OTP_SEND_WINDOW_MINUTES]
  );

  if (Number(throttleLookup.rows[0]?.send_count ?? 0) >= OTP_SEND_WINDOW_LIMIT) {
    throw new AppError(429, 'Too many password reset codes requested. Please wait a few minutes.', 'RESET_RATE_LIMITED');
  }

  await client.query(
    `
      update password_reset_tokens
      set consumed_at = coalesce(consumed_at, now())
      where user_id = $1
        and consumed_at is null
        and expires_at > now()
    `,
    [userId]
  );

  await client.query(
    `
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [userId, resetCodeHash, resetExpiresAt.toISOString()]
  );

  return resetCode;
}

export class AuthService {
  async signup(input: SignupInput, meta: RequestMeta) {
    try {
      const passwordHash = await argon2.hash(input.password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1
      });

      const result = await withTransaction(async (client) => {
        const userInsert = await client.query<{ id: string; username: string; email: string }>(
          `
            insert into users (username, email, password_hash)
            values ($1, $2, $3)
            returning id, username, email
          `,
          [input.username, input.email.toLowerCase(), passwordHash]
        );

        const user = userInsert.rows[0];

        const verificationCode = await createEmailVerificationCode(client, user.id);

        await client.query(
          `
            insert into user_profiles (user_id, display_name)
            values ($1, $2)
            on conflict (user_id) do nothing
          `,
          [user.id, user.username]
        );

        await upsertDeviceSession(client, user.id, input, meta);

        return { ...user, verificationCode };
      });

      const verificationEmailSent = await emailService.sendVerificationEmail(result.email, result.verificationCode);

      return {
        userId: result.id,
        username: result.username,
        email: result.email,
        emailVerified: false,
        verificationEmailSent,
        verificationCodePreview:
          env.APP_ENV === 'development' && env.ALLOW_DEV_EMAIL_TOKEN_PREVIEW ? result.verificationCode : undefined
      };
    } catch (error) {
      mapDbError(error);
    }
  }

  async verifyEmail(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await withTransaction(async (client) => {
      const userLookup = await client.query<{ id: string; email_verified_at: string | null }>(
        `
          select id, email_verified_at
          from users
          where lower(email) = $1
          limit 1
        `,
        [normalizedEmail]
      );

      const user = userLookup.rows[0];
      if (!user) {
        throw new AppError(400, 'Invalid email verification code.', 'INVALID_CODE');
      }

      if (user.email_verified_at) {
        return { verified: true };
      }

      const lookup = await client.query<{ id: string; user_id: string; token_hash: string; expires_at: string; consumed_at: string | null; attempt_count: number }>(
        `
          select id, user_id, token_hash, expires_at, consumed_at, attempt_count
          from email_verification_tokens
          where user_id = $1
          order by created_at desc
          limit 1
          for update
        `,
        [user.id]
      );

      const row = lookup.rows[0];
      if (!row) {
        throw new AppError(400, 'No active verification code found for this email.', 'MISSING_CODE');
      }

      if (row.consumed_at) {
        throw new AppError(400, 'This verification code has already been used. Request a new one.', 'CODE_USED');
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new AppError(400, 'This verification code has expired. Request a new one.', 'CODE_EXPIRED');
      }

      if (row.attempt_count >= 5) {
        throw new AppError(429, 'Too many incorrect verification attempts. Request a new code.', 'CODE_ATTEMPTS_EXCEEDED');
      }

      const tokenHash = hashOtpCode('verify', user.id, code);
      if (row.token_hash !== tokenHash) {
        await client.query(
          `
            update email_verification_tokens
            set attempt_count = attempt_count + 1
            where id = $1
          `,
          [row.id]
        );
        throw new AppError(400, 'Invalid email verification code.', 'INVALID_CODE');
      }

      await client.query('update users set email_verified_at = now(), updated_at = now() where id = $1', [row.user_id]);
      await client.query('update email_verification_tokens set consumed_at = now() where id = $1', [row.id]);

      return { verified: true };
    });

    return result;
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const identifier = input.identifier.trim().toLowerCase();
    const limiterKey = loginLimitKey(identifier, meta.ip);
    const loginThrottle = loginFailureLimiter.hit(limiterKey);

    if (!loginThrottle.allowed) {
      throw new AppError(
        429,
        `Too many login attempts. Try again in about ${loginThrottle.retryAfterSeconds} seconds.`,
        'LOGIN_RATE_LIMITED'
      );
    }

    const userQuery = await pool.query<{
      id: string;
      username: string;
      email: string;
      password_hash: string;
      email_verified_at: string | null;
    }>(
      `
        select id, username, email, password_hash, email_verified_at
        from users
        where lower(email) = $1 or lower(username) = $1
        limit 1
      `,
      [identifier]
    );

    const user = userQuery.rows[0];
    if (!user) {
      throw new AppError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }

    const validPassword = await argon2.verify(user.password_hash, input.password);
    if (!validPassword) {
      throw new AppError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }

    loginFailureLimiter.reset(limiterKey);

    if (!user.email_verified_at) {
      throw new AppError(403, 'Email verification required before login.', 'EMAIL_NOT_VERIFIED');
    }

    const loginResult = await withTransaction(async (client) => {
      const deviceSession = await upsertDeviceSession(client, user.id, input, meta);
      const tokens = await createRefreshSession(client, user.id, deviceSession.sessionId, input.deviceId, meta);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        ...tokens,
        securityAlert: {
          newDevice: deviceSession.isNewDevice
        }
      };
    });

    if (loginResult.securityAlert.newDevice) {
      void emailService.sendSecurityAlertEmail(user.email, {
        username: user.username,
        deviceName: input.deviceName,
        ip: meta.ip,
        userAgent: meta.userAgent,
        occurredAt: new Date()
      });
    }

    return loginResult;
  }

  async refresh(input: RefreshInput, meta: RequestMeta) {
    const payload = await tokenService.verifyRefreshToken(input.refreshToken);
    const refreshHash = sha256(input.refreshToken);

    return withTransaction(async (client) => {
      const tokenResult = await client.query<{
        id: string;
        user_id: string;
        device_session_id: string;
        token_family_id: string;
        token_hash: string;
        expires_at: string;
        revoked_at: string | null;
        replaced_by_token_id: string | null;
      }>(
        `
          select id, user_id, device_session_id, token_family_id, token_hash, expires_at, revoked_at, replaced_by_token_id
          from refresh_tokens
          where token_hash = $1
          for update
        `,
        [refreshHash]
      );

      const existing = tokenResult.rows[0];
      if (!existing) {
        throw new AppError(401, 'Invalid refresh token.', 'INVALID_REFRESH_TOKEN');
      }

      if (existing.revoked_at || existing.replaced_by_token_id) {
        await client.query(
          'update refresh_tokens set reuse_detected = true, revoked_at = coalesce(revoked_at, now()) where token_family_id = $1',
          [existing.token_family_id]
        );
        throw new AppError(401, 'Refresh token reuse detected.', 'REFRESH_REUSE_DETECTED');
      }

      if (new Date(existing.expires_at).getTime() < Date.now()) {
        throw new AppError(401, 'Refresh token expired.', 'REFRESH_EXPIRED');
      }

      const sessionResult = await client.query<{ id: string; device_id: string }>(
        'select id, device_id from device_sessions where id = $1 and user_id = $2 for update',
        [existing.device_session_id, payload.sub]
      );

      const session = sessionResult.rows[0];
      if (!session || session.device_id !== input.deviceId) {
        throw new AppError(401, 'Refresh token does not match this device.', 'DEVICE_MISMATCH');
      }

      const replacementTokenId = crypto.randomUUID();
      const replacementRefreshToken = await tokenService.signRefreshToken(
        { userId: payload.sub, sessionId: existing.device_session_id, deviceId: session.device_id },
        replacementTokenId,
        existing.token_family_id
      );
      const replacementHash = sha256(replacementRefreshToken);
      const replacementExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      await client.query(
        `
          insert into refresh_tokens (
            id,
            user_id,
            device_session_id,
            token_family_id,
            token_hash,
            expires_at,
            created_by_ip,
            user_agent
          )
          values ($1, $2, $3, $4, $5, $6, $7::inet, $8)
        `,
        [
          replacementTokenId,
          payload.sub,
          existing.device_session_id,
          existing.token_family_id,
          replacementHash,
          replacementExpiresAt.toISOString(),
          meta.ip,
          meta.userAgent
        ]
      );

      await client.query(
        `
          update refresh_tokens
          set revoked_at = now(),
              replaced_by_token_id = $2
          where id = $1
        `,
        [existing.id, replacementTokenId]
      );

      await client.query(
        `
          update device_sessions
          set last_seen_at = now(),
              last_seen_ip = $2::inet,
              last_seen_user_agent = $3,
              updated_at = now()
          where id = $1
        `,
        [existing.device_session_id, meta.ip, meta.userAgent]
      );

      const accessToken = await tokenService.signAccessToken({
        userId: payload.sub,
        sessionId: existing.device_session_id,
        deviceId: session.device_id
      });

      return {
        accessToken,
        refreshToken: replacementRefreshToken
      };
    });
  }

  async logout(input: LogoutInput) {
    const refreshHash = sha256(input.refreshToken);

    await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        'select id from refresh_tokens where token_hash = $1 for update',
        [refreshHash]
      );

      if (result.rows[0]) {
        await client.query('update refresh_tokens set revoked_at = now() where id = $1', [result.rows[0].id]);
      }
    });

    return { success: true };
  }

  async resendVerification(input: ResendVerificationInput) {
    const email = input.email.trim().toLowerCase();
    const userResult = await pool.query<{ id: string; email: string; email_verified_at: string | null }>(
      `
        select id, email, email_verified_at
        from users
        where lower(email) = $1
        limit 1
      `,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return { success: true };
    }

    if (user.email_verified_at) {
      return { success: true };
    }

    const verificationCode = await withTransaction(async (client) => createEmailVerificationCode(client, user.id));

    const verificationEmailSent = await emailService.sendVerificationEmail(user.email, verificationCode);

    return {
      success: true,
      verificationEmailSent,
      verificationCodePreview:
        env.APP_ENV === 'development' && env.ALLOW_DEV_EMAIL_TOKEN_PREVIEW ? verificationCode : undefined
    };
  }

  async requestPasswordReset(input: RequestPasswordResetInput, meta: RequestMeta) {
    const email = input.email.trim().toLowerCase();
    const resetThrottle = passwordResetRequestLimiter.hit(resetLimitKey(email, meta.ip));

    if (!resetThrottle.allowed) {
      throw new AppError(
        429,
        `Too many password reset requests. Try again in about ${resetThrottle.retryAfterSeconds} seconds.`,
        'RESET_RATE_LIMITED'
      );
    }

    const userResult = await pool.query<{ id: string; email: string }>(
      `
        select id, email
        from users
        where lower(email) = $1
        limit 1
      `,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return { success: true };
    }

    const resetCode = await withTransaction(async (client) => createPasswordResetCode(client, user.id));
    const resetEmailSent = await emailService.sendPasswordResetEmail(user.email, resetCode);

    return {
      success: true,
      resetEmailSent,
      resetCodePreview:
        env.APP_ENV === 'development' && env.ALLOW_DEV_EMAIL_TOKEN_PREVIEW ? resetCode : undefined
    };
  }

  async resetPassword(input: ResetPasswordInput) {
    const email = input.email.trim().toLowerCase();

    return withTransaction(async (client) => {
      const userLookup = await client.query<{ id: string }>(
        `
          select id
          from users
          where lower(email) = $1
          limit 1
        `,
        [email]
      );

      const user = userLookup.rows[0];
      if (!user) {
        throw new AppError(400, 'Invalid password reset code.', 'INVALID_RESET_CODE');
      }

      const lookup = await client.query<{
        id: string;
        user_id: string;
        token_hash: string;
        expires_at: string;
        consumed_at: string | null;
        attempt_count: number;
      }>(
        `
          select id, user_id, token_hash, expires_at, consumed_at, attempt_count
          from password_reset_tokens
          where user_id = $1
          order by created_at desc
          limit 1
          for update
        `,
        [user.id]
      );

      const row = lookup.rows[0];
      if (!row) {
        throw new AppError(400, 'No active reset code found for this email.', 'MISSING_RESET_CODE');
      }

      if (row.consumed_at) {
        throw new AppError(400, 'This reset code has already been used. Request a new one.', 'RESET_CODE_USED');
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new AppError(400, 'This reset code has expired. Request a new one.', 'RESET_CODE_EXPIRED');
      }

      if (row.attempt_count >= 5) {
        throw new AppError(429, 'Too many incorrect reset attempts. Request a new code.', 'RESET_ATTEMPTS_EXCEEDED');
      }

      const tokenHash = hashOtpCode('reset', user.id, input.code);
      if (row.token_hash !== tokenHash) {
        await client.query(
          `
            update password_reset_tokens
            set attempt_count = attempt_count + 1
            where id = $1
          `,
          [row.id]
        );
        throw new AppError(400, 'Invalid password reset code.', 'INVALID_RESET_CODE');
      }

      const passwordHash = await argon2.hash(input.newPassword, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1
      });

      await client.query('update users set password_hash = $2, updated_at = now() where id = $1', [row.user_id, passwordHash]);
      await client.query('update password_reset_tokens set consumed_at = now() where id = $1', [row.id]);
      await client.query('update refresh_tokens set revoked_at = coalesce(revoked_at, now()) where user_id = $1 and revoked_at is null', [
        row.user_id
      ]);

      return { success: true };
    });
  }
}

export const authService = new AuthService();
