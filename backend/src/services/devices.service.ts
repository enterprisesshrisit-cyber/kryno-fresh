import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { captureException } from './observability.service.js';

type RegisterPushTokenInput = {
  userId: string;
  sessionId: string;
  deviceId: string;
  provider: 'expo' | 'fcm';
  pushToken: string;
  platform: 'android' | 'ios' | 'web';
};

const UNDEFINED_COLUMN_CODE = '42703';

export class DevicesService {
  async registerPushToken(input: RegisterPushTokenInput) {
    let result;
    try {
      result = await pool.query<{
        push_provider: string;
        push_platform: string;
        push_token_updated_at: string;
      }>(
        `
          update device_sessions
          set
            push_provider = $1,
            push_token = $2,
            push_platform = $3,
            push_token_updated_at = now(),
            last_seen_at = now(),
            updated_at = now()
          where id = $4
            and user_id = $5
            and device_id = $6
            and trusted = true
          returning push_provider, push_platform, push_token_updated_at
        `,
        [input.provider, input.pushToken, input.platform, input.sessionId, input.userId, input.deviceId]
      );
    } catch (error) {
      if ((error as { code?: string }).code === UNDEFINED_COLUMN_CODE) {
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
      tokenUpdatedAt: row.push_token_updated_at
    };
  }
}

export const devicesService = new DevicesService();
