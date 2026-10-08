import { timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AppError } from '../utils/errors.js';
import { sha256 } from '../utils/crypto.js';

function credentialHash(credential: string) {
  if (!/^[0-9a-f]{64}$/.test(credential)) {
    throw new AppError(400, 'Installation verification is required.', 'INSTALLATION_PROOF_REQUIRED');
  }
  return sha256(credential);
}

async function storedHash(client: PoolClient, deviceId: string) {
  const result = await client.query<{ credential_hash: string }>(
    'select credential_hash from push_installation_credentials where device_id = $1 for update', [deviceId]);
  return result.rows[0]?.credential_hash;
}

function verifyHash(stored: string, actual: string) {
  if (!/^[0-9a-f]{64}$/.test(stored) || !timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(actual, 'hex'))) {
    throw new AppError(403, 'This installation could not be verified. Your saved data has not been reset.',
      'INSTALLATION_PROOF_MISMATCH');
  }
}

// Caller holds the installation lock. Registration may enroll only after the
// current signed login family has been verified by DevicesService.
export async function verifyOrEnrollInstallation(client: PoolClient, deviceId: string, credential: string) {
  const actual = credentialHash(credential);
  const stored = await storedHash(client, deviceId);
  if (stored) verifyHash(stored, actual);
  else await client.query('insert into push_installation_credentials (device_id, credential_hash) values ($1,$2)',
    [deviceId, actual]);
}

export async function requireInstallationProof(client: PoolClient, deviceId: string, credential?: string, scoped = false) {
  if (credential) return verifyOrEnrollInstallation(client, deviceId, credential);
  if (scoped || await storedHash(client, deviceId)) {
    throw new AppError(400, 'Installation verification is required. Please update the app.', 'INSTALLATION_PROOF_REQUIRED');
  }
}

// Password authentication alone does not prove ownership of somebody else's
// installation ID. Legacy logins may authenticate, but cannot move push authority.
export async function authorizePushLogin(client: PoolClient, userId: string, deviceId: string, credential?: string) {
  if (!credential) return false;
  const actual = credentialHash(credential);
  const stored = await storedHash(client, deviceId);
  if (stored) {
    verifyHash(stored, actual);
    return true;
  }
  const owner = await client.query<{ user_id: string }>(`select d.user_id from push_installation_owners o
    join device_sessions d on d.id = o.device_session_id where o.device_id = $1`, [deviceId]);
  const other = await client.query(`select id from device_sessions where device_id = $1 and user_id <> $2 limit 1`,
    [deviceId, userId]);
  if ((owner.rows[0] && owner.rows[0].user_id !== userId) || (!owner.rows[0] && other.rows[0])) {
    throw new AppError(409, 'Sign in to the original account first to verify this installation.',
      'INSTALLATION_ENROLLMENT_REQUIRED');
  }
  await client.query('insert into push_installation_credentials (device_id, credential_hash) values ($1,$2)',
    [deviceId, actual]);
  return true;
}
