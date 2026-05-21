import * as Sentry from '@sentry/react-native';

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
  'deviceSeed',
  'device_public_key',
  'mediaEncryptionKey',
  'bytesBase64',
  'ciphertext',
  'token'
];

function scrub(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey.toLowerCase()))) {
        return [key, '[Filtered]'];
      }

      return [key, scrub(entry)];
    })
  );
}

export function initMobileObservability() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_KRYNO_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: process.env.EXPO_PUBLIC_KRYNO_ENV === 'production' ? 0.1 : 0,
    beforeSend(event) {
      event.contexts = scrub(event.contexts) as typeof event.contexts;
      event.extra = scrub(event.extra) as typeof event.extra;
      event.request = scrub(event.request) as typeof event.request;
      event.user = event.user?.id ? { id: event.user.id } : undefined;
      return event;
    }
  });
}

export function captureMobileException(error: unknown, context?: Record<string, unknown>) {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('kryno', scrub(context) as Record<string, unknown>);
    }

    Sentry.captureException(error);
  });
}
