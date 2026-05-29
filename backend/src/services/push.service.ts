import { pool } from '../db/pool.js';
import { captureException } from './observability.service.js';

type PushTarget = {
  session_id: string;
  push_provider: string;
  push_token: string;
  push_platform: string | null;
};

type DirectMessagePushInput = {
  recipientUserId: string;
  excludeSessionIds?: string[];
};

type CallInvitePushInput = {
  recipientUserId: string;
  callerUsername: string;
  callId: string;
  mode: 'audio' | 'video';
};

type ExpoPushPayload = {
  title: string;
  body: string;
  channelId: 'kryno-messages' | 'kryno-calls';
  data: Record<string, string>;
  ttlSeconds?: number;
};

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const UNDEFINED_COLUMN_CODE = '42703';

function isExpoPushToken(value: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value);
}

export class PushService {
  async sendDirectMessageNotification(input: DirectMessagePushInput) {
    return this.sendExpoNotificationToUser({
      recipientUserId: input.recipientUserId,
      excludeSessionIds: input.excludeSessionIds,
      payload: {
        title: 'New Kryno message',
        body: 'You have a new private message.',
        channelId: 'kryno-messages',
        data: {
          type: 'direct_message'
        }
      }
    });
  }

  async sendCallInviteNotification(input: CallInvitePushInput) {
    return this.sendExpoNotificationToUser({
      recipientUserId: input.recipientUserId,
      payload: {
        title: `Incoming Kryno ${input.mode} call`,
        body: `${input.callerUsername} is calling you.`,
        channelId: 'kryno-calls',
        ttlSeconds: 45,
        data: {
          type: 'call_invite',
          callId: input.callId,
          mode: input.mode,
          callerUsername: input.callerUsername
        }
      }
    });
  }

  private async sendExpoNotificationToUser(input: {
    recipientUserId: string;
    excludeSessionIds?: string[];
    payload: ExpoPushPayload;
  }) {
    const excluded = input.excludeSessionIds ?? [];
    let result;
    try {
      result = await pool.query<PushTarget>(
        `
          select id as session_id, push_provider, push_token, push_platform
          from device_sessions
          where user_id = $1
            and trusted = true
            and push_token is not null
            and push_provider = 'expo'
            and not (id = any($2::uuid[]))
          order by push_token_updated_at desc nulls last
          limit 10
        `,
        [input.recipientUserId, excluded]
      );
    } catch (error) {
      if ((error as { code?: string }).code === UNDEFINED_COLUMN_CODE) {
        captureException(error, {
          surface: 'PushService',
          reason: 'device_push_schema_missing'
        });
        return { attempted: 0, sent: 0, disabled: true };
      }

      throw error;
    }

    const targets = result.rows.filter((target) => isExpoPushToken(target.push_token));
    if (targets.length === 0) {
      return { attempted: 0, sent: 0 };
    }

    let sent = 0;
    for (const target of targets) {
      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate'
          },
          body: JSON.stringify({
            to: target.push_token,
            sound: 'default',
            title: input.payload.title,
            body: input.payload.body,
            channelId: input.payload.channelId,
            priority: 'high',
            ttl: input.payload.ttlSeconds,
            data: input.payload.data
          })
        });

        if (response.ok) {
          sent += 1;
          continue;
        }

        captureException(new Error(`Expo push failed with HTTP ${response.status}`), {
          surface: 'PushService',
          provider: target.push_provider,
          platform: target.push_platform ?? 'unknown'
        });
      } catch (error) {
        captureException(error, {
          surface: 'PushService',
          provider: target.push_provider,
          platform: target.push_platform ?? 'unknown'
        });
      }
    }

    return { attempted: targets.length, sent };
  }
}

export const pushService = new PushService();
