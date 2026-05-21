import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'new_password',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'code',
  'otp',
  'device_public_key',
  'encryptedBytesBase64',
  'bytesBase64',
  'ciphertext',
  'token'
];

function scrubSensitiveData(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrubSensitiveData(entry));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey.toLowerCase()))) {
        return [key, '[Filtered]'];
      }

      return [key, scrubSensitiveData(entry)];
    })
  );
}

export function initObservability() {
  if (!env.SENTRY_DSN || Sentry.isInitialized()) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV,
    tracesSampleRate: env.APP_ENV === 'production' ? 0.1 : 0,
    sendDefaultPii: false,
    beforeSend(event) {
      event.request = scrubSensitiveData(event.request) as typeof event.request;
      event.contexts = scrubSensitiveData(event.contexts) as typeof event.contexts;
      event.extra = scrubSensitiveData(event.extra) as typeof event.extra;
      event.user = event.user
        ? {
            id: event.user.id
          }
        : undefined;
      return event;
    }
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!env.SENTRY_DSN || !Sentry.isInitialized()) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('kryno', context);
    }

    Sentry.captureException(error);
  });
}

export async function flushObservability() {
  if (!env.SENTRY_DSN || !Sentry.isInitialized()) {
    return;
  }

  await Sentry.flush(2000);
}
