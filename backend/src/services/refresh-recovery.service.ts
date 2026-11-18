import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { verifyExistingInstallationProof } from './installation-credential.service.js';
import { tokenService } from './token.service.js';

type Owner = { userId: string; sessionId: string; deviceId: string; tokenFamilyId: string };
export type RefreshRecoveryInput = { attemptId: string; installationCredential: string };
type Predecessor = { revoked_at: string | null; replaced_by_token_id: string | null;
  reuse_detected?: boolean; recovery_attempt_digest?: string | null };
const windowMs = 24 * 60 * 60 * 1000;

export function recoveryUnavailable() {
  return new AppError(503, 'Secure sign-in recovery is temporarily unavailable. Please try again.', 'REFRESH_RECOVERY_UNAVAILABLE');
}

function isRecoveryConfigured() {
  return env.AUTH_REFRESH_RECOVERY_ENABLED && !!env.AUTH_REFRESH_RECOVERY_KEY && env.AUTH_REFRESH_RECOVERY_TARGETS.length > 0;
}

export function isRefreshRecoveryTarget(owner: Pick<Owner, 'userId' | 'sessionId' | 'deviceId'>) {
  return isRecoveryConfigured() && env.AUTH_REFRESH_RECOVERY_TARGETS.some(target =>
    target.userId === owner.userId && target.deviceSessionId === owner.sessionId && target.deviceId === owner.deviceId);
}

export function refreshRecoveryAttempt(input: RefreshRecoveryInput, predecessorHash: string) {
  if (!isRecoveryConfigured()) {
    throw recoveryUnavailable();
  }
  return sha256(JSON.stringify([predecessorHash, input.attemptId]));
}

// The caller holds the existing installation lock. This path never enrolls a credential.
export async function verifyRefreshRecoveryOwner(client: PoolClient, owner: Owner, proof: string) {
  await verifyExistingInstallationProof(client, owner.deviceId, proof);
  const result = await client.query(`
    select 1 from push_installation_owners o join device_sessions d on d.id = o.device_session_id
    where o.device_id = $1 and d.id = $2 and d.user_id = $3 and d.device_id = $1 and d.trusted
      and o.token_family_id = $4 and o.retired_at is null`,
  [owner.deviceId, owner.sessionId, owner.userId, owner.tokenFamilyId]);
  if (!result.rows.length) {
    throw new AppError(401, 'Session expired, please login again.', 'REFRESH_RECOVERY_OWNER_CHANGED');
  }
}

export function signRecoverableRefresh(owner: Owner, id: string, attempt: string, issuedAt: number, expiresAt: number) {
  const key = Buffer.from(env.AUTH_REFRESH_RECOVERY_KEY!, 'hex');
  // Derive the existing JWT's opaque field without storing a replacement bearer token.
  const opaque = createHmac('sha384', key)
    .update(JSON.stringify(['kryno.refresh-recovery.v1', attempt, owner.userId, owner.sessionId,
      owner.deviceId, owner.tokenFamilyId, id, issuedAt, expiresAt]))
    .digest('base64url');
  return tokenService.signRefreshToken({ ...owner, refreshRecoveryVersion: 1 }, id, owner.tokenFamilyId,
    { opaque, issuedAt, expiresAt });
}

function digestMatches(left: string | undefined | null, right: string) {
  return !!left && /^[0-9a-f]{64}$/.test(left) && /^[0-9a-f]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function recoverRefresh(client: PoolClient, owner: Owner, prior: Predecessor, attempt: string) {
  if (prior.reuse_detected || !prior.revoked_at || !prior.replaced_by_token_id ||
      !digestMatches(prior.recovery_attempt_digest, attempt)) return null;
  const elapsed = Date.now() - new Date(prior.revoked_at).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) throw recoveryUnavailable();
  if (elapsed >= windowMs) return null;
  const current = await client.query<{ id: string; token_hash: string; issued_at: string; expires_at: string }>(`
    select id, token_hash, issued_at, expires_at from refresh_tokens
    where id = $1 and user_id = $2 and device_session_id = $3 and token_family_id = $4
      and revoked_at is null and replaced_by_token_id is null and not reuse_detected and expires_at > now()
    for update`, [prior.replaced_by_token_id, owner.userId, owner.sessionId, owner.tokenFamilyId]);
  const row = current.rows[0];
  if (!row) return null;
  const issuedAt = new Date(row.issued_at).getTime() / 1000;
  const expiresAt = new Date(row.expires_at).getTime() / 1000;
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) throw recoveryUnavailable();
  const refreshToken = await signRecoverableRefresh(owner, row.id, attempt, issuedAt, expiresAt);
  // A server key or format mismatch is not evidence of reuse by this installation.
  if (!digestMatches(row.token_hash, sha256(refreshToken))) throw recoveryUnavailable();
  return { accessToken: await tokenService.signAccessToken(owner), refreshToken };
}
