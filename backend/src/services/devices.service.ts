import { withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { captureException } from './observability.service.js';
import { sha256 } from '../utils/crypto.js';
import { lockPushInstallation } from './push-ownership.service.js';
import { requireInstallationProof } from './installation-credential.service.js';

type RegisterPushTokenInput = {
  userId: string;
  sessionId: string;
  tokenFamilyId?: string;
  deviceId: string;
  provider: 'expo' | 'fcm';
  pushToken: string;
  platform: 'android' | 'ios' | 'web';
  pushScopeVersion?: 1;
  installationCredential?: string;
};

const MISSING_SCHEMA_CODES = ['42703', '42P01'];

export class DevicesService {
  async registerPushToken(input: RegisterPushTokenInput) {
    if (input.pushScopeVersion && (input.provider !== 'fcm' || input.platform !== 'android')) {
      throw new AppError(400, 'Scoped push requires Android FCM.', 'PUSH_SCOPE_UNSUPPORTED');
    }
    if (!input.tokenFamilyId) {
      // Existing clients already refresh once for this error code. The refreshed
      // access token receives a family claim; do not infer one from a reused session.
      throw new AppError(401, 'Please refresh your session.', 'ACCESS_TOKEN_EXPIRED');
    }
    let result;
    try {
      result = await withTransaction(async (client) => {
        await lockPushInstallation(client, input.deviceId);
        const owner = await client.query<{ generation: string }>(`
          select o.generation from push_installation_owners o
          join device_sessions d on d.id = o.device_session_id
          where o.device_id = $1 and o.device_session_id = $2
            and o.token_family_id = $3 and o.retired_at is null
            and d.user_id = $4 and d.device_id = $1 and d.trusted = true
            and exists (select 1 from refresh_tokens r
              where r.device_session_id = d.id and r.user_id = d.user_id
                and r.token_family_id = o.token_family_id
                and r.revoked_at is null and r.expires_at > now())
        `, [input.deviceId, input.sessionId, input.tokenFamilyId, input.userId]);
        if (!owner.rows[0]) {
          throw new AppError(409, 'Push registration belongs to an inactive sign-in.', 'PUSH_OWNER_CHANGED');
        }
        await requireInstallationProof(client, input.deviceId, input.installationCredential, input.pushScopeVersion === 1);

        // Token serialization plus the partial unique index prevents two
        // installations from claiming the same provider token concurrently.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`push-token:${input.provider}:${sha256(input.pushToken)}`]);
        const collision = await client.query(`select id from device_sessions
          where push_provider = $1 and push_token = $2 and id <> $3
            and push_owner_generation is not null limit 1`,
        [input.provider, input.pushToken, input.sessionId]);
        if (collision.rows[0]) {
          throw new AppError(409, 'Push token is already bound to another sign-in.', 'PUSH_TOKEN_ALREADY_BOUND');
        }

        return client.query<{
          push_provider: string;
          push_platform: string;
          push_token_updated_at: string;
          push_owner_generation: string;
          push_scope_version: number;
        }>(
          `
          update device_sessions
          set
            push_provider = $1,
            push_token = $2,
            push_platform = $3,
            push_owner_generation = $7,
            push_scope_version = $8,
            push_token_updated_at = now(),
            last_seen_at = now(),
            updated_at = now()
          where id = $4
            and user_id = $5
            and device_id = $6
            and trusted = true
          returning push_provider, push_platform, push_token_updated_at, push_owner_generation, push_scope_version
        `,
          [input.provider, input.pushToken, input.platform, input.sessionId, input.userId, input.deviceId,
            owner.rows[0].generation, input.pushScopeVersion ?? 0]
        );
      });
    } catch (error) {
      if (MISSING_SCHEMA_CODES.includes((error as { code?: string }).code ?? '')) {
        captureException(error, {
          surface: 'DevicesService',
          reason: 'device_push_schema_missing'
        });
        return {
          ok: false,
          provider: input.provider,
          platform: input.platform,
          tokenUpdatedAt: null,
          disabled: true
        };
      }

      throw error;
    }

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'Device session was not found or is not trusted.', 'DEVICE_SESSION_NOT_FOUND');
    }

    return {
      ok: true,
      provider: row.push_provider,
      platform: row.push_platform,
      tokenUpdatedAt: row.push_token_updated_at,
      pushGeneration: row.push_owner_generation,
      pushScopeVersion: row.push_scope_version
    };
  }
}

export const devicesService = new DevicesService();
