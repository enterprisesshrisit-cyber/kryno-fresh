import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { captureException } from './observability.service.js';
import { importPKCS8, SignJWT } from 'jose';
import { readFileSync } from 'node:fs';

type PushTarget = {
  session_id: string;
  push_provider: 'expo' | 'fcm' | string;
  push_token: string;
  push_platform: string | null;
};

type DirectMessagePushInput = {
  recipientUserId: string;
  senderUsername?: string;
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
const FCM_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const UNDEFINED_COLUMN_CODE = '42703';

function isExpoPushToken(value: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value);
}

type FirebaseServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type FirebaseAccessToken = {
  token: string;
  expiresAt: number;
};

let cachedFirebaseConfig: FirebaseServiceAccount | null | undefined;
let cachedFirebaseAccessToken: FirebaseAccessToken | null = null;

function normalizeFirebasePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}

function parseFirebaseServiceAccountJson() {
  let raw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const path = env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  if (!raw && path) {
    try {
      raw = readFileSync(path, 'utf8').trim();
    } catch (error) {
      captureException(error, {
        surface: 'PushService',
        reason: 'firebase_service_account_file_read_failed'
      });
      return null;
    }
  }

  if (!raw) {
    return null;
  }

  const decodeCandidates = [raw];
  if (!raw.startsWith('{')) {
    try {
      decodeCandidates.push(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      // Keep the raw parse attempt below as the source of truth.
    }
  }

  for (const candidate of decodeCandidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: normalizeFirebasePrivateKey(parsed.private_key)
        };
      }
    } catch {
      // Try the next representation.
    }
  }

  return null;
}

function getFirebaseConfig() {
  if (cachedFirebaseConfig !== undefined) {
    return cachedFirebaseConfig;
  }

  const fromJson = parseFirebaseServiceAccountJson();
  const projectId = env.FIREBASE_PROJECT_ID ?? fromJson?.projectId;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL ?? fromJson?.clientEmail;
  const privateKey = env.FIREBASE_PRIVATE_KEY ? normalizeFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY) : fromJson?.privateKey;

  cachedFirebaseConfig = projectId && clientEmail && privateKey
    ? {
        projectId,
        clientEmail,
        privateKey
      }
    : null;

  return cachedFirebaseConfig;
}

async function getFirebaseAccessToken(config: FirebaseServiceAccount) {
  if (cachedFirebaseAccessToken && cachedFirebaseAccessToken.expiresAt - Date.now() > 60_000) {
    return cachedFirebaseAccessToken.token;
  }

  const privateKey = await importPKCS8(config.privateKey, 'RS256');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.clientEmail)
    .setSubject(config.clientEmail)
    .setAudience(FCM_OAUTH_TOKEN_ENDPOINT)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 3600)
    .sign(privateKey);

  const response = await fetch(FCM_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const json = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!response.ok || !json?.access_token) {
    throw new Error(`Firebase auth failed with HTTP ${response.status}${json?.error ? ` (${json.error})` : ''}`);
  }

  cachedFirebaseAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(Number(json.expires_in ?? 3600) - 60, 60) * 1000
  };

  return cachedFirebaseAccessToken.token;
}

function stringifyPushData(data: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)])
  );
}

export class PushService {
  async sendDirectMessageNotification(input: DirectMessagePushInput) {
    const senderLabel = input.senderUsername?.trim();
    return this.sendNotificationToUser({
      recipientUserId: input.recipientUserId,
      excludeSessionIds: input.excludeSessionIds,
      payload: {
        title: 'New Kryno message',
        body: senderLabel ? `${senderLabel} sent you a private message.` : 'You have a new private message.',
        channelId: 'kryno-messages',
        data: {
          type: 'direct_message'
        }
      }
    });
  }

  async sendCallInviteNotification(input: CallInvitePushInput) {
    return this.sendNotificationToUser({
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

  private async sendNotificationToUser(input: {
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
            and push_provider in ('expo', 'fcm')
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

    const targets = result.rows.filter((target) => {
      if (target.push_provider === 'expo') {
        return isExpoPushToken(target.push_token);
      }

      return target.push_provider === 'fcm' && target.push_token.trim().length >= 20;
    });
    if (targets.length === 0) {
      return { attempted: 0, sent: 0 };
    }

    let sent = 0;
    for (const target of targets) {
      try {
        const delivered = target.push_provider === 'fcm'
          ? await this.sendFcmNotification(target, input.payload)
          : await this.sendExpoNotification(target, input.payload);

        if (delivered) {
          sent += 1;
        }
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

  private async sendExpoNotification(target: PushTarget, payload: ExpoPushPayload) {
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
        title: payload.title,
        body: payload.body,
        channelId: payload.channelId,
        priority: 'high',
        ttl: payload.ttlSeconds,
        data: payload.data
      })
    });

    if (!response.ok) {
      captureException(new Error(`Expo push failed with HTTP ${response.status}`), {
        surface: 'PushService',
        provider: target.push_provider,
        platform: target.push_platform ?? 'unknown'
      });
      return false;
    }

    return true;
  }

  private async sendFcmNotification(target: PushTarget, payload: ExpoPushPayload) {
    const config = getFirebaseConfig();
    if (!config) {
      captureException(new Error('Firebase Cloud Messaging service account is not configured.'), {
        surface: 'PushService',
        provider: target.push_provider,
        platform: target.push_platform ?? 'unknown'
      });
      return false;
    }

    const accessToken = await getFirebaseAccessToken(config);
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: target.push_token,
          notification: {
            title: payload.title,
            body: payload.body
          },
          data: stringifyPushData({
            ...payload.data,
            channelId: payload.channelId
          }),
          android: {
            priority: 'HIGH',
            ttl: `${payload.ttlSeconds ?? 3600}s`,
            notification: {
              channel_id: payload.channelId,
              sound: 'default',
              default_vibrate_timings: true,
              visibility: payload.channelId === 'kryno-calls' ? 'PUBLIC' : 'PRIVATE'
            }
          }
        }
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      captureException(new Error(`FCM push failed with HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`), {
        surface: 'PushService',
        provider: target.push_provider,
        platform: target.push_platform ?? 'unknown'
      });
      return false;
    }

    return true;
  }
}

export const pushService = new PushService();
